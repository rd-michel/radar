package auth

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

type contextKey struct{}

// Authenticate returns a chi middleware that extracts user identity from
// proxy headers or session cookies. Returns 401 if unauthenticated.
// Exempt paths (health, auth endpoints) are passed through.
// Soft-auth paths (e.g. /api/auth/me) attempt auth but don't 401 on failure.
func Authenticate(cfg Config) func(http.Handler) http.Handler {
	cfg.Defaults()
	secure := cfg.Mode == "oidc" // Secure cookies for OIDC (typically behind TLS)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Exempt paths that don't require auth
			if isExemptPath(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// Try to get user from session cookie first
			if user := parseSessionCookie(r, cfg.Secret); user != nil {
				ctx := context.WithValue(r.Context(), contextKey{}, user)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// In proxy mode, extract from headers and create session
			if cfg.Mode == "proxy" {
				username := r.Header.Get(cfg.UserHeader)
				if username != "" {
					var groups []string
					if g := r.Header.Get(cfg.GroupsHeader); g != "" {
						for _, part := range strings.Split(g, ",") {
							if trimmed := strings.TrimSpace(part); trimmed != "" {
								groups = append(groups, trimmed)
							}
						}
					}

					user := &User{Username: username, Groups: groups}

					// Set session cookie so subsequent requests don't need headers
					http.SetCookie(w, createSessionCookie(user, cfg.Secret, cfg.CookieTTL, secure))

					ctx := context.WithValue(r.Context(), contextKey{}, user)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			// Soft-auth paths: pass through without user (handler decides response)
			if isSoftAuthPath(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// No valid auth found
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{
				"error":    "authentication required",
				"authMode": cfg.Mode,
			})
		})
	}
}

// UserFromContext retrieves the authenticated user from the request context.
// Returns nil when auth is disabled or the user is not authenticated.
func UserFromContext(ctx context.Context) *User {
	user, _ := ctx.Value(contextKey{}).(*User)
	return user
}

// isExemptPath returns true for paths that don't require authentication
func isExemptPath(path string) bool {
	exemptPrefixes := []string{
		"/api/health",
		"/auth/",
	}
	for _, prefix := range exemptPrefixes {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	// Static assets don't require auth
	if !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/mcp") {
		return true
	}
	return false
}

// isSoftAuthPath returns true for paths that should attempt auth but not
// require it. These endpoints work with or without a user in context.
func isSoftAuthPath(path string) bool {
	return path == "/api/auth/me"
}

// AuditLog logs a write operation with user identity
func AuditLog(r *http.Request, namespace, name string) {
	user := UserFromContext(r.Context())
	if user == nil {
		return
	}
	log.Printf("[audit] user=%s groups=%v %s %s ns=%s name=%s",
		user.Username, user.Groups, r.Method, r.URL.Path, namespace, name)
}
