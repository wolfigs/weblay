package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Asset is an uploaded file (image) belonging to a site.
type Asset struct {
	ID        string    `json:"id"`
	SiteID    string    `json:"siteId"`
	FileName  string    `json:"fileName"`
	DiskPath  string    `json:"-"`
	SizeBytes int64     `json:"sizeBytes"`
	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
}

// CreateAsset records an uploaded file.
func (s *Store) CreateAsset(ctx context.Context, a *Asset) error {
	_, err := s.exec(ctx,
		`INSERT INTO assets (id, site_id, file_name, disk_path, size_bytes, created_by, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		a.ID, a.SiteID, a.FileName, a.DiskPath, a.SizeBytes, a.CreatedBy, a.CreatedAt)
	return err
}

// AssetByID fetches an asset.
func (s *Store) AssetByID(ctx context.Context, id string) (*Asset, error) {
	var a Asset
	err := s.queryRow(ctx,
		`SELECT id, site_id, file_name, disk_path, size_bytes, created_by, created_at FROM assets WHERE id = ?`,
		id).Scan(&a.ID, &a.SiteID, &a.FileName, &a.DiskPath, &a.SizeBytes, &a.CreatedBy, &a.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}
