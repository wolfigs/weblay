package auth

import (
	"testing"
	"time"
)

// RFC 6238 test vector (SHA-1, 8 digits) truncated to our 6-digit output.
// Secret "12345678901234567890" -> base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ".
func TestTOTPKnownVector(t *testing.T) {
	secret := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	// At Unix time 59 (T1), RFC 6238 SHA-1 8-digit code is 94287082 -> last 6 = 287082.
	got, err := TOTPCode(secret, time.Unix(59, 0))
	if err != nil {
		t.Fatal(err)
	}
	if got != "287082" {
		t.Fatalf("TOTPCode = %s, want 287082", got)
	}
}

func TestTOTPRoundTripAndWindow(t *testing.T) {
	secret := NewTOTPSecret()
	code, err := TOTPCode(secret, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyTOTP(secret, code) {
		t.Fatal("current code should verify")
	}
	if VerifyTOTP(secret, "000000") && code != "000000" {
		t.Fatal("an arbitrary wrong code should not verify")
	}
	if VerifyTOTP(secret, "12345") {
		t.Fatal("wrong length should not verify")
	}
}

func TestTOTPURIAndSecret(t *testing.T) {
	s := NewTOTPSecret()
	if len(s) < 20 {
		t.Fatalf("secret too short: %q", s)
	}
	uri := TOTPURI("Wolfigs Weblay", "user@example.com", s)
	if uri == "" || uri[:10] != "otpauth://" {
		t.Fatalf("bad otpauth URI: %s", uri)
	}
}

func TestRecoveryCodes(t *testing.T) {
	codes := NewRecoveryCodes(10)
	if len(codes) != 10 {
		t.Fatalf("got %d codes, want 10", len(codes))
	}
	seen := map[string]bool{}
	for _, c := range codes {
		if len(c) != 9 || c[4] != '-' {
			t.Fatalf("bad code format: %q", c)
		}
		if seen[c] {
			t.Fatalf("duplicate recovery code: %q", c)
		}
		seen[c] = true
	}
}
