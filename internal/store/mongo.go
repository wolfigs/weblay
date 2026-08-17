package store

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/wolfigs/weblay/internal/config"
)

func sortMembersByEmail(members []*Member) {
	sort.Slice(members, func(i, j int) bool { return members[i].Email < members[j].Email })
}

// mongoStore is the MongoDB-backed implementation of Store.
//
// Content that is keyed by CSS selector (element drafts, published content, and
// full manifests) is stored as JSON strings, never as native BSON documents:
// selectors contain '.', '>' and ':' which are invalid as BSON field names.
// This also keeps the draft/published comparison logic identical to the SQL
// backend (compare the two JSON strings).
type mongoStore struct {
	client *mongo.Client
	db     *mongo.Database
}

// Collections.
const (
	colUsers      = "users"
	colSessions   = "sessions"
	colSites      = "sites"
	colMembers    = "site_members"
	colPages      = "pages"
	colElements   = "elements"
	colRevisions  = "revisions"
	colEditTokens = "edit_tokens"
	colAssets     = "assets"
	colBindings   = "binding_health"
	colEmailToks  = "email_tokens"
	colPreviewTok = "preview_tokens"
)

func openMongo(cfg *config.Config) (Store, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.DSN))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}
	s := &mongoStore{client: client, db: client.Database(cfg.DBName)}
	if err := s.ensureIndexes(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *mongoStore) Kind() string { return "mongodb" }

func (s *mongoStore) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.client.Disconnect(ctx)
}

func (s *mongoStore) col(name string) *mongo.Collection { return s.db.Collection(name) }

// ensureIndexes creates the unique constraints the schema relies on. TTL
// indexes on expiry mirror (and back up) PruneExpired.
func (s *mongoStore) ensureIndexes(ctx context.Context) error {
	uniq := func(keys bson.D) mongo.IndexModel {
		return mongo.IndexModel{Keys: keys, Options: options.Index().SetUnique(true)}
	}
	specs := map[string][]mongo.IndexModel{
		colUsers:    {uniq(bson.D{{Key: "email", Value: 1}})},
		colSites:    {uniq(bson.D{{Key: "site_key", Value: 1}})},
		colMembers:  {uniq(bson.D{{Key: "site_id", Value: 1}, {Key: "user_id", Value: 1}})},
		colPages:    {uniq(bson.D{{Key: "site_id", Value: 1}, {Key: "path", Value: 1}})},
		colElements: {uniq(bson.D{{Key: "page_id", Value: 1}, {Key: "selector", Value: 1}}), {Keys: bson.D{{Key: "page_id", Value: 1}}}},
		colBindings: {uniq(bson.D{{Key: "page_id", Value: 1}, {Key: "selector", Value: 1}}), {Keys: bson.D{{Key: "site_id", Value: 1}}}},
		colRevisions: {
			uniq(bson.D{{Key: "page_id", Value: 1}, {Key: "version", Value: 1}}),
			{Keys: bson.D{{Key: "page_id", Value: 1}}},
		},
		colSessions:   {{Keys: bson.D{{Key: "expires_at", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)}},
		colEditTokens: {{Keys: bson.D{{Key: "expires_at", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)}},
	}
	for name, models := range specs {
		if _, err := s.col(name).Indexes().CreateMany(ctx, models); err != nil {
			return err
		}
	}
	return nil
}

func mongoNotFound(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	return err
}

// --- Users & auth ---

type mUser struct {
	ID            string    `bson:"_id"`
	Email         string    `bson:"email"`
	Name          string    `bson:"name"`
	PasswordHash  string    `bson:"password_hash"`
	Role          string    `bson:"role"`
	Permissions   []string  `bson:"permissions"`
	EmailVerified bool      `bson:"email_verified"`
	TOTPSecret    string    `bson:"totp_secret"`
	TOTPEnabled   bool      `bson:"totp_enabled"`
	RecoveryCodes []string  `bson:"recovery_codes"`
	CreatedAt     time.Time `bson:"created_at"`
}

func (u mUser) toUser() *User {
	return &User{
		ID: u.ID, Email: u.Email, Name: u.Name, PasswordHash: u.PasswordHash, Role: u.Role,
		Permissions: u.Permissions, EmailVerified: u.EmailVerified, TOTPSecret: u.TOTPSecret,
		TOTPEnabled: u.TOTPEnabled, RecoveryCodes: u.RecoveryCodes, CreatedAt: u.CreatedAt.UTC(),
	}
}

func (s *mongoStore) CountUsers(ctx context.Context) (int, error) {
	// Exact count: this gates first-run setup, so it must not be approximate.
	n, err := s.col(colUsers).CountDocuments(ctx, bson.M{})
	return int(n), err
}

func (s *mongoStore) CreateUser(ctx context.Context, u *User) error {
	u.Email = strings.ToLower(strings.TrimSpace(u.Email))
	perms := u.Permissions
	if perms == nil {
		perms = []string{}
	}
	_, err := s.col(colUsers).InsertOne(ctx, mUser{
		ID: u.ID, Email: u.Email, Name: u.Name, PasswordHash: u.PasswordHash, Role: u.Role, Permissions: perms, CreatedAt: u.CreatedAt.UTC(),
	})
	return err
}

func (s *mongoStore) ListUsers(ctx context.Context) ([]*User, error) {
	cur, err := s.col(colUsers).Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}))
	if err != nil {
		return nil, err
	}
	var docs []mUser
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	users := make([]*User, 0, len(docs))
	for _, d := range docs {
		users = append(users, d.toUser())
	}
	return users, nil
}

