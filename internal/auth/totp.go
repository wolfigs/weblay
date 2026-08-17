package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// TOTP (RFC 6238) with the near-universal authenticator defaults: SHA-1, 6
// digits, 30-second period. Implemented directly so the connector/server need no
// third-party 2FA dependency.

const (
	totpDigits = 6
	totpPeriod = 30 * time.Second
	totpWindow = 1 // accept the adjacent step each side, for clock skew
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// NewTOTPSecret returns a fresh base32-encoded shared secret (160-bit).
func NewTOTPSecret() string {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return b32.EncodeToString(b)
}

// TOTPURI builds the otpauth:// provisioning URI an authenticator app scans.
func TOTPURI(issuer, account, secret string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", fmt.Sprint(totpDigits))
	q.Set("period", fmt.Sprint(int(totpPeriod.Seconds())))
	return "otpauth://totp/" + label + "?" + q.Encode()
}

// TOTPCode returns the code for a secret at a moment in time.
func TOTPCode(secret string, t time.Time) (string, error) {
	key, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return "", fmt.Errorf("invalid TOTP secret")
	}
	counter := uint64(t.Unix()) / uint64(totpPeriod.Seconds())
	return hotp(key, counter), nil
}

// VerifyTOTP checks a user-supplied code against the secret, tolerating one step
// of clock skew each way. Constant-time compare per candidate step.
func VerifyTOTP(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != totpDigits {
		return false
	}
	key, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return false
	}
	base := uint64(time.Now().Unix()) / uint64(totpPeriod.Seconds())
	for d := -totpWindow; d <= totpWindow; d++ {
		cand := hotp(key, base+uint64(d))
		if subtle.ConstantTimeCompare([]byte(cand), []byte(code)) == 1 {
			return true
		}
	}
	return false
}

func hotp(key []byte, counter uint64) string {
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], counter)
	mac := hmac.New(sha1.New, key)
	mac.Write(buf[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	code := (uint32(sum[offset]&0x7f)<<24 |
		uint32(sum[offset+1])<<16 |
		uint32(sum[offset+2])<<8 |
		uint32(sum[offset+3]))
	code %= 1_000_000 // 6 digits
	return fmt.Sprintf("%06d", code)
}

// NewRecoveryCodes returns n single-use recovery codes (formatted xxxx-xxxx).
func NewRecoveryCodes(n int) []string {
	const alphabet = "23456789abcdefghjkmnpqrstuvwxyz" // no ambiguous chars
	codes := make([]string, n)
	for i := range codes {
		b := make([]byte, 8)
		if _, err := rand.Read(b); err != nil {
			panic(err)
		}
		var sb strings.Builder
		for j, x := range b {
			if j == 4 {
				sb.WriteByte('-')
			}
			sb.WriteByte(alphabet[int(x)%len(alphabet)])
		}
		codes[i] = sb.String()
	}
	return codes
}
