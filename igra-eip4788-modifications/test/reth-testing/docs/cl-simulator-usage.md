# CL Simulator Usage Guide

## Overview

The JavaScript CL Simulator (`cl-simulator/main.js`) is a lightweight Consensus Layer simulator for testing. It simulates a Consensus Layer client by communicating with reth's Engine API to create blocks.

## Advantages

1. **Simpler Setup**: Lightweight JavaScript implementation
2. **Faster Startup**: JavaScript starts faster than Rust binaries
3. **Easier to Modify**: Can easily adjust block creation logic
4. **Smaller Footprint**: No need for full CL client
5. **Better for Testing**: Can simulate specific scenarios

## Usage

### Option 1: Use Docker Compose (Recommended)

Use the docker-compose file that includes the simulator:

```bash
cd test/reth-testing
docker compose -f docker/docker-compose.yml up -d
```

### Option 2: Run Simulator Manually

You can also run the simulator directly (useful for debugging):

```bash
cd test/reth-testing
node cl-simulator/main.js
```

Make sure reth EL is running and accessible.

## Configuration

The simulator can be configured via environment variables:

- `EL_ENGINE_API_URL`: Engine API endpoint (default: `http://reth-el:8551`)
- `EL_RPC_URL`: RPC endpoint for getting block info (default: `http://reth-el:8545`)
- `CL_HTTP_PORT`: HTTP API port for health checks (default: `5052`)
- `JWT_SECRET_PATH`: Path to JWT secret file (default: `/jwt-secret/jwt.hex`)
- `BLOCK_INTERVAL`: Block creation interval in seconds (default: `12`)
- `FEE_RECIPIENT`: Fee recipient address (default: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`)

## How It Works

1. **Initialization**:
   - Loads JWT secret for Engine API authentication
   - Connects to reth EL via Engine API
   - Gets genesis block state

2. **Block Creation**:
   - Periodically (every 12 seconds by default):
     - Gets current head block
     - Calculates next block parameters (timestamp, prevRandao)
     - Calls forkchoice update (best supported version)
     - If payload ID is returned, fetches payload (best supported version)
     - Proposes payload (best supported version)
     - Updates fork choice to finalize block

3. **HTTP API**:
   - Provides health check endpoint: `GET /eth/v1/node/health`
   - Provides syncing endpoint: `GET /eth/v1/node/syncing`
   - Provides genesis endpoint: `GET /eth/v1/beacon/genesis`

## Testing

After starting the simulator, run tests as usual:

```bash
make test
# or
./scripts/run-tests.sh
# or
npm run test:run
```

**Note**: These commands automatically compile contracts if needed. If running `npm test` directly, ensure contracts are compiled first with `cd ../common && npm run compile`.

The tests work with the CL simulator providing block production.

## Features

| Feature | Simulator |
|---------|-----------|
| Startup Time | ~1-2 seconds |
| Image Size | ~50MB (node:18-alpine) |
| Block Creation | Simple, configurable |
| Beacon API | Minimal (health checks) |
| Validator Support | No |
| Use Case | Testing |

## Limitations

1. **Not a Real CL**: Doesn't implement full consensus logic
2. **No Validator Support**: Can't sign blocks (but EL can create blocks without CL signatures for testing)
3. **Limited Beacon API**: Only implements minimal endpoints needed for tests
4. **Simple Block Creation**: Uses fixed intervals, doesn't handle complex fork choice scenarios

## Troubleshooting

### Simulator Won't Start

Check JWT secret path:
```bash
ls -la config/jwt-secret/jwt.hex
```

### Blocks Not Being Created

Check simulator logs:
```bash
docker compose -f docker/docker-compose.simulator.yml logs cl-simulator
```

Verify EL is accessible:
```bash
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## Related Docs

- Known payload attribute behavior: `test/reth-testing/docs/payload-attributes-verification.md`
- Historical notes and investigations: `test/reth-testing/docs/cl-simulator-summary.md`, `test/reth-testing/docs/cl-simulator-investigation.md`, `test/reth-testing/docs/cl-simulator-status.md`

### Health Check Failing

Verify HTTP API is accessible:
```bash
curl http://localhost:5052/eth/v1/node/health
```

### Engine API Authentication Errors

Make sure JWT secret is correctly mounted and accessible:
```bash
docker exec cl-simulator-node cat /jwt-secret/jwt.hex
```

## Implementation Details

### JWT Authentication

The simulator generates JWT tokens for Engine API authentication using the shared JWT secret. Tokens are regenerated when they expire (1 hour expiry).

### Block Creation Flow

1. Get current head block via RPC
2. Calculate next block parameters
3. Call `engine_forkchoiceUpdated*` with payload attributes (best supported version)
4. If payload ID returned, fetch payload via `engine_getPayload*`
5. Propose payload via `engine_newPayload*`
6. Update fork choice to finalize block

### Error Handling

The simulator continues running even if individual block creation attempts fail. Errors are logged but don't stop the simulator.