func (s *mongoStore) UpdateUserRole(ctx context.Context, id, role string, perms []string) error {
	if perms == nil {
		perms = []string{}
	}
	res, err := s.col(colUsers).UpdateOne(ctx, bson.M{"_id": id},
		bson.M{"$set": bson.M{"role": role, "permissions": perms}})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *mongoStore) EnsureSuperAdmin(ctx context.Context, email string) (bool, error) {
	u, err := s.UserByEmail(ctx, email)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if u.Role == RoleSuperAdmin {
		return false, nil
	}
	if err := s.UpdateUserRole(ctx, u.ID, RoleSuperAdmin, AllPermissions); err != nil {
		return false, err
	}
	return true, nil
}

func (s *mongoStore) DeleteUser(ctx context.Context, id string) error {
	res, err := s.col(colUsers).DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// --- Account security (email tokens, credentials, TOTP) ---

func (s *mongoStore) CreateEmailToken(ctx context.Context, tokenHash, userID, purpose string, expires time.Time) error {
	_, err := s.col(colEmailToks).InsertOne(ctx, bson.M{
		"_id": tokenHash, "user_id": userID, "purpose": purpose, "expires_at": expires.UTC(), "created_at": time.Now().UTC(),
	})
	return err
}

func (s *mongoStore) ConsumeEmailToken(ctx context.Context, tokenHash, purpose string) (string, error) {
	var doc struct {
		UserID    string    `bson:"user_id"`
		Purpose   string    `bson:"purpose"`
		ExpiresAt time.Time `bson:"expires_at"`
	}
	err := s.col(colEmailToks).FindOne(ctx,
		bson.M{"_id": tokenHash, "purpose": purpose, "expires_at": bson.M{"$gt": time.Now().UTC()}}).Decode(&doc)
	if err != nil {
		return "", mongoNotFound(err)
	}
	_, _ = s.col(colEmailToks).DeleteOne(ctx, bson.M{"_id": tokenHash})
	return doc.UserID, nil
}

func (s *mongoStore) SetPassword(ctx context.Context, userID, passwordHash string) error {
	res, err := s.col(colUsers).UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"password_hash": passwordHash}})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *mongoStore) SetEmailVerified(ctx context.Context, userID string, verified bool) error {
	_, err := s.col(colUsers).UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"email_verified": verified}})
	return err
}

func (s *mongoStore) SetTOTP(ctx context.Context, userID, secret string, enabled bool, recoveryCodes []string) error {
	if recoveryCodes == nil {
		recoveryCodes = []string{}
	}
	res, err := s.col(colUsers).UpdateOne(ctx, bson.M{"_id": userID},
		bson.M{"$set": bson.M{"totp_secret": secret, "totp_enabled": enabled, "recovery_codes": recoveryCodes}})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *mongoStore) UserByEmail(ctx context.Context, email string) (*User, error) {
	var u mUser
	err := s.col(colUsers).FindOne(ctx, bson.M{"email": strings.ToLower(strings.TrimSpace(email))}).Decode(&u)
	if err != nil {
		return nil, mongoNotFound(err)
	}
	return u.toUser(), nil
}

func (s *mongoStore) UserByID(ctx context.Context, id string) (*User, error) {
	var u mUser
	err := s.col(colUsers).FindOne(ctx, bson.M{"_id": id}).Decode(&u)
	if err != nil {
		return nil, mongoNotFound(err)
	}
	return u.toUser(), nil
}

func (s *mongoStore) CreateSession(ctx context.Context, tokenHash, userID, userAgent, ip string, expires time.Time) error {
	now := time.Now().UTC()
	_, err := s.col(colSessions).InsertOne(ctx, bson.M{
		"_id": tokenHash, "user_id": userID, "expires_at": expires.UTC(), "created_at": now,
		"user_agent": userAgent, "ip": ip, "last_seen": now,
	})
	return err
}

func (s *mongoStore) SessionsForUser(ctx context.Context, userID string) ([]*Session, error) {
	cur, err := s.col(colSessions).Find(ctx,
		bson.M{"user_id": userID, "expires_at": bson.M{"$gt": time.Now().UTC()}},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}))
	if err != nil {
		return nil, err
	}
	var docs []struct {
		ID        string    `bson:"_id"`
		UserAgent string    `bson:"user_agent"`
		IP        string    `bson:"ip"`
		CreatedAt time.Time `bson:"created_at"`
		LastSeen  time.Time `bson:"last_seen"`
	}
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]*Session, 0, len(docs))
	for _, d := range docs {
		out = append(out, &Session{ID: d.ID, UserAgent: d.UserAgent, IP: d.IP, CreatedAt: d.CreatedAt.UTC(), LastSeen: d.LastSeen.UTC()})
	}
	return out, nil
}

