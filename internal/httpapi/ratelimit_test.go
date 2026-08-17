package httpapi

import (
	"testing"
	"time"
)

func TestRateLimiterAllowN(t *testing.T) {
	rl := newRateLimiter()
	// 3 allowed, 4th denied, within the window.
	for i := 1; i <= 3; i++ {
		if !rl.allowN("k", 3, time.Minute) {
			t.Fatalf("request %d should be allowed", i)
		}
	}
	if rl.allowN("k", 3, time.Minute) {
		t.Fatal("4th request should be denied")
	}
	// A different key has its own independent budget.
	if !rl.allowN("other", 3, time.Minute) {
		t.Fatal("independent key should be allowed")
	}
}

func TestRateLimiterWindowResets(t *testing.T) {
	rl := newRateLimiter()
	if !rl.allowN("k", 1, time.Millisecond) {
		t.Fatal("first should pass")
	}
	if rl.allowN("k", 1, time.Millisecond) {
		t.Fatal("second within window should fail")
	}
	time.Sleep(2 * time.Millisecond)
	if !rl.allowN("k", 1, time.Millisecond) {
		t.Fatal("after window elapsed, should pass again")
	}
}
