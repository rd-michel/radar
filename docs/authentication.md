# Authentication & Authorization

Radar supports optional user authentication with per-user authorization powered by Kubernetes RBAC. When enabled, each user sees only the namespaces they have access to, and write operations (restart, scale, exec, Helm, etc.) are executed with the user's identity — so K8s RBAC controls what each user can do.

> **No auth by default.** When running locally or without `--auth-mode`, everything works exactly as before — no login, no restrictions.

## How It Works

```
User → [Auth Layer] → Radar Backend → K8s API (as user, via impersonation)
```

1. **Authentication** identifies the user (proxy headers or OIDC login)
2. **Reads** are filtered — Radar discovers which namespaces the user can access via `SubjectAccessReview` and only returns resources from those namespaces
3. **Writes** use K8s impersonation — Radar makes the K8s API call as the authenticated user, so K8s RBAC decides whether it's allowed
4. **UI adapts** — capability checks run per-user, so buttons (exec, restart, scale, Helm) only appear if the user has permission

Radar doesn't have its own role/permission system. It delegates everything to K8s RBAC, which means permissions are managed with standard K8s tooling (`kubectl`, Terraform, GitOps, etc.).

## Auth Modes

| Mode | Flag | Description |
|------|------|-------------|
| `none` | `--auth-mode=none` | No authentication (default) |
| `proxy` | `--auth-mode=proxy` | Auth proxy sets headers with user identity |
| `oidc` | `--auth-mode=oidc` | Built-in OIDC login flow (Google, Okta, Dex, etc.) |

### Proxy Mode

Use this when you already have (or plan to deploy) an auth proxy like [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/), Pomerium, Authelia, or similar. The proxy authenticates users and forwards their identity to Radar via HTTP headers.

**Flow:**
```
Browser → Auth Proxy → Radar
           sets X-Forwarded-User: alice@company.com
           sets X-Forwarded-Groups: sre-team,platform-eng
```

**Helm values:**
```yaml
auth:
  mode: proxy
  # Optional: customize header names (these are the defaults)
  # proxy:
  #   userHeader: X-Forwarded-User
  #   groupsHeader: X-Forwarded-Groups
```

**CLI flags:**
```bash
radar --auth-mode=proxy \
      --auth-user-header=X-Forwarded-User \
      --auth-groups-header=X-Forwarded-Groups
```

> **Security:** Your ingress must strip `X-Forwarded-User` and `X-Forwarded-Groups` headers from external requests to prevent spoofing. The auth proxy should be the **only** path to Radar. Radar logs a warning at startup as a reminder.

### OIDC Mode

Use this when you want Radar to handle login directly — no separate auth proxy needed. Radar redirects to your identity provider (Google, Okta, Dex, Keycloak, etc.), validates the token, and creates a session cookie.

**Flow:**
```
Browser → Radar → redirects to IdP → user logs in → callback → session cookie
```

**Helm values:**
```yaml
auth:
  mode: oidc
  secret: ""  # HMAC key for session cookies (auto-generated if empty, but sessions won't survive pod restarts)
  oidc:
    issuerURL: https://accounts.google.com    # Your OIDC provider
    clientID: your-client-id
    clientSecret: your-client-secret
    redirectURL: https://radar.example.com/auth/callback
    groupsClaim: groups                        # JWT claim containing group membership
```

**Using a K8s Secret for credentials:**
```yaml
auth:
  mode: oidc
  existingSecret: radar-oidc-credentials   # Secret with key "auth-secret"
  oidc:
    issuerURL: https://accounts.google.com
    clientID: your-client-id
    clientSecret: your-client-secret
    redirectURL: https://radar.example.com/auth/callback
```

## Setting Up User Permissions

This is the key part: Radar delegates authorization to K8s RBAC via impersonation. For users to actually do anything, they need K8s RBAC bindings.

### Understanding the Chain

```
Identity Provider (Google, Okta, etc.)
  → returns: username=alice@company.com, groups=[sre-team]

Auth Layer (proxy headers or OIDC token)
  → Radar extracts: user="alice@company.com", groups=["sre-team"]

Radar backend
  → creates impersonated K8s client: act as alice@company.com in group sre-team

K8s API server
  → checks RBAC: does any RoleBinding/ClusterRoleBinding grant "sre-team" this permission?
  → allow or deny
```

K8s RBAC doesn't require users to have ServiceAccounts. It supports binding roles to `User` (a string like `alice@company.com`) and `Group` (a string like `sre-team`). These strings just need to match what the identity provider returns.

### Step 1: Create a ClusterRole with the permissions you want

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: radar-operator
rules:
  # View workloads (most users)
  - apiGroups: ["", "apps", "batch"]
    resources: ["pods", "deployments", "statefulsets", "daemonsets", "services",
                "configmaps", "jobs", "cronjobs", "replicasets", "events"]
    verbs: ["get", "list", "watch"]

  # Restart and scale workloads
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "daemonsets"]
    verbs: ["patch", "update"]

  # View logs
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]

  # Exec into pods (optional — omit for read-only users)
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create"]
```

### Step 2: Bind it to your users or groups

**By group** (recommended — matches group from your identity provider):
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: sre-team-radar-operator
subjects:
  - kind: Group
    name: sre-team                    # Must match the group string from IdP
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: radar-operator
  apiGroup: rbac.authorization.k8s.io
```