func (s *mongoStore) RevokeSession(ctx context.Context, userID, sessionID string) error {
	res, err := s.col(colSessions).DeleteOne(ctx, bson.M{"_id": sessionID, "user_id": userID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *mongoStore) RevokeOtherSessions(ctx context.Context, userID, keepSessionID string) error {
	_, err := s.col(colSessions).DeleteMany(ctx, bson.M{"user_id": userID, "_id": bson.M{"$ne": keepSessionID}})
	return err
}

func (s *mongoStore) TouchSession(ctx context.Context, sessionID string) error {
	_, err := s.col(colSessions).UpdateOne(ctx, bson.M{"_id": sessionID},
		bson.M{"$set": bson.M{"last_seen": time.Now().UTC()}})
	return err
}

func (s *mongoStore) UserBySession(ctx context.Context, tokenHash string) (*User, error) {
	var sess struct {
		UserID    string    `bson:"user_id"`
		ExpiresAt time.Time `bson:"expires_at"`
	}
	err := s.col(colSessions).FindOne(ctx, bson.M{"_id": tokenHash, "expires_at": bson.M{"$gt": time.Now().UTC()}}).Decode(&sess)
	if err != nil {
		return nil, mongoNotFound(err)
	}
	return s.UserByID(ctx, sess.UserID)
}

func (s *mongoStore) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.col(colSessions).DeleteOne(ctx, bson.M{"_id": tokenHash})
	return err
}

func (s *mongoStore) CreateEditToken(ctx context.Context, tokenHash, userID, siteID string, expires time.Time) error {
	_, err := s.col(colEditTokens).InsertOne(ctx, bson.M{
		"_id": tokenHash, "user_id": userID, "site_id": siteID, "expires_at": expires.UTC(), "created_at": time.Now().UTC(),
	})
	return err
}

func (s *mongoStore) EditGrantByToken(ctx context.Context, tokenHash string) (*EditGrant, error) {
	var g struct {
		UserID string `bson:"user_id"`
		SiteID string `bson:"site_id"`
	}
	err := s.col(colEditTokens).FindOne(ctx, bson.M{"_id": tokenHash, "expires_at": bson.M{"$gt": time.Now().UTC()}}).Decode(&g)
	if err != nil {
		return nil, mongoNotFound(err)
	}
	return &EditGrant{UserID: g.UserID, SiteID: g.SiteID}, nil
}

func (s *mongoStore) PruneExpired(ctx context.Context) error {
	now := time.Now().UTC()
	if _, err := s.col(colSessions).DeleteMany(ctx, bson.M{"expires_at": bson.M{"$lte": now}}); err != nil {
		return err
	}
	_, err := s.col(colEditTokens).DeleteMany(ctx, bson.M{"expires_at": bson.M{"$lte": now}})
	return err
}

// --- Sites, members, origins ---

type mSite struct {
	ID            string    `bson:"_id"`
	SiteKey       string    `bson:"site_key"`
	Name          string    `bson:"name"`
	CreatedBy     string    `bson:"created_by"`
	CreatedAt     time.Time `bson:"created_at"`
	Origins       []string  `bson:"origins"`
	WebhookSecret string    `bson:"webhook_secret,omitempty"`
}

func (m mSite) toSite() *Site {
	origins := m.Origins
	if origins == nil {
		origins = []string{}
	}
	return &Site{ID: m.ID, SiteKey: m.SiteKey, Name: m.Name, CreatedBy: m.CreatedBy, CreatedAt: m.CreatedAt.UTC(), Origins: origins, WebhookSecret: m.WebhookSecret}
}

func (s *mongoStore) CreateSite(ctx context.Context, site *Site) error {
	if site.WebhookSecret == "" {
		site.WebhookSecret = NewWebhookSecret()
	}
	if _, err := s.col(colSites).InsertOne(ctx, mSite{
		ID: site.ID, SiteKey: site.SiteKey, Name: site.Name, CreatedBy: site.CreatedBy, CreatedAt: site.CreatedAt.UTC(), Origins: []string{}, WebhookSecret: site.WebhookSecret,
	}); err != nil {
		return err
	}
	_, err := s.col(colMembers).InsertOne(ctx, bson.M{"site_id": site.ID, "user_id": site.CreatedBy, "role": "owner"})
	return err
}

func (s *mongoStore) RotateWebhookSecret(ctx context.Context, siteID string) (string, error) {
	secret := NewWebhookSecret()
	_, err := s.col(colSites).UpdateByID(ctx, siteID, bson.M{"$set": bson.M{"webhook_secret": secret}})
	return secret, err
}

func (s *mongoStore) SitesForUser(ctx context.Context, userID string) ([]*Site, error) {
	cur, err := s.col(colMembers).Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return nil, err
	}
	var members []struct {
		SiteID string `bson:"site_id"`
	}
	if err := cur.All(ctx, &members); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.SiteID)
	}
	if len(ids) == 0 {
		return []*Site{}, nil
	}
	scur, err := s.col(colSites).Find(ctx, bson.M{"_id": bson.M{"$in": ids}}, options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	var docs []mSite
	if err := scur.All(ctx, &docs); err != nil {
		return nil, err
	}
	sites := make([]*Site, 0, len(docs))
	for _, d := range docs {
		sites = append(sites, d.toSite())
	}
	return sites, nil
}

func (s *mongoStore) AllSiteIDs(ctx context.Context) ([]string, error) {
	cur, err := s.col(colSites).Find(ctx, bson.M{}, options.Find().SetProjection(bson.M{"_id": 1}))
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID string `bson:"_id"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return ids, nil
}

func (s *mongoStore) SiteByID(ctx context.Context, id string) (*Site, error) {
	return s.findSite(ctx, bson.M{"_id": id})
}

func (s *mongoStore) SiteByKey(ctx context.Context, key string) (*Site, error) {
	return s.findSite(ctx, bson.M{"site_key": key})
}

func (s *mongoStore) findSite(ctx context.Context, filter bson.M) (*Site, error) {
	var d mSite
	err := s.col(colSites).FindOne(ctx, filter).Decode(&d)
	if err != nil {
		return nil, mongoNotFound(err)
	}
	return d.toSite(), nil
}

// DeleteSite removes the site and every document that references it. MongoDB has
// no foreign keys, so the cascade is explicit.
func (s *mongoStore) DeleteSite(ctx context.Context, id string) error {
	pageIDs, err := s.pageIDsForSite(ctx, id)
	if err != nil {
		return err
	}
	if len(pageIDs) > 0 {
		if _, err := s.col(colElements).DeleteMany(ctx, bson.M{"page_id": bson.M{"$in": pageIDs}}); err != nil {
			return err
		}
		if _, err := s.col(colRevisions).DeleteMany(ctx, bson.M{"page_id": bson.M{"$in": pageIDs}}); err != nil {
			return err
		}
		if _, err := s.col(colBindings).DeleteMany(ctx, bson.M{"page_id": bson.M{"$in": pageIDs}}); err != nil {
			return err
		}
	}
	for _, c := range []struct {
		name   string
		filter bson.M
	}{
		{colPages, bson.M{"site_id": id}},
		{colMembers, bson.M{"site_id": id}},
		{colAssets, bson.M{"site_id": id}},
		{colEditTokens, bson.M{"site_id": id}},
		{colSites, bson.M{"_id": id}},
	} {
		if _, err := s.col(c.name).DeleteMany(ctx, c.filter); err != nil {
			return err
		}
	}
	return nil
}

func (s *mongoStore) pageIDsForSite(ctx context.Context, siteID string) ([]string, error) {
	cur, err := s.col(colPages).Find(ctx, bson.M{"site_id": siteID}, options.Find().SetProjection(bson.M{"_id": 1}))
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID string `bson:"_id"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return ids, nil
}

