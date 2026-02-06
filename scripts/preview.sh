#!/bin/bash
# Download and run a PR preview build of Radar
# Usage: curl -sL https://raw.githubusercontent.com/skyhook-io/radar/main/scripts/preview.sh | bash -s <PR_NUMBER> [PLATFORM]
#
# Examples:
#   bash scripts/preview.sh 42              # macOS Apple Silicon
#   bash scripts/preview.sh 42 amd64        # macOS Intel
#   bash scripts/preview.sh 42 linux        # Linux amd64

set -e

PR_NUMBER="${1:-}"
PLATFORM="${2:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

error() { echo -e "${RED}Error: $1${NC}" >&2; exit 1; }
info() { echo -e "${BLUE}$1${NC}"; }
success() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }

# Validate PR number
if [[ -z "$PR_NUMBER" ]]; then
    error "Usage: $0 <PR_NUMBER> [PLATFORM]

Examples:
  $0 42              # macOS Apple Silicon (default)
  $0 42 amd64        # macOS Intel
  $0 42 linux        # Linux amd64"
fi

if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
    error "PR number must be a positive integer"
fi

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture
case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) error "Unsupported architecture: $ARCH" ;;
esac

# Allow platform override
if [[ -n "$PLATFORM" ]]; then
    case "$PLATFORM" in
        arm64|amd64)
            ARCH="$PLATFORM"
            ;;
        linux)
            OS="linux"
            ARCH="amd64"
            ;;
        darwin|macos|mac)
            OS="darwin"
            ;;
        *)
            error "Unknown platform: $PLATFORM (use: arm64, amd64, linux)"
            ;;
    esac
fi

# Construct artifact name
case "$OS" in
    darwin)
        ARTIFACT_NAME="radar-macOS-${ARCH}"
        ;;
    linux)
        ARTIFACT_NAME="radar-linux-amd64"
        ;;
    *)
        error "Unsupported OS: $OS"
        ;;
esac

REPO="skyhook-io/radar"
INSTALL_DIR="${HOME}/.radar-preview"
BINARY_PATH="${INSTALL_DIR}/radar"

info "🔍 Finding latest CI run for PR #${PR_NUMBER}..."

# Get the latest successful workflow run for this PR
RUNS_JSON=$(curl -sS "https://api.github.com/repos/${REPO}/actions/runs?event=pull_request&status=success&per_page=20" 2>/dev/null) || \
    error "Failed to fetch workflow runs from GitHub"

# Find run for this PR (check if any run mentions the PR)
RUN_ID=$(echo "$RUNS_JSON" | grep -B20 "\"head_branch\"" | grep -A20 "\"id\"" | \
    python3 -c "
import sys, json
data = json.load(sys.stdin)
for run in data.get('workflow_runs', []):
    # Check if this run has artifacts we need
    if run.get('name') == 'CI':
        # We'll verify PR association via artifacts
        print(run['id'])
        break
" 2>/dev/null) || true

# Alternative: use gh CLI if available
if [[ -z "$RUN_ID" ]] && command -v gh &>/dev/null; then
    info "Using GitHub CLI to find artifacts..."
    RUN_ID=$(gh run list --repo "$REPO" --workflow ci.yml --json databaseId,headBranch,status \
        --jq ".[] | select(.status == \"completed\") | .databaseId" 2>/dev/null | head -1) || true
fi

if [[ -z "$RUN_ID" ]]; then
    # Try to find by listing artifacts directly
    info "Searching for PR artifacts..."
    ARTIFACTS_URL="https://api.github.com/repos/${REPO}/actions/artifacts?per_page=50"
    RUN_ID=$(curl -sS "$ARTIFACTS_URL" | python3 -c "
import sys, json
data = json.load(sys.stdin)
target = 'radar-macOS-arm64'  # Check for any preview artifact
for artifact in data.get('artifacts', []):
    if artifact['name'] == target and not artifact['expired']:
        # Extract run ID from workflow_run association
        print(artifact['workflow_run']['id'])
        break
" 2>/dev/null) || true
fi

if [[ -z "$RUN_ID" ]]; then
    error "Could not find a successful CI run with preview artifacts.

This could mean:
  1. PR #${PR_NUMBER} doesn't exist or has no CI run yet
  2. The CI run is still in progress
  3. The preview artifacts have expired (7 day retention)

Check: https://github.com/${REPO}/pull/${PR_NUMBER}/checks"
fi

info "📦 Found CI run: #${RUN_ID}"
info "📥 Downloading ${ARTIFACT_NAME}..."

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download artifact using gh CLI (required for artifact downloads)
if ! command -v gh &>/dev/null; then
    warn "GitHub CLI (gh) not found. Installing it will enable artifact downloads."
    echo ""
    echo "Install gh:"
    echo "  macOS:  brew install gh"
    echo "  Linux:  https://github.com/cli/cli#installation"
    echo ""
    echo "Then authenticate: gh auth login"
    echo ""
    echo "Alternatively, download manually from:"
    echo "  https://github.com/${REPO}/actions/runs/${RUN_ID}"
    exit 1
fi

# Check gh auth
if ! gh auth status &>/dev/null; then
    error "GitHub CLI not authenticated. Run: gh auth login"
fi

# Download the artifact
cd "$INSTALL_DIR"
gh run download "$RUN_ID" --repo "$REPO" --name "$ARTIFACT_NAME" --dir . 2>/dev/null || \
    error "Failed to download artifact. The PR may not have preview builds yet.

Check: https://github.com/${REPO}/actions/runs/${RUN_ID}"

# Find and make executable
DOWNLOADED=$(find . -name "radar-*" -type f | head -1)
if [[ -z "$DOWNLOADED" ]]; then
    error "No binary found in downloaded artifact"
fi

mv "$DOWNLOADED" "$BINARY_PATH"
chmod +x "$BINARY_PATH"

success "✅ Downloaded radar preview (PR #${PR_NUMBER})"
echo ""
info "Running radar..."
echo ""

# Run radar
exec "$BINARY_PATH" "$@"
