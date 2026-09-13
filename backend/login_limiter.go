package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Brute-force protection for the admin login: a handful of failures per IP
// locks that IP out for a while, with the lock-out doubling on repeat
// offences. Each PBKDF2 verification costs real CPU, so this also stops the
// endpoint being used to exhaust the (small) server.
const (
	loginMaxFailures    = 5
	loginFailureWindow  = 15 * time.Minute
	loginLockoutBase    = 15 * time.Minute
	loginLockoutMax     = 6 * time.Hour
	loginLimiterRetain  = 24 * time.Hour
	loginLimiterMaxKeys = 10000
)

type loginAttempts struct {
	failures    int
	windowStart time.Time
	lockedUntil time.Time
	lockouts    int
	lastSeen    time.Time
}

type loginLimiter struct {
	mu    sync.Mutex
	byKey map[string]*loginAttempts
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{byKey: map[string]*loginAttempts{}}
}

// blockedFor returns how long the key must still wait, or 0 if allowed.
func (l *loginLimiter) blockedFor(key string, now time.Time) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	entry, ok := l.byKey[key]
	if !ok {
		return 0
	}
	if now.Before(entry.lockedUntil) {
		return entry.lockedUntil.Sub(now)
	}
	return 0
}

func (l *loginLimiter) recordFailure(key string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.pruneLocked(now)
	entry, ok := l.byKey[key]
	if !ok {
		entry = &loginAttempts{}
		l.byKey[key] = entry
	}
	entry.lastSeen = now
	if now.Sub(entry.windowStart) > loginFailureWindow {
		entry.windowStart = now
		entry.failures = 0
	}
	entry.failures++
	if entry.failures >= loginMaxFailures {
		lockout := loginLockoutBase << uint(entry.lockouts)
		if lockout > loginLockoutMax || lockout <= 0 {
			lockout = loginLockoutMax
		}
		entry.lockedUntil = now.Add(lockout)
		entry.lockouts++
		entry.failures = 0
		entry.windowStart = now
	}
}

func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.byKey, key)
}

// pruneLocked drops stale entries so the map cannot grow without bound.
func (l *loginLimiter) pruneLocked(now time.Time) {
	if len(l.byKey) < loginLimiterMaxKeys {
		for key, entry := range l.byKey {
			if now.Sub(entry.lastSeen) > loginLimiterRetain && now.After(entry.lockedUntil) {
				delete(l.byKey, key)
			}
		}
		return
	}
	// Under pressure, clear everything that is not currently locked out.
	for key, entry := range l.byKey {
		if now.After(entry.lockedUntil) {
			delete(l.byKey, key)
		}
	}
}

// clientIP prefers the first X-Forwarded-For hop (Render terminates TLS and
// proxies to the app) and falls back to the socket address.
func clientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		if first := strings.TrimSpace(strings.Split(xff, ",")[0]); first != "" {
			return first
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