func (s *mongoStore) IsMember(ctx context.Context, siteID, userID string) (bool, error) {
	n, err := s.col(colMembers).CountDocuments(ctx, bson.M{"site_id": siteID, "user_id": userID})
	return n > 0, err
}

func (s *mongoStore) MemberRole(ctx context.Context, siteID, userID string) (string, error) {
	var doc struct {
		Role string `bson:"role"`
	}
	err := s.col(colMembers).FindOne(ctx, bson.M{"site_id": siteID, "user_id": userID}).Decode(&doc)
	if err != nil {
		return "", mongoNotFound(err)
	}
	return doc.Role, nil
}

// --- Approval workflow + preview links (Mongo) ---

func (s *mongoStore) SubmitReview(ctx context.Context, pageID, userID string) error {
	_, err := s.col(colPages).UpdateOne(ctx, bson.M{"_id": pageID},
		bson.M{"$set": bson.M{"review_state": ReviewPending, "review_requested_by": userID, "review_requested_at": time.Now().UTC()}})
	return err
}

func (s *mongoStore) ClearReview(ctx context.Context, pageID string) error {
	_, err := s.col(colPages).UpdateOne(ctx, bson.M{"_id": pageID},
		bson.M{"$set": bson.M{"review_state": "", "review_requested_by": "", "review_requested_at": nil}})
	return err
}

func (s *mongoStore) PendingReviews(ctx context.Context, siteID string) ([]*PendingReview, error) {
	cur, err := s.col(colPages).Find(ctx, bson.M{"site_id": siteID, "review_state": ReviewPending})
	if err != nil {
		return nil, err
	}
	var docs []struct {
		ID          string    `bson:"_id"`
		Path        string    `bson:"path"`
		RequestedBy string    `bson:"review_requested_by"`
		RequestedAt time.Time `bson:"review_requested_at"`
	}
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]*PendingReview, 0, len(docs))
	for _, d := range docs {
		out = append(out, &PendingReview{PageID: d.ID, Path: d.Path, RequestedBy: d.RequestedBy, RequestedAt: d.RequestedAt.UTC()})
	}
	return out, nil
}

func (s *mongoStore) CreatePreviewToken(ctx context.Context, tokenHash, siteID, path, userID string, expires time.Time) error {
	_, err := s.col(colPreviewTok).InsertOne(ctx, bson.M{
		"_id": tokenHash, "site_id": siteID, "path": path, "created_by": userID,
		"expires_at": expires.UTC(), "created_at": time.Now().UTC(),
	})
	return err
}

func (s *mongoStore) PreviewToken(ctx context.Context, tokenHash string) (string, string, error) {
	var doc struct {
		SiteID string `bson:"site_id"`
		Path   string `bson:"path"`
	}
	err := s.col(colPreviewTok).FindOne(ctx,
		bson.M{"_id": tokenHash, "expires_at": bson.M{"$gt": time.Now().UTC()}}).Decode(&doc)
	if err != nil {
		return "", "", mongoNotFound(err)
	}
	return doc.SiteID, doc.Path, nil
}

func (s *mongoStore) DraftManifest(ctx context.Context, pageID string) (*Manifest, error) {
	elems, err := s.ElementsForPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	m := &Manifest{Version: 0, Elements: map[string]*ElementContent{}}
	for _, e := range elems {
		if e.Draft != nil {
			m.Elements[e.Selector] = e.Draft
		}
	}
	return m, nil
}

func (s *mongoStore) AddMember(ctx context.Context, siteID, userID, role string) error {
	_, err := s.col(colMembers).UpdateOne(ctx,
		bson.M{"site_id": siteID, "user_id": userID},
		bson.M{"$set": bson.M{"role": role}},
		options.Update().SetUpsert(true))
	return err
}

