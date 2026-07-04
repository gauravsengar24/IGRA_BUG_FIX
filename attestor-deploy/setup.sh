#!/bin/bash
# setup.sh - Interactive setup for the Igra Attestor
#
# Usage: ./setup.sh <testnet|mainnet>
#
# Prerequisites: igra-orchestra must be running with the backend and frontend-w1 profiles.

set -euo pipefail
trap 'PRIVATE_KEY=; unset PRIVATE_KEY 2>/dev/null; CONTROLLER_PRIVATE_KEY=; unset CONTROLLER_PRIVATE_KEY 2>/dev/null' EXIT INT TERM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { printf '[%s] ERROR: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; exit 1; }

# --- Validate network argument ---
SELECTED_NETWORK="${1:-}"
if [[ "$SELECTED_NETWORK" != "testnet" && "$SELECTED_NETWORK" != "mainnet" ]]; then
    echo "Usage: ./setup.sh <testnet|mainnet>"
    exit 1
fi

echo "========================================"
echo "  Igra Attestor Setup ($SELECTED_NETWORK)"
echo "========================================"
echo

# --- Prerequisites ---
log "Checking prerequisites..."

command -v docker &>/dev/null || die "Docker is not installed."
docker compose version &>/dev/null || die "Docker Compose is not installed."
docker info &>/dev/null || die "Docker daemon is not running."
log "Docker: OK"

# --- Environment ---
ENV_TEMPLATE=".env.example.${SELECTED_NETWORK}"
if [[ ! -f .env ]]; then
    if [[ ! -f "$ENV_TEMPLATE" ]]; then
        die "$ENV_TEMPLATE not found. Are you in the deploy directory?"
    fi
    cp "$ENV_TEMPLATE" .env
    chmod 600 .env
    log "Created .env from $ENV_TEMPLATE"
else
    log "Using existing .env"
fi

# Source .env to read NETWORK
set -a
# shellcheck source=/dev/null
source .env
set +a

# Validate that .env NETWORK matches the requested network
if [[ "$NETWORK" != "$SELECTED_NETWORK" ]]; then
    die "Existing .env has NETWORK=$NETWORK but you requested $SELECTED_NETWORK. Remove .env and re-run, or edit .env manually."
fi

# Check if template has a newer ATTESTOR_VERSION
TEMPLATE_VERSION=$(grep '^ATTESTOR_VERSION=' "$ENV_TEMPLATE" | cut -d= -f2)
if [[ -n "$TEMPLATE_VERSION" && "$TEMPLATE_VERSION" != "${ATTESTOR_VERSION:-}" ]]; then
    echo "A new attestor version is available: ${TEMPLATE_VERSION} (current: ${ATTESTOR_VERSION:-unknown})"
    read -r -p "Update to ${TEMPLATE_VERSION}? [Y/n]: " update_version
    if [[ ! "$update_version" =~ ^[Nn] ]]; then
        sed -i.bak "s/^ATTESTOR_VERSION=.*/ATTESTOR_VERSION=${TEMPLATE_VERSION}/" .env
        rm -f .env.bak
        ATTESTOR_VERSION="$TEMPLATE_VERSION"
        log "Updated ATTESTOR_VERSION to ${ATTESTOR_VERSION}"
    else
        log "Keeping ATTESTOR_VERSION=${ATTESTOR_VERSION}"
    fi
fi

# Verify orchestra network exists
NETWORK_NAME="igra-orchestra-${NETWORK}_igra-network"
if ! docker network inspect "$NETWORK_NAME" &>/dev/null; then
    die "Docker network '$NETWORK_NAME' not found.\n  Is igra-orchestra running? Start it first with: docker compose --profile backend --profile frontend-w1 up -d"
fi
log "Orchestra network ($NETWORK_NAME): OK"
echo

# --- RPC Endpoint ---
if [[ -n "${RPC_URL:-}" ]]; then
    log "RPC endpoint: $RPC_URL"
    read -r -p "Change RPC endpoint? [y/N]: " change_rpc
    if [[ "$change_rpc" =~ ^[Yy] ]]; then
        read -r -p "RPC endpoint (e.g. https://your-domain.com:8545): " NEW_RPC_URL
        [[ -z "$NEW_RPC_URL" ]] && die "RPC endpoint cannot be empty."
        RPC_URL="$NEW_RPC_URL"
        if grep -q '^RPC_URL=' .env; then
            sed -i.bak "s|^RPC_URL=.*|RPC_URL=${RPC_URL}|" .env
        else
            echo "RPC_URL=${RPC_URL}" >> .env
        fi
        rm -f .env.bak
        log "Updated RPC_URL=$RPC_URL"
    fi
else
    echo "Enter your Traefik RPC endpoint."
    echo "This is your igra-orchestra domain on port 8545."
    echo "Example: https://your-domain.com:8545"
    echo
    read -r -p "RPC endpoint: " RPC_URL
    [[ -z "$RPC_URL" ]] && die "RPC endpoint cannot be empty."
    if grep -q '^RPC_URL=' .env; then
        sed -i.bak "s|^RPC_URL=.*|RPC_URL=${RPC_URL}|" .env
    else
        echo "RPC_URL=${RPC_URL}" >> .env
    fi
    rm -f .env.bak
    log "Saved RPC_URL=$RPC_URL"
fi
echo

# --- Attestation Mode ---
echo "Attestation mode:"
echo "  1) Direct    - Your private key is the registered attester"
echo "  2) Delegated - A cold wallet delegates attestation to a hot wallet"
echo
read -r -p "Select mode [1]: " MODE_CHOICE
MODE_CHOICE="${MODE_CHOICE:-1}"

if [[ "$MODE_CHOICE" == "2" ]]; then
    echo
    echo "--- Delegated Attestation ---"
    echo "The controller (cold wallet) must generate a delegation signature first."
    echo "Run on the controller's machine:"
    echo "  docker run --rm -it igranetwork/attestor:${ATTESTOR_VERSION:-latest} --sign-delegation"
    echo

    read -r -p "Controller address (0x...): " DELEGATION_CONTROLLER
    [[ -z "$DELEGATION_CONTROLLER" ]] && die "Controller address cannot be empty."
    [[ "$DELEGATION_CONTROLLER" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "Invalid controller address format. Expected 0x followed by 40 hex characters."

    read -r -p "Delegation expiry (block number): " DELEGATION_EXP
    [[ -z "$DELEGATION_EXP" ]] && die "Delegation expiry cannot be empty."
    [[ "$DELEGATION_EXP" =~ ^[0-9]+$ ]] || die "Delegation expiry must be a number."

    read -r -p "Delegation signature (0x...): " DELEGATION_SIG
    [[ -z "$DELEGATION_SIG" ]] && die "Delegation signature cannot be empty."
    [[ "$DELEGATION_SIG" =~ ^0x[0-9a-fA-F]{130}$ ]] || die "Invalid signature format. Expected 0x followed by 130 hex characters (65 bytes)."

    # Remove any existing delegation vars from .env before writing
    sed -i.bak '/^# --- Delegated Attestation ---$/d;/^CONTROLLER_ADDRESS=/d;/^DELEGATION_EXPIRY=/d;/^DELEGATION_SIGNATURE=/d' .env
    rm -f .env.bak
    # Append delegation vars to .env
    {
        echo ""
        echo "# --- Delegated Attestation ---"
        echo "CONTROLLER_ADDRESS=${DELEGATION_CONTROLLER}"
        echo "DELEGATION_EXPIRY=${DELEGATION_EXP}"
        echo "DELEGATION_SIGNATURE=${DELEGATION_SIG}"
    } >> .env
    log "Delegation configuration saved to .env"
    echo

    KEY_LABEL="operator private key (hot wallet)"
elif [[ "$MODE_CHOICE" == "1" ]]; then
    # Remove any existing delegation config when switching to direct mode
    sed -i.bak '/^# --- Delegated Attestation ---$/d;/^CONTROLLER_ADDRESS=/d;/^DELEGATION_EXPIRY=/d;/^DELEGATION_SIGNATURE=/d' .env
    rm -f .env.bak
    log "Running in direct attestation mode"
    echo

    KEY_LABEL="attester private key"
else
    die "Invalid choice: $MODE_CHOICE. Expected 1 or 2."
fi

# --- Private Key ---
mkdir -p secrets
chmod 700 secrets

if [[ -f secrets/private_key.txt ]]; then
    log "Private key file already exists: secrets/private_key.txt"
    read -r -p "Overwrite with a new key? [y/N]: " overwrite
    if [[ ! "$overwrite" =~ ^[Yy] ]]; then
        log "Keeping existing key"
        # Ensure permissions are compatible with non-root container (uid=1000)
        chown 1000:1000 secrets/private_key.txt 2>/dev/null || true
        chmod 640 secrets/private_key.txt
    else
        if [[ -t 0 ]]; then
            read -r -s -p "Enter your ${KEY_LABEL}: " PRIVATE_KEY
            echo
        else
            read -r PRIVATE_KEY
        fi
        [[ -z "$PRIVATE_KEY" ]] && die "Private key cannot be empty."
        printf '%s' "$PRIVATE_KEY" > secrets/private_key.txt
        chown 1000:1000 secrets/private_key.txt 2>/dev/null || true
        chmod 640 secrets/private_key.txt
        log "Private key saved"
        PRIVATE_KEY=""
        unset PRIVATE_KEY
    fi
else
    echo "Enter your ${KEY_LABEL}."
    echo "This will be stored in secrets/private_key.txt (permissions 640)."
    echo
    if [[ -t 0 ]]; then
        read -r -s -p "Private key: " PRIVATE_KEY
        echo
    else
        read -r PRIVATE_KEY
    fi
    [[ -z "$PRIVATE_KEY" ]] && die "Private key cannot be empty."
    printf '%s' "$PRIVATE_KEY" > secrets/private_key.txt
    chown 1000:1000 secrets/private_key.txt 2>/dev/null || true
    chmod 640 secrets/private_key.txt
    log "Private key saved"
    PRIVATE_KEY=""
    unset PRIVATE_KEY
fi
echo

# --- Logs directory ---
mkdir -p logs
chmod 755 logs
if ! chown 1000:1000 logs 2>/dev/null; then
    echo "Warning: Could not change ownership of logs/ to UID 1000 (container user)."
    echo "If log writing fails, run: sudo chown 1000:1000 logs/"
fi
echo

# --- Validate Configuration ---
log "Validating configuration..."
ATTESTOR_IMAGE="igranetwork/attestor:${ATTESTOR_VERSION:-latest}"

log "Pulling image: $ATTESTOR_IMAGE"
docker pull "$ATTESTOR_IMAGE" || die "Failed to pull $ATTESTOR_IMAGE"

# Re-source .env to pick up delegation vars
set -a
# shellcheck source=/dev/null
source .env
set +a

VALIDATE_ENV=(
    -e "RPC_URL=${RPC_URL}"
    -e "CONTRACT_ADDRESS=${CONTRACT_ADDRESS}"
    -e "CHAIN_ID=${CHAIN_ID}"
    -e "HEALTH_PORT=${HEALTH_PORT:-8180}"
    -e "METRICS_PORT=${METRICS_PORT:-9190}"
)

if [[ -n "${CONTROLLER_ADDRESS:-}" ]]; then
    VALIDATE_ENV+=(
        -e "CONTROLLER_ADDRESS=${CONTROLLER_ADDRESS}"
        -e "DELEGATION_EXPIRY=${DELEGATION_EXPIRY}"
        -e "DELEGATION_SIGNATURE=${DELEGATION_SIGNATURE}"
    )
fi

if ! docker run --rm --network "$NETWORK_NAME" \
    -v "$(pwd)/secrets/private_key.txt:/run/secrets/private_key:ro" \
    "${VALIDATE_ENV[@]}" "$ATTESTOR_IMAGE" --check; then
    die "Configuration validation failed. Check the values above and try again."
fi
log "Configuration: OK"
echo

# --- Start ---
# Stop any existing attestor container to avoid running with stale config
docker compose down 2>/dev/null || true
log "Starting attestor..."
if ! docker compose up -d; then
    die "Failed to start attestor."
fi
echo

echo "========================================"
echo "  Attestor is running!"
echo "========================================"
echo
echo "Useful commands:"
echo "  docker compose logs -f              # Follow logs"
echo "  curl -s localhost:${HEALTH_PORT:-8180} | jq          # Health status"
echo "  curl -s localhost:${HEALTH_PORT:-8180} | jq .mode    # Check attestation mode"
echo "  curl -s localhost:${METRICS_PORT:-9190} | jq          # Metrics"
echo "  curl -s localhost:${METRICS_PORT:-9190}/prometheus    # Prometheus metrics"
echo "  docker compose down                 # Stop attestor"
echo
