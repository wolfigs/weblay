package auth

import "testing"

func TestHashAndVerify(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !VerifyPassword("correct horse battery staple", hash) {
		t.Error("correct password rejected")
	}
	if VerifyPassword("wrong password", hash) {
		t.Error("wrong password accepted")
	}
}

func TestHashUniqueSalts(t *testing.T) {
	a, _ := HashPassword("password123")
	b, _ := HashPassword("password123")
	if a == b {
		t.Error("two hashes of the same password are identical — salt is not random")
	}
}

func TestShortPasswordRejected(t *testing.T) {
	if _, err := HashPassword("short"); err == nil {
		t.Error("expected error for password under 8 characters")
	}
}

func TestVerifyGarbageHash(t *testing.T) {
	for _, encoded := range []string{"", "$argon2id$bogus", "plaintext", "$argon2id$v=19$m=x$y$z"} {
		if VerifyPassword("anything", encoded) {
			t.Errorf("garbage hash %q verified", encoded)
		}
	}
}