func (s *mongoStore) MembersForSite(ctx context.Context, siteID string) ([]*Member, error) {
	cur, err := s.col(colMembers).Find(ctx, bson.M{"site_id": siteID})
	if err != nil {
		return nil, err
	}
	var rows []struct {
		UserID string `bson:"user_id"`
		Role   string `bson:"role"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	members := make([]*Member, 0, len(rows))
	for _, r := range rows {
		m := &Member{UserID: r.UserID, Role: r.Role}
		if u, err := s.UserByID(ctx, r.UserID); err == nil {
			m.Email, m.Name = u.Email, u.Name
		}
		members = append(members, m)
	}
	// Stable order by email, matching the SQL backend.
	sortMembersByEmail(members)
	return members, nil
}

func (s *mongoStore) OriginsForSite(ctx context.Context, siteID string) ([]string, error) {
	site, err := s.SiteByID(ctx, siteID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return []string{}, nil
		}
		return nil, err
	}
	return site.Origins, nil
}

func (s *mongoStore) AddOrigin(ctx context.Context, siteID, origin string) error {
	_, err := s.col(colSites).UpdateOne(ctx, bson.M{"_id": siteID}, bson.M{"$addToSet": bson.M{"origins": origin}})
	return err
}

func (s *mongoStore) RemoveOrigin(ctx context.Context, siteID, origin string) error {
	_, err := s.col(colSites).UpdateOne(ctx, bson.M{"_id": siteID}, bson.M{"$pull": bson.M{"origins": origin}})
	return err
}

// --- Pages & elements ---

type mPage struct {
	ID               string    `bson:"_id"`
	SiteID           string    `bson:"site_id"`
	Path             string    `bson:"path"`
	PublishedVersion int       `bson:"published_version"`
	CreatedAt        time.Time `bson:"created_at"`
}

func (m mPage) toPage() *Page {
	return &Page{ID: m.ID, SiteID: m.SiteID, Path: m.Path, PublishedVersion: m.PublishedVersion, CreatedAt: m.CreatedAt.UTC()}
}

func (s *mongoStore) EnsurePage(ctx context.Context, siteID, path string) (*Page, error) {
	p, err := s.PageByPath(ctx, siteID, path)
	if err == nil {
		return p, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	doc := mPage{ID: NewID(), SiteID: siteID, Path: path, PublishedVersion: 0, CreatedAt: time.Now().UTC()}
	if _, err := s.col(colPages).InsertOne(ctx, doc); err != nil {
		// A racing insert may have created it; re-read.
		if p, e := s.PageByPath(ctx, siteID, path); e == nil {
			return p, nil
		}
		return nil, err
	}
	return doc.toPage(), nil
}

func (s *mongoStore) PageByPath(ctx context.Context, siteID, path string) (*Page, error) {
	var d mPage
	err := s.col(colPages).FindOne(ctx, bson.M{"site_id": siteID, "path": path}).Decode(&d)
	if err != nil {
		return nil, mongoNotFound(err)
	}
	return d.toPage(), nil
}

func (s *mongoStore) PageByID(ctx context.Context, id string) (*Page, error) {
	var d mPage
	err := s.col(colPages).FindOne(ctx, bson.M{"_id": id}).Decode(&d)
	if err != nil {
		return nil, mongoNotFound(err)
	}
	return d.toPage(), nil
}

// mElement mirrors the SQL elements row; content is JSON text (see type doc).
type mElement struct {
	ID            string    `bson:"_id"`
	PageID        string    `bson:"page_id"`
	Selector      string    `bson:"selector"`
	DraftJSON     string    `bson:"draft_json"`
	PublishedJSON string    `bson:"published_json"`
	UpdatedBy     string    `bson:"updated_by"`
	UpdatedAt     time.Time `bson:"updated_at"`
	Rev           int       `bson:"rev"`
}

func (s *mongoStore) PagesForSite(ctx context.Context, siteID string) ([]*Page, error) {
	cur, err := s.col(colPages).Find(ctx, bson.M{"site_id": siteID}, options.Find().SetSort(bson.D{{Key: "path", Value: 1}}))
	if err != nil {
		return nil, err
	}
	var docs []mPage
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	pages := make([]*Page, 0, len(docs))
	ids := make([]string, 0, len(docs))
	byID := map[string]*Page{}
	for _, d := range docs {
		p := d.toPage()
		pages = append(pages, p)
		ids = append(ids, d.ID)
		byID[d.ID] = p
	}
	if len(ids) == 0 {
		return pages, nil
	}

	// Elements whose draft differs from published mark their page as drafty.
	ecur, err := s.col(colElements).Find(ctx,
		bson.M{"page_id": bson.M{"$in": ids}, "$expr": bson.M{"$ne": bson.A{"$draft_json", "$published_json"}}},
		options.Find().SetProjection(bson.M{"page_id": 1, "updated_at": 1}))
	if err != nil {
		return nil, err
	}
	var drafts []struct {
		PageID    string    `bson:"page_id"`
		UpdatedAt time.Time `bson:"updated_at"`
	}
	if err := ecur.All(ctx, &drafts); err != nil {
		return nil, err
	}
	for _, d := range drafts {
		p := byID[d.PageID]
		if p == nil {
			continue
		}
		p.HasDraft = true
		u := d.UpdatedAt.UTC()
		if p.DraftUpdatedAt == nil || u.After(*p.DraftUpdatedAt) {
			p.DraftUpdatedAt = &u
		}
	}
	return pages, nil
}

func (s *mongoStore) UpsertDraft(ctx context.Context, pageID, selector string, content *ElementContent, updatedBy string) error {
	draft, err := json.Marshal(content)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err = s.col(colElements).UpdateOne(ctx,
		bson.M{"page_id": pageID, "selector": selector},
		bson.M{
			"$set":         bson.M{"draft_json": string(draft), "updated_by": updatedBy, "updated_at": now},
			"$inc":         bson.M{"rev": 1},
			"$setOnInsert": bson.M{"_id": NewID(), "page_id": pageID, "selector": selector, "published_json": "{}"},
		},
		options.Update().SetUpsert(true))
	return err
}

// UpsertDraftChecked is the optimistic-concurrency write: it only applies when
// the stored rev equals baseRev, returning the new rev or ErrConflict.
func (s *mongoStore) UpsertDraftChecked(ctx context.Context, pageID, selector string, content *ElementContent, updatedBy string, baseRev int) (int, error) {
	draft, err := json.Marshal(content)
	if err != nil {
		return 0, err
	}
	now := time.Now().UTC()

	if baseRev == 0 {
		// First write for this element: create it only if absent. A concurrent
		// creator makes the upsert's unique (page_id,selector) index fail, which
		// we treat as a conflict.
		res, err := s.col(colElements).UpdateOne(ctx,
			bson.M{"page_id": pageID, "selector": selector, "rev": 0},
			bson.M{
				"$set":         bson.M{"draft_json": string(draft), "updated_by": updatedBy, "updated_at": now, "rev": 1},
				"$setOnInsert": bson.M{"_id": NewID(), "page_id": pageID, "selector": selector, "published_json": "{}"},
			},
			options.Update().SetUpsert(true))
		if err != nil {
			if mongo.IsDuplicateKeyError(err) {
				return 0, ErrConflict
			}
			return 0, err
		}
		if res.ModifiedCount == 0 && res.UpsertedCount == 0 {
			return 0, ErrConflict
		}
		return 1, nil
	}

	// Conditional update guarded by the exact rev; no match → conflict.
	res, err := s.col(colElements).UpdateOne(ctx,
		bson.M{"page_id": pageID, "selector": selector, "rev": baseRev},
		bson.M{
			"$set": bson.M{"draft_json": string(draft), "updated_by": updatedBy, "updated_at": now, "rev": baseRev + 1},
		})
	if err != nil {
		return 0, err
	}
	if res.MatchedCount == 0 {
		return 0, ErrConflict
	}
	return baseRev + 1, nil
}

func (s *mongoStore) DeleteElement(ctx context.Context, pageID, selector string) error {
	_, err := s.col(colElements).DeleteOne(ctx, bson.M{"page_id": pageID, "selector": selector})
	return err
}

func (s *mongoStore) ElementsForPage(ctx context.Context, pageID string) ([]*Element, error) {
	cur, err := s.col(colElements).Find(ctx, bson.M{"page_id": pageID}, options.Find().SetSort(bson.D{{Key: "selector", Value: 1}}))
	if err != nil {
		return nil, err
	}
	var docs []mElement
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	elems := make([]*Element, 0, len(docs))
	for _, d := range docs {
		e := &Element{ID: d.ID, PageID: d.PageID, Selector: d.Selector, UpdatedBy: d.UpdatedBy, UpdatedAt: d.UpdatedAt.UTC(), Rev: d.Rev}
		if err := json.Unmarshal([]byte(orEmpty(d.DraftJSON)), &e.Draft); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(orEmpty(d.PublishedJSON)), &e.Published); err != nil {
			return nil, err
		}
		elems = append(elems, e)
	}
	return elems, nil
}

func orEmpty(s string) string {
	if s == "" {
		return "{}"
	}
	return s
}

// --- Revisions & publishing ---

type mRevision struct {
	ID           string    `bson:"_id"`
	PageID       string    `bson:"page_id"`
	Version      int       `bson:"version"`
	ManifestJSON string    `bson:"manifest_json"`
	PublishedBy  string    `bson:"published_by"`
	PublishedAt  time.Time `bson:"published_at"`
}

func (s *mongoStore) PublishPage(ctx context.Context, pageID, publishedBy string) (*Revision, error) {
	elems, err := s.ElementsForPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	page, err := s.PageByID(ctx, pageID)
	if err != nil {
		return nil, err
	}

	m := &Manifest{Version: page.PublishedVersion + 1, Elements: map[string]*ElementContent{}}
	for _, e := range elems {
		if e.Draft != nil {
			m.Elements[e.Selector] = e.Draft
		}
	}
	manifestJSON, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	rev := &Revision{ID: NewID(), PageID: pageID, Version: m.Version, Manifest: m, PublishedBy: publishedBy, PublishedAt: time.Now().UTC()}

	err = s.withTxn(ctx, func(sc mongo.SessionContext) error {
		if _, err := s.col(colRevisions).InsertOne(sc, mRevision{
			ID: rev.ID, PageID: pageID, Version: rev.Version, ManifestJSON: string(manifestJSON), PublishedBy: publishedBy, PublishedAt: rev.PublishedAt,
		}); err != nil {
			return err
		}
		// Promote every draft to published (set published_json = draft_json).
		cur, err := s.col(colElements).Find(sc, bson.M{"page_id": pageID})
		if err != nil {
			return err
		}
		var docs []mElement
		if err := cur.All(sc, &docs); err != nil {
			return err
		}
		for _, d := range docs {
			if _, err := s.col(colElements).UpdateOne(sc, bson.M{"_id": d.ID},
				bson.M{"$set": bson.M{"published_json": d.DraftJSON}}); err != nil {
				return err
			}
		}
		_, err = s.col(colPages).UpdateOne(sc, bson.M{"_id": pageID}, bson.M{"$set": bson.M{"published_version": rev.Version}})
		return err
	})
	if err != nil {
		return nil, err
	}
	return rev, nil
}

func (s *mongoStore) DiscardDrafts(ctx context.Context, pageID string) error {
	return s.withTxn(ctx, func(sc mongo.SessionContext) error {
		// Drop elements that exist only as drafts (never published).
		if _, err := s.col(colElements).DeleteMany(sc, bson.M{
			"page_id": pageID,
			"$or":     bson.A{bson.M{"published_json": "{}"}, bson.M{"published_json": ""}, bson.M{"published_json": bson.M{"$exists": false}}},
		}); err != nil {
			return err
		}
		// Revert remaining drafts to their published content.
		cur, err := s.col(colElements).Find(sc, bson.M{"page_id": pageID})
		if err != nil {
			return err
		}
		var docs []mElement
		if err := cur.All(sc, &docs); err != nil {
			return err
		}
		for _, d := range docs {
			if _, err := s.col(colElements).UpdateOne(sc, bson.M{"_id": d.ID},
				bson.M{"$set": bson.M{"draft_json": d.PublishedJSON}}); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *mongoStore) PublishedManifest(ctx context.Context, pageID string) (*Manifest, error) {
	page, err := s.PageByID(ctx, pageID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return &Manifest{Version: 0, Elements: map[string]*ElementContent{}}, nil
		}
		return nil, err
	}
	var d mRevision
	err = s.col(colRevisions).FindOne(ctx, bson.M{"page_id": pageID, "version": page.PublishedVersion}).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return &Manifest{Version: 0, Elements: map[string]*ElementContent{}}, nil
	}
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := json.Unmarshal([]byte(d.ManifestJSON), &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *mongoStore) RevisionsForPage(ctx context.Context, pageID string) ([]*Revision, error) {
	cur, err := s.col(colRevisions).Find(ctx, bson.M{"page_id": pageID}, options.Find().SetSort(bson.D{{Key: "version", Value: -1}}))
	if err != nil {
		return nil, err
	}
	var docs []mRevision
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	revs := make([]*Revision, 0, len(docs))
	for _, d := range docs {
		revs = append(revs, &Revision{ID: d.ID, PageID: d.PageID, Version: d.Version, PublishedBy: d.PublishedBy, PublishedAt: d.PublishedAt.UTC()})
	}
	return revs, nil
}

func (s *mongoStore) RevisionByID(ctx context.Context, id string) (*Revision, error) {
	var d mRevision
	err := s.col(colRevisions).FindOne(ctx, bson.M{"_id": id}).Decode(&d)
	if err != nil {
		return nil, mongoNotFound(err)
	}
	var m Manifest
	if err := json.Unmarshal([]byte(d.ManifestJSON), &m); err != nil {
		return nil, err
	}
	return &Revision{ID: d.ID, PageID: d.PageID, Version: d.Version, Manifest: &m, PublishedBy: d.PublishedBy, PublishedAt: d.PublishedAt.UTC()}, nil
}

func (s *mongoStore) RestoreRevision(ctx context.Context, revisionID, userID string) (*Revision, error) {
	rev, err := s.RestoreRevisionToDraft(ctx, revisionID, userID)
	if err != nil {
		return nil, err
	}
	return s.PublishPage(ctx, rev.PageID, userID)
}

func (s *mongoStore) RestoreRevisionToDraft(ctx context.Context, revisionID, userID string) (*Revision, error) {
	rev, err := s.RevisionByID(ctx, revisionID)
	if err != nil {
		return nil, err
	}
	for selector, content := range rev.Manifest.Elements {
		if err := s.UpsertDraft(ctx, rev.PageID, selector, content, userID); err != nil {
			return nil, err
		}
	}
	return rev, nil
}

// --- Assets ---

func (s *mongoStore) CreateAsset(ctx context.Context, a *Asset) error {
	_, err := s.col(colAssets).InsertOne(ctx, bson.M{
		"_id": a.ID, "site_id": a.SiteID, "file_name": a.FileName, "disk_path": a.DiskPath,
		"size_bytes": a.SizeBytes, "created_by": a.CreatedBy, "created_at": a.CreatedAt.UTC(),
	})
	return err
}

func (s *mongoStore) AssetByID(ctx context.Context, id string) (*Asset, error) {
	var d struct {
		ID        string    `bson:"_id"`
		SiteID    string    `bson:"site_id"`
		FileName  string    `bson:"file_name"`
		DiskPath  string    `bson:"disk_path"`
		SizeBytes int64     `bson:"size_bytes"`
		CreatedBy string    `bson:"created_by"`
		CreatedAt time.Time `bson:"created_at"`
	}
	err := s.col(colAssets).FindOne(ctx, bson.M{"_id": id}).Decode(&d)
	if err != nil {
		return nil, mongoNotFound(err)
	}
	return &Asset{ID: d.ID, SiteID: d.SiteID, FileName: d.FileName, DiskPath: d.DiskPath, SizeBytes: d.SizeBytes, CreatedBy: d.CreatedBy, CreatedAt: d.CreatedAt.UTC()}, nil
}

func (s *mongoStore) TotalAssetBytesForSite(ctx context.Context, siteID string) (int64, error) {
	cur, err := s.col(colAssets).Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"site_id": siteID}}},
		{{Key: "$group", Value: bson.M{"_id": nil, "total": bson.M{"$sum": "$size_bytes"}}}},
	})
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)
	var rows []struct {
		Total int64 `bson:"total"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, nil
	}
	return rows[0].Total, nil
}