**By user:**
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: alice-radar-operator
subjects:
  - kind: User
    name: alice@company.com           # Must match the username from IdP
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: radar-operator
  apiGroup: rbac.authorization.k8s.io
```

**Per-namespace** (use RoleBinding instead of ClusterRoleBinding):
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dev-team-radar-operator
  namespace: staging                  # Only grants access in this namespace
subjects:
  - kind: Group
    name: dev-team
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: radar-operator
  apiGroup: rbac.authorization.k8s.io
```

### Step 3: Verify

After deploying with auth enabled, you can verify impersonation works:

```bash
# Check what alice can do (from a machine with cluster-admin access)
kubectl auth can-i --list --as=alice@company.com --as-group=sre-team

# Check specific permission
kubectl auth can-i get pods -n production --as=alice@company.com --as-group=sre-team
```

## What Users See

When auth is enabled:
- A **username** appears in the Radar header with a logout option
- The **namespace selector** only shows namespaces the user can access
- **Topology, resources, events, dashboard** are filtered to accessible namespaces
- **Cluster-scoped resources** (Nodes, PersistentVolumes, StorageClasses) are currently visible to all authenticated users regardless of namespace permissions — per-resource SAR checks for these are planned for a future release
- **Write buttons** (restart, scale, exec, Helm install, etc.) only appear if the user has permission
- Write operations return **403** from K8s if RBAC denies them (shown as an error toast)
- The **/api/auth/me** endpoint returns the current user info and whether auth is enabled

## ServiceAccount RBAC

When auth is enabled, Radar's ServiceAccount needs two additional permissions (added automatically by the Helm chart):

```yaml
# Impersonate users and groups
- apiGroups: [""]
  resources: ["users", "groups"]
  verbs: ["impersonate"]

# Check permissions for specific users
- apiGroups: ["authorization.k8s.io"]
  resources: ["subjectaccessreviews"]
  verbs: ["create"]
```

The ServiceAccount's existing read permissions (list pods, watch deployments, etc.) continue to power the shared cache. Impersonation is only used for write operations and permission checks.

## Session Cookies

Radar uses stateless HMAC-SHA256 signed cookies for sessions. The cookie contains the username and groups — no server-side session storage.

- **Cookie TTL**: 24 hours by default, configurable with `--auth-cookie-ttl` or `auth.cookieTTL` in Helm values
- **Session secret**: Set `auth.secret` or `RADAR_AUTH_SECRET` env var. If empty, a random key is generated at startup (sessions won't survive pod restarts)
- **For production**: Use `auth.existingSecret` to reference a K8s Secret, so sessions survive restarts

## Configuration Reference

| Parameter | CLI Flag | Helm Value | Default |
|-----------|----------|------------|---------|
| Auth mode | `--auth-mode` | `auth.mode` | `none` |
| Session secret | `--auth-secret` | `auth.secret` | auto-generated |
| Cookie TTL | `--auth-cookie-ttl` | `auth.cookieTTL` | `24h` |
| User header (proxy) | `--auth-user-header` | `auth.proxy.userHeader` | `X-Forwarded-User` |
| Groups header (proxy) | `--auth-groups-header` | `auth.proxy.groupsHeader` | `X-Forwarded-Groups` |
| OIDC issuer | `--auth-oidc-issuer` | `auth.oidc.issuerURL` | — |
| OIDC client ID | `--auth-oidc-client-id` | `auth.oidc.clientID` | — |
| OIDC client secret | `--auth-oidc-client-secret` | `auth.oidc.clientSecret` | — |
| OIDC redirect URL | `--auth-oidc-redirect-url` | `auth.oidc.redirectURL` | — |
| OIDC groups claim | `--auth-oidc-groups-claim` | `auth.oidc.groupsClaim` | `groups` |

## Troubleshooting

### Users get 401 on every request

- **Proxy mode**: Check that the auth proxy is setting `X-Forwarded-User`. Inspect with:
  ```bash
  kubectl logs -n radar -l app.kubernetes.io/name=radar | grep "auth"
  ```
- **OIDC mode**: Verify the issuer URL, client ID, and redirect URL are correct. Check Radar logs for OIDC errors.

### Users authenticate but can't see any resources

The user has no K8s RBAC bindings. Radar runs `SubjectAccessReview` to discover accessible namespaces — with no bindings, the result is zero namespaces. Create a RoleBinding or ClusterRoleBinding for the user/group.

### Write operations return 403

The user's K8s RBAC doesn't include the required verb. Check with:
```bash
kubectl auth can-i patch deployments -n <namespace> \
  --as=<username> --as-group=<group>
```

### Impersonation errors in Radar logs

Radar's ServiceAccount is missing impersonation permissions. Verify:
```bash
kubectl auth can-i impersonate users \
  --as=system:serviceaccount:radar:radar
```

If using `rbac.create: false` in Helm, make sure your custom ClusterRole includes the impersonation rules.
