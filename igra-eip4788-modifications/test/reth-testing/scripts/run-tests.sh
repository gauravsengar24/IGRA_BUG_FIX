#!/bin/bash
# Script to run tests against local EL/CL testnet (reth + CL simulator)
# Both clients are isolated and not communicating to external networks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "==========================================================="
echo "Reth-based Testing for Igra's version of EIP-4788 Contracts"
echo "Local EL/CL Testnet: reth (EL) + CL Simulator (CL)"
echo "==========================================================="
echo ""

# Check if containers are running
EL_STATUS=$(docker ps -a --filter "name=reth-el-node" --format "{{.Status}}" 2>/dev/null || echo "")
CL_STATUS=$(docker ps -a --filter "name=cl-simulator-node" --format "{{.Status}}" 2>/dev/null || echo "")

if [ -z "$EL_STATUS" ] || ! echo "$EL_STATUS" | grep -q "Up" || \
   [ -z "$CL_STATUS" ] || ! echo "$CL_STATUS" | grep -q "Up"; then
    echo -e "${YELLOW}Warning: EL/CL containers are not running.${NC}"
    
    # Check if images exist, build if needed
    # Try to start - if it fails due to missing images, build them
    if ! docker compose -f docker/docker-compose.yml config >/dev/null 2>&1 || \
       ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "(reth|ghcr.io/paradigmxyz/reth)" || \
       ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -qE "cl-simulator"; then
        echo "Building Docker images first..."
        ./scripts/build-images.sh || {
            echo -e "${RED}Failed to build images. Please fix Docker credential issues first.${NC}"
            echo "See README.md troubleshooting section for solutions."
            exit 1
        }
    fi
    
    echo "Starting local testnet (reth EL + CL simulator)..."
    docker compose -f docker/docker-compose.yml up -d

    echo "Waiting for EL/CL nodes to start..."
    sleep 5
    
    # Wait for EL container to be running and healthy
    MAX_WAIT=90
    echo "Waiting for reth EL node to be ready..."
    for i in $(seq 1 $MAX_WAIT); do
        EL_STATUS=$(docker ps -a --filter "name=reth-el-node" --format "{{.Status}}" 2>/dev/null || echo "")
        if echo "$EL_STATUS" | grep -q "Up" && ! echo "$EL_STATUS" | grep -q "Restarting"; then
            # Check health
            HEALTH=$(docker inspect --format='{{.State.Health.Status}}' reth-el-node 2>/dev/null || echo "none")
            if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "none" ]; then
                echo -e "${GREEN}EL container is running${NC}"
                break
            fi
        fi
        if echo "$EL_STATUS" | grep -q "Restarting"; then
            echo -e "${YELLOW}EL container is restarting, checking logs...${NC}"
            docker compose -f docker/docker-compose.yml logs --tail=20 reth-el 2>&1 | tail -5
        fi
        if [ $i -eq $MAX_WAIT ]; then
            echo -e "${RED}Error: EL container failed to start properly${NC}"
            echo "Container status: $EL_STATUS"
            echo ""
            echo "Recent logs:"
            docker compose -f docker/docker-compose.yml logs --tail=30 reth-el 2>&1 | tail -20
            exit 1
        fi
        sleep 1
    done
    
    # Wait for EL RPC to be available
    echo "Waiting for EL node RPC to be available..."
    MAX_RPC_WAIT=90
    for i in $(seq 1 $MAX_RPC_WAIT); do
        RESPONSE=$(curl -s -X POST http://localhost:8545 \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null || echo "")
        
        if [ -n "$RESPONSE" ] && echo "$RESPONSE" | grep -q "result"; then
            echo -e "${GREEN}EL node RPC is ready!${NC}"
            break
        fi
        if [ $i -eq $MAX_RPC_WAIT ]; then
            echo -e "${RED}Error: EL node RPC did not become ready in time${NC}"
            echo "Last RPC response: $RESPONSE"
            echo ""
            echo "Container logs:"
            docker compose -f docker/docker-compose.yml logs --tail=30 reth-el 2>&1 | tail -20
            exit 1
        fi
        sleep 1
    done
    
    # Wait for CL container to be running
    echo "Waiting for CL simulator to start..."
    MAX_WAIT=60  # CL simulator starts quickly
    for i in $(seq 1 $MAX_WAIT); do
        CL_STATUS=$(docker ps -a --filter "name=cl-simulator-node" --format "{{.Status}}" 2>/dev/null || echo "")
        if echo "$CL_STATUS" | grep -q "Up" && ! echo "$CL_STATUS" | grep -q "Restarting"; then
            echo -e "${GREEN}CL simulator container is running${NC}"
            break
        fi
        if echo "$CL_STATUS" | grep -q "Restarting"; then
            echo -e "${YELLOW}CL simulator container is restarting, checking logs...${NC}"
            docker compose -f docker/docker-compose.yml logs --tail=20 cl-simulator 2>&1 | tail -5
        fi
        if [ $i -eq $MAX_WAIT ]; then
            echo -e "${RED}Error: CL simulator container failed to start properly${NC}"
            echo "Container status: $CL_STATUS"
            echo ""
            echo "Recent logs:"
            docker compose -f docker/docker-compose.yml logs --tail=30 cl-simulator 2>&1 | tail -20
            exit 1
        fi
        sleep 1
    done
    
    # Wait for CL HTTP API to be available (optional, but good to check)
    echo "Waiting for CL simulator HTTP API to be available..."
    MAX_RPC_WAIT=30
    for i in $(seq 1 $MAX_RPC_WAIT); do
        RESPONSE=$(curl -s -f http://localhost:5052/eth/v1/node/health 2>/dev/null || echo "")
        
        if [ -n "$RESPONSE" ]; then
            echo -e "${GREEN}CL simulator HTTP API is ready!${NC}"
            break
        fi
        if [ $i -eq $MAX_RPC_WAIT ]; then
            echo -e "${YELLOW}Warning: CL simulator HTTP API did not become ready in time${NC}"
            echo "Tests will continue, but CL simulator may not be fully ready"
            break
        fi
        sleep 1
    done
fi

# Final RPC connection check (EL node on port 8545)
RPC_RESPONSE=$(curl -s -X POST http://localhost:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null || echo "")

if [ -z "$RPC_RESPONSE" ] || ! echo "$RPC_RESPONSE" | grep -q "result"; then
    echo -e "${RED}Error: Cannot connect to EL node at http://localhost:8545${NC}"
    echo "RPC response: $RPC_RESPONSE"
    echo "Make sure the containers are running: docker compose -f docker/docker-compose.yml up -d"
    echo ""
    echo "Container status:"
    docker ps -a --filter "name=reth-el-node\|cl-simulator-node" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    exit 1
fi

# Check if node_modules exists (dependencies installed)
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
else
    # Check if node-fetch is installed (might be missing even if node_modules exists)
    if [ ! -d "node_modules/node-fetch" ] && ! node -e "require('node-fetch')" 2>/dev/null; then
        echo -e "${YELLOW}Installing missing dependencies...${NC}"
        npm install
    fi
fi

# Check if contracts are compiled
if [ ! -d "../common/artifacts/contracts" ]; then
    echo -e "${YELLOW}Compiling contracts...${NC}"
    npm run compile
fi

# Run tests
echo ""
echo -e "${BLUE}Running tests against local EL/CL testnet...${NC}"
echo -e "${BLUE}EL (reth): http://localhost:8545${NC}"
echo -e "${BLUE}CL (simulator): http://localhost:5052${NC}"
echo ""

RETH_RPC_URL="http://localhost:8545" RETH_TEST_MODE="real" npm test

echo ""
echo -e "${GREEN}Tests completed!${NC}"