// --- Drift / binding health ---

type mBinding struct {
	ID         string    `bson:"_id"`
	SiteID     string    `bson:"site_id"`
	PageID     string    `bson:"page_id"`
	Path       string    `bson:"path"`
	Selector   string    `bson:"selector"`
	Descriptor string    `bson:"descriptor_json"`
	Confidence int       `bson:"confidence"`
	Status     string    `bson:"status"`
	Category   string    `bson:"category"`
	Reasons    []string  `bson:"reasons"`
	Hits       int       `bson:"hits"`
	Misses     int       `bson:"misses"`
	Dupes      int       `bson:"dupes"`
	Late       int       `bson:"late"`
	LastSeen   time.Time `bson:"last_seen"`
	UpdatedAt  time.Time `bson:"updated_at"`
}

func (m mBinding) toHealth() *BindingHealth {
	r := m.Reasons
	if r == nil {
		r = []string{}
	}
	cat := m.Category
	if cat == "" {
		cat = "ok"
	}
	b := &BindingHealth{
		ID: m.ID, SiteID: m.SiteID, PageID: m.PageID, Path: m.Path, Selector: m.Selector,
		Descriptor: m.Descriptor, Confidence: m.Confidence, Status: m.Status, Category: cat, Reasons: r,
		Hits: m.Hits, Misses: m.Misses, Dupes: m.Dupes, Late: m.Late, UpdatedAt: m.UpdatedAt.UTC(),
	}
	if !m.LastSeen.IsZero() {
		b.LastSeen = m.LastSeen.UTC()
	}
	return b
}

