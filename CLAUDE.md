# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

Radar is a modern Kubernetes visibility tool — local-first, no account required, no cloud dependency, fast. It provides topology visualization, event timeline, service traffic maps, resource browsing, and Helm management. Runs as a kubectl plugin (`kubectl-radar`) or standalone binary and opens a web UI in the browser. Open source, free forever. Built by Skyhook.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Machine                          │
│                                                                 │
│   ┌─────────────────┐                   ┌───────────────────┐  │
│   │    Browser      │◄── HTTP/SSE/WS ──►│  Radar Binary     │  │
│   │  (React + UI)   │                   │  (Go + Embedded)  │  │
│   └─────────────────┘                   └───────────────────┘  │
│                                                  │              │
└──────────────────────────────────────────────────│──────────────┘
                                                   │
                                         ┌─────────┴─────────┐
                                         │  kubeconfig       │
                                         │  (~/.kube/config) │
                                         └─────────┬─────────┘
                                                   │
                                         ┌─────────┴─────────┐
                                         │  Kubernetes API   │
                                         │  (direct access)  │
                                         └───────────────────┘
```

## Project Structure

```
radar/
├── cmd/
│   ├── explorer/              # CLI entry point (main.go)
│   └── desktop/               # Desktop app entry point (Tauri/Wails)
├── internal/
│   ├── app/                   # Application lifecycle management
│   ├── helm/                  # Helm client integration
│   │   ├── client.go          # Helm SDK wrapper
│   │   ├── handlers.go        # HTTP handlers for Helm operations
│   │   └── types.go           # Helm release types
│   ├── images/                # Container image analysis
│   ├── k8s/
│   │   ├── cache.go           # Typed informer caching
│   │   ├── capabilities.go    # Cluster capability detection
│   │   ├── client.go          # K8s client initialization
│   │   ├── cluster_detection.go # GKE/EKS/AKS platform detection
│   │   ├── connection_state.go  # Connection state tracking
│   │   ├── context_manager.go   # Multi-context kubeconfig switching
│   │   ├── discovery.go       # API resource discovery for CRDs
│   │   ├── dynamic_cache.go   # CRD/dynamic resource support
│   │   ├── ephemeral.go       # Ephemeral/debug containers
│   │   ├── history.go         # Change history tracking
│   │   ├── metrics.go         # Pod/node metrics collection
│   │   ├── metrics_history.go # Metrics history tracking
│   │   ├── subsystems.go      # Cache subsystem management
│   │   └── update.go          # Resource update/delete operations
│   ├── server/
│   │   ├── server.go          # chi router, main REST endpoints
│   │   ├── sse.go             # Server-Sent Events broadcaster
│   │   ├── exec.go            # WebSocket pod terminal exec
│   │   ├── logs.go            # Pod logs streaming
│   │   ├── workload_logs.go   # Workload-level log aggregation
│   │   ├── portforward.go     # Port forwarding sessions
│   │   ├── dashboard.go       # Dashboard summary endpoint
│   │   ├── argo_handlers.go   # ArgoCD sync/refresh/suspend handlers
│   │   ├── flux_handlers.go   # FluxCD reconcile/suspend handlers
│   │   ├── gitops_types.go    # Shared GitOps request/response types
│   │   ├── traffic_handlers.go # Service mesh traffic flow handlers
│   │   └── desktop_update.go  # Desktop app auto-update handlers
│   ├── static/                # Embedded frontend files
│   ├── timeline/              # Timeline event storage (memory/SQLite)
│   ├── topology/
│   │   ├── builder.go         # Topology graph construction
│   │   ├── pod_grouping.go    # Pod grouping/collapsing logic
│   │   ├── relationships.go   # Resource relationship detection
│   │   └── types.go           # Node, edge, topology definitions
│   ├── traffic/               # Service mesh traffic analysis
│   ├── updater/               # Binary self-update logic
│   └── version/               # Version information
├── web/                       # React frontend (embedded at build)
│   ├── src/
│   │   ├── api/               # API client + SSE hooks
│   │   ├── components/
│   │   │   ├── dock/          # Bottom dock with terminal/logs tabs
│   │   │   ├── gitops/        # ArgoCD/FluxCD management panels
│   │   │   ├── helm/          # Helm release management UI
│   │   │   ├── home/          # Home/dashboard view
│   │   │   ├── logs/          # Logs viewer component
│   │   │   ├── portforward/   # Port forward manager
│   │   │   ├── resource/      # Single resource detail page
│   │   │   ├── resource-drawer/ # Resource drawer overlay
│   │   │   ├── resources/     # Resource list panels
│   │   │   ├── timeline/      # Timeline view (activity & changes)
│   │   │   ├── topology/      # Graph visualization
│   │   │   ├── traffic/       # Traffic flow visualization
│   │   │   └── ui/            # Base shadcn/ui components
│   │   ├── contexts/          # React contexts (capabilities, theme, etc.)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── types.ts           # TypeScript type definitions
│   │   └── utils/             # Topology and utility functions
│   └── package.json
├── deploy/                    # Docker, Helm, Krew configs
└── Makefile
```

## Development Commands

### Backend (Go)
```bash
# Build binary
go build -o radar ./cmd/explorer

