package store

import (
	"context"
	"testing"
	"time"
)

func mkUser(t *testing.T, s Store, email, role string, perms []string) *User {
	t.Helper()
	u := &User{ID: NewID(), Email: email, Name: email, PasswordHash: "x", Role: role, Permissions: perms, CreatedAt: time.Now().UTC()}
	if err := s.CreateUser(context.Background(), u); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	return u
}

func TestUserPermissions(t *testing.T) {
	super := &User{Role: RoleSuperAdmin}
	if !super.Can(PermManageUsers) || !super.Can(PermManageBilling) || !super.IsSuperAdmin() || !super.IsAdmin() {
		t.Fatal("super admin should hold every permission")
	}
	admin := &User{Role: RoleAdmin, Permissions: []string{PermManageSites}}
	if !admin.Can(PermManageSites) || admin.Can(PermManageUsers) || admin.IsSuperAdmin() || !admin.IsAdmin() {
		t.Fatal("scoped admin permission check wrong")
	}
	member := &User{Role: RoleMember}
	if member.Can(PermManageSites) || member.IsAdmin() {
		t.Fatal("member should hold no admin powers")
	}
}

func TestListUpdateDeleteAndSuperAdminBootstrap(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	owner := mkUser(t, s, "owner@wolfigs.dev", RoleMember, nil)
	mkUser(t, s, "someone@wolfigs.dev", RoleMember, nil)

	users, err := s.ListUsers(ctx)
	if err != nil || len(users) != 2 {
		t.Fatalf("ListUsers = %d (%v), want 2", len(users), err)
	}

	// Promote owner to admin with a permission, then read it back.
	if err := s.UpdateUserRole(ctx, owner.ID, RoleAdmin, []string{PermManageSites}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.UserByID(ctx, owner.ID)
	if got.Role != RoleAdmin || len(got.Permissions) != 1 || got.Permissions[0] != PermManageSites {
		t.Fatalf("role/permissions not persisted: %+v", got)
	}

	// Super-admin bootstrap promotes the configured email.
	promoted, err := s.EnsureSuperAdmin(ctx, "owner@wolfigs.dev")
	if err != nil || !promoted {
		t.Fatalf("EnsureSuperAdmin = %v, %v; want true, nil", promoted, err)
	}
	got, _ = s.UserByID(ctx, owner.ID)
	if !got.IsSuperAdmin() || !got.Can(PermManageUsers) {
		t.Fatalf("owner not promoted to super admin: %+v", got)
	}
	// Idempotent: a second call is a no-op.
	if again, _ := s.EnsureSuperAdmin(ctx, "owner@wolfigs.dev"); again {
		t.Fatal("EnsureSuperAdmin should be idempotent")
	}
	// Absent email is a no-op, not an error.
	if p, err := s.EnsureSuperAdmin(ctx, "nobody@wolfigs.dev"); err != nil || p {
		t.Fatalf("EnsureSuperAdmin(absent) = %v, %v; want false, nil", p, err)
	}

	// Delete removes the account.
	if err := s.DeleteUser(ctx, users[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserByID(ctx, users[0].ID); err == nil {
		t.Fatal("deleted user still present")
	}
}
