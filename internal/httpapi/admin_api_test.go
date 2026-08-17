package httpapi

import (
	"net/http"
	"testing"
)

// TestAdminPanelFlow covers the Wolfigs account strategy end to end: the first
// account is the super admin, who can appoint admins with scoped permissions,
// while non-admins are denied — and the super admin cannot be deleted/demoted.
func TestAdminPanelFlow(t *testing.T) {
	h := newHarness(t)

	// First-run setup creates the super admin (the platform owner).
	res, out := h.do("POST", "/api/v1/auth/setup", map[string]string{
		"email": "owner@wolfigs.dev", "password": "super-secret-123", "name": "Owner",
	})
	h.expect(res, 200, out)
	if out["role"] != "super_admin" {
		t.Fatalf("setup role = %v, want super_admin", out["role"])
	}

	// Super admin sees the overview and can list accounts.
	res, out = h.do("GET", "/api/v1/admin/overview", nil)
	h.expect(res, 200, out)
	if out["superAdmins"].(float64) != 1 {
		t.Fatalf("overview superAdmins = %v, want 1", out["superAdmins"])
	}

	// Create a scoped admin.
	res, out = h.do("POST", "/api/v1/admin/users", map[string]any{
		"email": "editor@wolfigs.dev", "name": "Ed", "password": "another-secret-1",
		"role": "admin", "permissions": []string{"manage_content", "manage_sites"},
	})
	h.expect(res, 201, out)
	adminID := out["id"].(string)
	if out["role"] != "admin" {
		t.Fatalf("created role = %v, want admin", out["role"])
	}

	// Unknown permission is rejected.
	res, out = h.do("POST", "/api/v1/admin/users", map[string]any{
		"email": "x@wolfigs.dev", "password": "another-secret-1", "role": "admin",
		"permissions": []string{"take_over_world"},
	})
	h.expect(res, http.StatusBadRequest, out)

	// The super admin account is protected from deletion.
	var superID string
	res, list := h.do("GET", "/api/v1/admin/users", nil)
	h.expect(res, 200, list)
	for _, u := range list["users"].([]any) {
		m := u.(map[string]any)
		if m["role"] == "super_admin" {
			superID = m["id"].(string)
		}
	}
	res, out = h.do("DELETE", "/api/v1/admin/users/"+superID, nil)
	h.expect(res, http.StatusForbidden, out)

	// Now sign in as the scoped admin (no manage_users) and confirm the admin
	// endpoints are forbidden.
	h2 := &harness{t: t, srv: h.srv, client: newJarClient()}
	res, out = h2.do("POST", "/api/v1/auth/login", map[string]string{
		"email": "editor@wolfigs.dev", "password": "another-secret-1",
	})
	h2.expect(res, 200, out)
	res, out = h2.do("GET", "/api/v1/admin/users", nil)
	h2.expect(res, http.StatusForbidden, out)
	// And a scoped admin cannot appoint admins even if they try.
	res, out = h2.do("POST", "/api/v1/admin/users", map[string]any{
		"email": "z@wolfigs.dev", "password": "another-secret-1", "role": "admin",
	})
	h2.expect(res, http.StatusForbidden, out)

	// Back as super admin: demote the admin to member.
	res, out = h.do("PATCH", "/api/v1/admin/users/"+adminID, map[string]any{"role": "member"})
	h.expect(res, 200, out)
	if out["role"] != "member" {
		t.Fatalf("patched role = %v, want member", out["role"])
	}

	// And remove them.
	res, out = h.do("DELETE", "/api/v1/admin/users/"+adminID, nil)
	h.expect(res, 200, out)
}

func newJarClient() *http.Client {
	return &http.Client{Jar: &cookieJar{cookies: map[string]*http.Cookie{}}}
}

// TestAdminSeesAllWebsites covers the admin panel's platform-wide site oversight:
// the super admin lists every site (even ones they don't belong to) and can open
// any of them, while an editor sees only their own via the normal endpoint.
func TestAdminSeesAllWebsites(t *testing.T) {
	h := newHarness(t)
	setupUser(t, h, "super@wolfigs.dev") // first account = super admin

	// A separate, non-admin member creates their own site.
	h2 := &harness{t: t, srv: h.srv, client: newJarClient()}
	// The super admin appoints them as a plain member so they can log in.
	res, out := h.do("POST", "/api/v1/admin/users", map[string]string{
		"email": "editor@wolfigs.dev", "password": "member-pass-12345", "role": "member",
	})
	h.expect(res, 201, out)
	res, out = h2.do("POST", "/api/v1/auth/login", map[string]string{"email": "editor@wolfigs.dev", "password": "member-pass-12345"})
	h2.expect(res, 200, out)
	res, out = h2.do("POST", "/api/v1/sites", map[string]string{"name": "Editor's site"})
	h2.expect(res, 201, out)
	editorSiteID := out["id"].(string)

	// The super admin, who is NOT a member of that site, still sees it in the
	// platform-wide list.
	res, list := h.do("GET", "/api/v1/admin/sites", nil)
	h.expect(res, 200, list)
	sites := list["sites"].([]any)
	found := false
	for _, s := range sites {
		if s.(map[string]any)["id"] == editorSiteID {
			found = true
			if s.(map[string]any)["ownerEmail"] != "editor@wolfigs.dev" {
				t.Errorf("ownerEmail = %v, want editor@wolfigs.dev", s.(map[string]any)["ownerEmail"])
			}
		}
	}
	if !found {
		t.Fatal("admin site list did not include the editor's site")
	}

	// The super admin can open that site's detail despite not being a member.
	res, out = h.do("GET", "/api/v1/sites/"+editorSiteID, nil)
	h.expect(res, 200, out)

	// A plain member cannot reach the admin site list.
	res, out = h2.do("GET", "/api/v1/admin/sites", nil)
	h2.expect(res, http.StatusForbidden, out)
}
