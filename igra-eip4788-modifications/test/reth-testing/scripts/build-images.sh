#!/bin/bash
# Script to build Docker images, handling credential issues

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Building Docker images..."

# The credential error usually happens when Docker tries to use a credential helper
# for public images. We can work around this by:
# 1. Using DOCKER_BUILDKIT=0 to avoid credential helper during build
# 2. Or pulling images first without credential helper

echo "Attempting to build images..."

# Try building with DOCKER_BUILDKIT=0 first (this often avoids credential helper issues)
if DOCKER_BUILDKIT=0 docker compose -f docker/docker-compose.yml build 2>&1; then
    echo "✓ Build successful!"
    exit 0
fi

# If that failed, try the standard build
echo "Retrying with standard build..."
if docker compose -f docker/docker-compose.yml build 2>&1; then
    echo "✓ Build successful!"
    exit 0
fi

# If both failed, provide helpful error message
echo ""
echo "✗ Build failed. If you see 'error getting credentials', try one of these solutions:"
echo ""
echo "Option 1: Fix Docker credential helper (recommended)"
echo "  Edit ~/.docker/config.json and remove or fix the 'credsStore' or 'credHelpers' entry"
echo ""
echo "Option 2: Pull images manually first"
echo "  docker pull ghcr.io/paradigmxyz/reth:latest"
echo "  Then run: make build"
echo ""
echo "Option 3: Use public registry login (if required)"
echo "  docker login ghcr.io"
echo ""
exit 1