func (s *mongoStore) UpsertBindingDescriptor(ctx context.Context, bh *BindingHealth) error {
	now := time.Now().UTC()
	reasons := bh.Reasons
	if reasons == nil {
		reasons = []string{}
	}
	// Bind-time risk is a prediction, never an alarm; a successful bind is live
	// proof the element exists. (Re)set the row to healthy and leave real flagging
	// to the crawl + telemetry. Mirrors the SQL backend.
	_, err := s.col(colBindings).UpdateOne(ctx,
		bson.M{"page_id": bh.PageID, "selector": bh.Selector},
		bson.M{
			"$set":         bson.M{"path": bh.Path, "descriptor_json": bh.Descriptor, "confidence": 100, "status": StatusHealthy, "category": "ok", "reasons": reasons, "updated_at": now},
			"$setOnInsert": bson.M{"_id": NewID(), "site_id": bh.SiteID, "hits": 0, "misses": 0, "dupes": 0, "late": 0},
		},
		options.Update().SetUpsert(true))
	return err
}

func (s *mongoStore) recomputeBinding(ctx context.Context, pageID, selector string, baseConfidence int) error {
	var m mBinding
	if err := s.col(colBindings).FindOne(ctx, bson.M{"page_id": pageID, "selector": selector}).Decode(&m); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil
		}
		return err
	}
	status := deriveStatus(baseConfidence, m.Hits, m.Misses, m.Dupes)
	_, err := s.col(colBindings).UpdateOne(ctx, bson.M{"_id": m.ID}, bson.M{"$set": bson.M{"status": status}})
	return err
}