# Run in dev mode (serves frontend from filesystem, not embedded)
go run ./cmd/explorer --dev

# Run tests
go test ./...

# Hot reload with Air (port 9280)
make watch-backend
```

### Frontend (React)
```bash
cd web

# Install dependencies
npm install

# Development server with hot reload (port 9273)
npm run dev

# Build for production (outputs to web/dist)
npm run build

# Type check
npm run tsc
```

### Full Build
```bash
# Build everything (frontend + embedded binary)
make build

# Run the complete application
./radar

# Other Makefile targets
make frontend       # Build frontend only
make backend        # Build backend only
make watch-frontend # Vite dev server (port 9273)
make watch-backend  # Air hot reload (port 9280)
make test           # Run all tests
make docker         # Build Docker image
```

### Development Ports
- **9280**: Backend API server (Go)
- **9273**: Vite dev server (proxies /api to 9280)

## CLI Flags

```
--kubeconfig        Path to kubeconfig file (default: ~/.kube/config)
--namespace         Initial namespace filter (empty = all namespaces)
--port              Server port (default: 9280)
--no-browser        Don't auto-open browser
--dev               Development mode (serve frontend from web/dist instead of embedded)
--version           Show version and exit
--timeline-storage  Timeline storage backend: memory or sqlite (default: memory)
--timeline-db       Path to timeline SQLite database (default: ~/.radar/timeline.db)
--history-limit     Maximum number of events to retain in timeline (default: 10000)
```

## API Endpoints

### Core
```
GET  /api/health                              # Health check with resource count
GET  /api/version-check                       # Check for newer radar versions
GET  /api/dashboard                           # Dashboard summary (counts, health)
GET  /api/dashboard/crds                      # CRD summary for dashboard
GET  /api/cluster-info                        # Platform detection (GKE, EKS, AKS, etc.)
GET  /api/capabilities                        # Cluster capability flags
GET  /api/namespaces                          # List all namespaces
GET  /api/api-resources                       # API resource discovery for CRDs
GET  /api/connection                          # Connection status
POST /api/connection/retry                    # Retry failed connection
GET  /api/contexts                            # List kubeconfig contexts
POST /api/contexts/{name}                     # Switch kubeconfig context
GET  /api/sessions                            # List active sessions
```

### Topology
```
GET  /api/topology                            # Full topology graph
GET  /api/topology?namespace=X                # Namespace-filtered
GET  /api/topology?view=traffic|resources     # View mode selection
```

### Resources
```
GET    /api/resources/{kind}                  # List resources by kind
GET    /api/resources/{kind}?namespace=X      # Namespace-filtered list
GET    /api/resources/{kind}/{ns}/{name}      # Single resource with relationships
PUT    /api/resources/{kind}/{ns}/{name}      # Update resource from YAML
DELETE /api/resources/{kind}/{ns}/{name}      # Delete resource
```

### Events & Changes
```
GET  /api/events                              # Recent K8s events
GET  /api/events?namespace=X                  # Namespace-filtered events
GET  /api/events/stream                       # SSE stream for real-time events
GET  /api/changes                             # Timeline of resource changes
GET  /api/changes?namespace=X&kind=Y&limit=N  # Filtered change history
GET  /api/changes/{kind}/{ns}/{name}/children # Child resource changes
```

### Pod Operations
```
GET  /api/pods/{ns}/{name}/logs               # Fetch pod logs (non-streaming)
GET  /api/pods/{ns}/{name}/logs/stream        # Stream pod logs via SSE
GET  /api/pods/{ns}/{name}/exec               # WebSocket for pod terminal exec
POST /api/pods/{ns}/{name}/debug              # Create ephemeral debug container
```

### Workload Operations
```
GET  /api/workloads/{kind}/{ns}/{name}/logs        # Aggregated logs across pods
GET  /api/workloads/{kind}/{ns}/{name}/logs/stream # Stream aggregated workload logs
GET  /api/workloads/{kind}/{ns}/{name}/pods        # List pods for a workload
POST /api/workloads/{kind}/{ns}/{name}/restart     # Rolling restart workload
POST /api/workloads/{kind}/{ns}/{name}/scale       # Scale workload replicas
```

### CronJob Operations
```
POST /api/cronjobs/{ns}/{name}/trigger        # Trigger manual job from CronJob
POST /api/cronjobs/{ns}/{name}/suspend        # Suspend CronJob schedule
POST /api/cronjobs/{ns}/{name}/resume         # Resume CronJob schedule
```

### Metrics
```
GET  /api/metrics/pods/{ns}/{name}            # Current pod metrics
GET  /api/metrics/pods/{ns}/{name}/history    # Pod metrics history
GET  /api/metrics/nodes/{name}                # Current node metrics
GET  /api/metrics/nodes/{name}/history        # Node metrics history
```

### Port Forwarding
```
GET    /api/portforwards                           # List active port forward sessions
POST   /api/portforwards                           # Start a new port forward
DELETE /api/portforwards/{id}                      # Stop a port forward
GET    /api/portforwards/available/{type}/{ns}/{name} # Get available ports for pod/service
```

### Helm Management
```
GET    /api/helm/releases                          # List all Helm releases
GET    /api/helm/releases/{ns}/{name}              # Get release details
GET    /api/helm/releases/{ns}/{name}/manifest     # Get rendered manifest
GET    /api/helm/releases/{ns}/{name}/values       # Get release values
GET    /api/helm/releases/{ns}/{name}/diff         # Diff between revisions
GET    /api/helm/releases/{ns}/{name}/upgrade-info # Check upgrade availability
GET    /api/helm/upgrade-check                     # Batch check for upgrades
POST   /api/helm/releases/{ns}/{name}/rollback     # Rollback to previous revision
POST   /api/helm/releases/{ns}/{name}/upgrade      # Upgrade to new version
DELETE /api/helm/releases/{ns}/{name}              # Uninstall release
```

### GitOps — ArgoCD
```
POST /api/argo/applications/{ns}/{name}/sync      # Trigger ArgoCD sync
POST /api/argo/applications/{ns}/{name}/refresh   # Refresh application state
POST /api/argo/applications/{ns}/{name}/terminate # Terminate running sync
POST /api/argo/applications/{ns}/{name}/suspend   # Suspend auto-sync
POST /api/argo/applications/{ns}/{name}/resume    # Resume auto-sync
```

### GitOps — FluxCD
```
POST /api/flux/{kind}/{ns}/{name}/reconcile       # Trigger reconciliation
POST /api/flux/{kind}/{ns}/{name}/sync-with-source # Reconcile with source update
POST /api/flux/{kind}/{ns}/{name}/suspend         # Suspend reconciliation
POST /api/flux/{kind}/{ns}/{name}/resume          # Resume reconciliation
```

### Traffic (Service Mesh)
```
GET  /api/traffic/sources                     # Available traffic data sources
GET  /api/traffic/source                      # Active traffic source
POST /api/traffic/source                      # Set active traffic source
GET  /api/traffic/flows                       # Current traffic flows
GET  /api/traffic/flows/stream                # SSE stream for traffic flows
POST /api/traffic/connect                     # Connect to traffic source
GET  /api/traffic/connection                  # Traffic connection status
```

## Key Patterns

### K8s Caching
- Uses SharedInformers for watch-based caching of typed resources
- Dynamic caching for CRDs and custom resource types via API discovery
- Memory-efficient with field stripping (removes managed fields, last-applied annotations)
- Change notifications via channel for real-time SSE updates
- Supports: Pods, Services, Deployments, DaemonSets, StatefulSets, ReplicaSets, Ingresses, ConfigMaps, Secrets, Events, Jobs, CronJobs, HorizontalPodAutoscalers, PersistentVolumeClaims, Nodes, Namespaces

### Server-Sent Events (SSE)
- Central `SSEBroadcaster` manages connected clients
- Per-client namespace filters and view mode tracking
- Cached topology for relationship lookups
- Heartbeat mechanism for connection health
- Event types: topology changes, K8s events, resource updates

### WebSocket Pod Exec
- Full terminal emulation via xterm.js in browser
- Container and shell selection support
- Terminal resize handling with size queue
- TTY, stdin, stdout, stderr support

### Topology Builder
- Constructs directed graph from K8s resources
- Owner reference traversal for parent-child relationships
- Selector-based matching for Service→Pod, Deployment→ReplicaSet
- Two view modes:
  - `traffic`: Network flow (Ingress/Gateway → HTTPRoute → Service → Pod)
  - `resources`: Full hierarchy (Deployment → ReplicaSet → Pod)
- Node types: Ingress, Gateway, HTTPRoute, GRPCRoute, TCPRoute, TLSRoute, Service, Deployment, DaemonSet, StatefulSet, ReplicaSet, Pod, Job, CronJob, ConfigMap, Secret, HorizontalPodAutoscaler, PersistentVolumeClaim
- GitOps nodes: Application (ArgoCD), Kustomization, HelmRelease, GitRepository (FluxCD)
  - Connected to managed resources via status.resources (ArgoCD) or status.inventory (FluxCD Kustomization)
  - HelmRelease connects to resources via FluxCD labels (`helm.toolkit.fluxcd.io/name`) or standard Helm label (`app.kubernetes.io/instance`). Matches Deployment, Service, StatefulSet, DaemonSet, Job, CronJob, Rollout.
  - **Single-cluster limitation**: Radar only shows connections when GitOps controller and managed resources are in the same cluster. ArgoCD commonly deploys to remote clusters (hub-spoke model), so Application→resource edges won't appear when connected to the ArgoCD cluster. FluxCD typically deploys to its own cluster, so connections usually work.

### Timeline
- In-memory or SQLite storage for event tracking (`--timeline-storage`)
- Records: resource kind, name, namespace, change type, timestamp, owner info, health state
- Configurable limit (default: 10000 events)
- Supports grouping by owner, app label, or namespace

### Resource Relationships
- Computed at query time for resource detail views
- Tracks: parent (owner), children (owned), config (ConfigMaps/Secrets), network (Services/Ingresses/Gateways/Routes)
- Used for topology edges and change propagation

### Error Handling (Backend)
All HTTP handlers use the simple `writeError` pattern:
```go
s.writeError(w, http.StatusXXX, "error message")
// Returns: {"error": "error message"}
```

**HTTP Status Code Conventions:**
- `400 Bad Request`: Invalid input (missing params, invalid YAML, unknown resource kind)
- `404 Not Found`: Resource doesn't exist
- `409 Conflict`: Operation already in progress (e.g., sync running)
- `503 Service Unavailable`: Client/cache not initialized
- `500 Internal Server Error`: Unexpected errors (always log before returning)

**Logging Convention:**
Always log 500 errors with context before returning:
```go
log.Printf("[module] Failed to <action> %s/%s: %v", namespace, name, err)
s.writeError(w, http.StatusInternalServerError, err.Error())
```

**K8s Error Detection:**
Use `apierrors.IsNotFound(err)` for proper K8s error type checking:
```go
if apierrors.IsNotFound(err) {
    s.writeError(w, http.StatusNotFound, err.Error())
    return
}
```

### Error Handling (Frontend)
The frontend uses React Query mutations with meta for toast messages:
```typescript
useMutation({
  mutationFn: async (...) => { ... },
  meta: {
    errorMessage: 'Failed to update resource',  // Shown in toast
    successMessage: 'Resource updated',
  },
})
```

Error responses are parsed as `{"error": "message"}` and displayed in toasts.

## Tech Stack

### Backend
- Go 1.22+
- client-go (K8s client library)
- chi (HTTP router with middleware)
- gorilla/websocket (WebSocket support for exec)
- helm.sh/helm/v3 (Helm SDK)
- go:embed (frontend embedding)

### Frontend
- React 18 + TypeScript
- Vite (build tool, dev server)
- @xyflow/react + elkjs (graph visualization and layout)
- @xterm/xterm + @xterm/addon-fit (terminal emulation)
- @monaco-editor/react (YAML editing)
- shiki (syntax highlighting)
- @tanstack/react-query v5 (server state management)
- react-router-dom (client-side routing)
- Tailwind CSS + shadcn/ui (styling)
- Lucide React (icons)
- yaml (YAML parsing)

## Server Configuration

### Middleware Stack
- Logger, Recoverer (panic recovery)
- 60-second request timeout
- CORS enabled for `http://localhost:*` and `http://127.0.0.1:*`

### Vite Dev Proxy
In development, Vite proxies `/api` requests to the backend:
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:9280',
    ws: true  // WebSocket support for exec
  }
}
```
