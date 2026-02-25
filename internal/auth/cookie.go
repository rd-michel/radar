package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const cookieName = "radar_session"

// cookiePayload is the data stored in the session cookie
type cookiePayload struct {
	Username  string   `json:"u"`
	Groups    []string `json:"g,omitempty"`
	ExpiresAt int64    `json:"e"`
}

// createSessionCookie creates a signed session cookie for the given user.
// Format: base64(json) + "." + base64(hmac-sha256)
func createSessionCookie(user *User, secret string, ttl time.Duration, secure bool) *http.Cookie {
	payload := cookiePayload{
		Username:  user.Username,
		Groups:    user.Groups,
		ExpiresAt: time.Now().Add(ttl).Unix(),
	}

	data, _ := json.Marshal(payload)
	encoded := base64.RawURLEncoding.EncodeToString(data)

	sig := signData(encoded, secret)

	return &http.Cookie{
		Name:     cookieName,
		Value:    encoded + "." + sig,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(ttl.Seconds()),
	}
}

// parseSessionCookie validates and parses a session cookie.
// Returns nil if the cookie is missing, invalid, or expired.
func parseSessionCookie(r *http.Request, secret string) *User {
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		return nil
	}

	parts := strings.SplitN(cookie.Value, ".", 2)
	if len(parts) != 2 {
		return nil
	}

	encoded, sig := parts[0], parts[1]

	// Verify HMAC signature
	expected := signData(encoded, secret)
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return nil
	}

	// Decode payload
	data, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil
	}

	var payload cookiePayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil
	}

	// Check expiration
	if time.Now().Unix() > payload.ExpiresAt {
		return nil
	}

	return &User{
		Username: payload.Username,
		Groups:   payload.Groups,
	}
}

// clearSessionCookie returns a cookie that clears the session
func clearSessionCookie() *http.Cookie {
	return &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	}
}

// signData computes HMAC-SHA256 of the given data with the secret
func signData(data, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprint(mac, data)
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