func (s *mongoStore) RecordTelemetry(ctx context.Context, siteID, pageID, path string, results []TelemetryResult) error {
	now := time.Now().UTC()
	for _, r := range results {
		var col string
		switch r.State {
		case "found":
			col = "hits"
		case "missing", "displaced":
			col = "misses"
		case "duplicate":
			col = "dupes"
		case "late":
			col = "late"
		default:
			continue
		}
		_, err := s.col(colBindings).UpdateOne(ctx,
			bson.M{"page_id": pageID, "selector": r.Selector},
			bson.M{
				"$inc": bson.M{col: 1},
				"$set": bson.M{"last_seen": now},
				"$setOnInsert": bson.M{
					"_id": NewID(), "site_id": siteID, "path": path, "descriptor_json": "",
					"confidence": 100, "status": StatusHealthy, "category": "ok", "reasons": []string{}, "updated_at": now,
				},
			},
			options.Update().SetUpsert(true))
		if err != nil {
			return err
		}
		if err := s.recomputeBinding(ctx, pageID, r.Selector, 100); err != nil {
			return err
		}
	}
	return nil
}

func (s *mongoStore) UpdateBindingStatus(ctx context.Context, id string, confidence int, status, category string, reasons []string) error {
	if reasons == nil {
		reasons = []string{}
	}
	_, err := s.col(colBindings).UpdateOne(ctx, bson.M{"_id": id},
		bson.M{"$set": bson.M{"confidence": confidence, "status": status, "category": category, "reasons": reasons, "updated_at": time.Now().UTC()}})
	return err
}

// UpdateBindingStatusBulk applies many status updates in a single BulkWrite, so a
// crawl of N bindings costs one network round-trip rather than N.
func (s *mongoStore) UpdateBindingStatusBulk(ctx context.Context, updates []BindingStatusUpdate) error {
	if len(updates) == 0 {
		return nil
	}
	now := time.Now().UTC()
	models := make([]mongo.WriteModel, 0, len(updates))
	for _, u := range updates {
		reasons := u.Reasons
		if reasons == nil {
			reasons = []string{}
		}
		models = append(models, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": u.ID}).
			SetUpdate(bson.M{"$set": bson.M{
				"confidence": u.Confidence, "status": u.Status, "category": u.Category,
				"reasons": reasons, "updated_at": now,
			}}))
	}
	_, err := s.col(colBindings).BulkWrite(ctx, models, options.BulkWrite().SetOrdered(false))
	return err
}

func (s *mongoStore) IssueCountsForSites(ctx context.Context, siteIDs []string) (map[string]int, error) {
	out := map[string]int{}
	if len(siteIDs) == 0 {
		return out, nil
	}
	cur, err := s.col(colBindings).Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"site_id": bson.M{"$in": siteIDs}, "status": bson.M{"$ne": StatusHealthy}}}},
		{{Key: "$group", Value: bson.M{"_id": "$site_id", "n": bson.M{"$sum": 1}}}},
	})
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID string `bson:"_id"`
		N  int    `bson:"n"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ID] = r.N
	}
	return out, nil
}

func (s *mongoStore) DeleteBindingHealth(ctx context.Context, pageID, selector string) error {
	_, err := s.col(colBindings).DeleteOne(ctx, bson.M{"page_id": pageID, "selector": selector})
	return err
}

// DeleteBindingHealthForPage wipes every health row for a page (orphans too), so
// reset truly clears the board. Mirrors the SQL backend.
func (s *mongoStore) DeleteBindingHealthForPage(ctx context.Context, pageID string) error {
	_, err := s.col(colBindings).DeleteMany(ctx, bson.M{"page_id": pageID})
	return err
}

func (s *mongoStore) BindingHealthForSite(ctx context.Context, siteID string) ([]*BindingHealth, error) {
	cur, err := s.col(colBindings).Find(ctx, bson.M{"site_id": siteID},
		options.Find().SetSort(bson.D{{Key: "confidence", Value: 1}, {Key: "path", Value: 1}}))
	if err != nil {
		return nil, err
	}
	return decodeBindings(ctx, cur)
}

func (s *mongoStore) BindingsForPage(ctx context.Context, pageID string) ([]*BindingHealth, error) {
	cur, err := s.col(colBindings).Find(ctx, bson.M{"page_id": pageID}, options.Find().SetSort(bson.D{{Key: "selector", Value: 1}}))
	if err != nil {
		return nil, err
	}
	return decodeBindings(ctx, cur)
}

func decodeBindings(ctx context.Context, cur *mongo.Cursor) ([]*BindingHealth, error) {
	var docs []mBinding
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]*BindingHealth, 0, len(docs))
	for _, d := range docs {
		out = append(out, d.toHealth())
	}
	return out, nil
}

// withTxn runs fn inside a MongoDB transaction (Atlas is a replica set, so
// multi-document transactions are supported). If the deployment does not
// support transactions it falls back to running fn without one.
func (s *mongoStore) withTxn(ctx context.Context, fn func(sc mongo.SessionContext) error) error {
	sess, err := s.client.StartSession()
	if err != nil {
		// No sessions (standalone server): run without a transaction.
		return fn(mongo.NewSessionContext(ctx, nil))
	}
	defer sess.EndSession(ctx)
	_, err = sess.WithTransaction(ctx, func(sc mongo.SessionContext) (interface{}, error) {
		return nil, fn(sc)
	})
	return err
}
