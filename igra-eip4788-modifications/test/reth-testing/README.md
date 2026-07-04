# Reth-based Testing for EIP-4788 Contracts

This directory contains a testing setup that uses a **local EL/CL testnet** with **reth** (Execution Layer) and a **JavaScript CL simulator** (Consensus Layer) to test the modified EIP-4788 contracts. This approach provides a more accurate testing environment for Igra L2, which uses the reth codebase.

## Why Reth-based Testing

This setup mirrors the Igra production environment (reth EL + CL via Engine API) and exercises the contract under real block-building behavior. For the full testing strategy and comparison with Hardhat, see `test/README.md`.

## Setup

### Prerequisites

1. **Docker** with **Docker Compose V2** (built-in `docker compose` command)
2. **Node.js** (v18 or later) and **npm**
3. **curl** (for health checks)

**Note**: Make sure to install npm dependencies before running tests:
```bash
cd test/reth-testing
npm install
```

### Quick Start

1. **Start the local testnet**:
   ```bash
   cd test/reth-testing
   make up
   # or
   docker compose -f docker/docker-compose.yml up -d
   # or
   npm run docker:up
   ```

   This will start:
   - **reth-el**: Execution Layer node (port 8545 for RPC, 8551 for Engine API)
   - **cl-simulator**: JavaScript-based Consensus Layer simulator (port 5052 for HTTP API)

2. **Wait for the nodes to be ready** (usually takes 30-60 seconds):
   ```bash
   # Check if EL RPC is available
   curl http://localhost:8545
   
   # Check if CL API is available
   curl http://localhost:5052/eth/v1/node/health
   ```

3. **Run tests**:
   ```bash
   make test
   # or
   ./scripts/run-tests.sh
   # or
   npm run test:run
   ```

   This will:
   - Install npm dependencies (if needed)
   - Compile wrapper contracts once (if needed)
   - Run tests via direct RPC calls

   Or run manually:
   ```bash
   npm install
   npm run compile
   npm test
   ```

## Architecture

### Local EL/CL Testnet

This testing setup uses **three services**:

1. **reth-el (Execution Layer)**:
   - Port 8545 (HTTP RPC) - **used by tests**
   - Port 8551 (Engine API) - used by CL
   - Port 8546 (WebSocket RPC)
   - Runs with custom genesis file (contracts pre-deployed)
   - Disabled discovery (isolated)

2. **cl-simulator (Consensus Layer Simulator)**:
   - Port 5052 (HTTP API)
   - Port 9000 (Discovery - disabled)
   - Connects to reth via Engine API
   - Generates testnet configuration on first run
   - No external peers (isolated)

   - Signs blocks for the beacon node
   - Enables block production

### Genesis File Deployment

The contracts are deployed via the `genesis.json` file:

- **Modified EIP-4788 Contract**: Deployed at `0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02`
- **RANDAO_READER Contract**: Deployed at `0xFe38D0727B928E19bE51673Ac0691Ca22C05B1B3` (low 20 bytes of `bytes32(uint256(keccak256('eip4788.modified.reader')) - 1)`)

The genesis file includes the full bytecode for both contracts, ensuring they're available from block 0.

### Wrapper Contracts

To provide a clean testing interface, we use Solidity wrapper contracts:

- **`BeaconRootWrapper.sol`**: Wraps calls to the modified EIP-4788 contract
- **`RandaoGetterWrapper.sol`**: Wraps calls to the RANDAO_READER contract

These wrappers use inline assembly to make direct EVM calls to the raw bytecode contracts, bypassing ABI encoding/decoding.

### Test Script

**`scripts/test-contracts.js`** is a Node.js script that:

- Connects to the reth EL node via RPC using ethers.js
- Loads compiled wrapper contracts (compiled once with Hardhat)
- Tests contract functionality via direct RPC calls
- Verifies contract deployment and basic functionality

## Test Coverage

The test script verifies:

1. **Contract Deployment**:
   - ✅ Contracts are deployed at correct addresses
   - ✅ Contract bytecode matches expectations

2. **Wrapper Contract Deployment**:
   - ✅ Wrapper contracts deploy successfully
   - ✅ Wrapper contracts can interact with bytecode contracts

3. **get() Function**:
   - ✅ Can call get() function (will fail if no entry exists, which is expected)
   - ✅ RANDAO_READER can be called
   - ✅ End-to-end header matching and retention checks use the live EL/CL pipeline (no state overrides)

4. **set() Function**:
   - ✅ Access control tested directly - calls from non-SYSTEM_ADDRESS correctly revert
   - ✅ **Naturally tested by the EL client (reth) during block building** - This is a key advantage of the reth-based approach: the EL client automatically calls `set()` for each block during the normal block-building process, exactly as it happens in production. This provides genuine end-to-end testing of the function's functionality, including storage operations, without requiring SYSTEM_ADDRESS impersonation or other workarounds.
   - ✅ Contract bytecode and deployment are verified
   - ⚠️ Cannot be tested via direct RPC calls (requires SYSTEM_ADDRESS caller), but this limitation is overcome by natural testing during block building
   - ✅ The EL client calls set() automatically for each block, verifying its functionality in a production-like environment

**Note:** The reth-based suite is intentionally **end-to-end only**. Any state/storage override tests are run in the Hardhat suite (see `test/hardhat-testing`), not here.

## Configuration

### Environment Variables

- **`RETH_RPC_URL`**: RPC URL for the EL node (default: `http://localhost:8545`)
- **`CL_API_URL`**: HTTP API URL for the CL node (default: `http://localhost:5052`)

### Docker Configuration

The `docker-compose.yml` file configures:

- **Ports**: 
  - `8545`: EL HTTP RPC
  - `8551`: EL Engine API
  - `5052`: CL HTTP API
- **Volumes**: Persistent storage for reth data
- **Health Checks**: Automatic health checking for both services
- **Networks**: Isolated Docker network (no external connections)

## Troubleshooting

### Docker Build Credential Errors

If you see "failed to solve: error getting credentials - err: exit status 1":

**Solution 1: Fix Docker credential helper (recommended)**
```bash
# Edit Docker config to remove problematic credential helper
nano ~/.docker/config.json
# Remove or comment out "credsStore" or "credHelpers" entries for public registries
```

**Solution 2: Pull images manually first**
```bash
docker pull ghcr.io/paradigmxyz/reth:latest
make build
```

**Solution 3: Use build script**
```bash
make build
# The build script handles credential errors automatically
```

### Containers Not Starting

```bash
# Check logs
make logs
# or
docker compose -f docker/docker-compose.yml logs -f

# Restart the services
docker compose -f docker/docker-compose.yml restart
```

### Tests Can't Connect

```bash
# Verify EL RPC is accessible
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check if containers are running
make ps
# or
docker compose -f docker/docker-compose.yml ps
```

### Contract Not Deployed

Verify the genesis file includes the contracts:

```bash
# Check contract code at address using curl
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02","latest"],"id":1}'
```

### CL Not Producing Blocks

```bash
# Check CL logs for errors
docker compose -f docker/docker-compose.yml logs cl-simulator

# Check validator client logs

# Verify CL is connected to EL
curl http://localhost:5052/eth/v1/node/syncing
```

### "Connection refused" Error

If you see "Connection refused" or "could not instantiate forked environment":

1. **Verify the containers are running**:
   ```bash
   make ps
   # or
   docker compose -f docker/docker-compose.yml ps
   ```

2. **Check if RPC is accessible**:
   ```bash
   curl -X POST http://localhost:8545 \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
   ```

3. **Wait for the nodes to be fully ready** (can take 60-90 seconds after startup):
   ```bash
   # The script should handle this automatically, but you can check manually
   docker compose -f docker/docker-compose.yml logs reth-el | tail -20
   docker compose -f docker/docker-compose.yml logs cl-simulator | tail -20
   ```

4. **Restart the services if needed**:
   ```bash
   docker compose -f docker/docker-compose.yml restart
   ```

### npm Dependencies Issues

If you encounter npm dependency issues:

```bash
# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Compilation Issues

If contracts fail to compile:

```bash
# Clean and recompile
rm -rf ../common/artifacts ../common/cache
cd ../common && npm run compile
```

## Advantages of This Approach

1. **Production Accuracy**: Tests run in the same execution environment as Igra
2. **Proper EL/CL Separation**: Realistic testnet with proper Engine API integration
3. **prevrandao Support**: Full support for `prevrandao` opcode via Engine API
4. **No Framework Limitations**: Direct RPC calls bypass testing framework issues
5. **Real Deployment**: Contracts deployed via genesis, exactly as in production
6. **Full EVM Features**: All EVM features work correctly, including system addresses
7. **Natural `set()` Function Testing**: The EL client automatically calls `set()` during block building, providing real-world testing of this critical function that cannot be tested via direct RPC calls. This is a unique advantage that other testing approaches cannot provide.
8. **Isolated Testing**: No external network dependencies, fully reproducible
9. **Simple Setup**: Only requires Node.js and Docker
10. **Fast**: Contracts compiled once, tests run quickly

## Limitations

1. **set() Function Testing**: The `set()` function's access control is tested directly - calls from non-SYSTEM_ADDRESS correctly revert. The function's functionality cannot be tested via direct RPC calls (requires SYSTEM_ADDRESS caller), but **this is actually an advantage of the reth-based approach**: the EL client (reth) automatically calls `set()` during block building for each block, providing natural, production-like testing that other testing frameworks cannot achieve. The contract bytecode and deployment are also verified. This natural testing capability is one of the key reasons why reth-based testing is essential for this project.

2. **Slower Initial Setup**: Full node execution is slower than lightweight testing frameworks (but more accurate)

3. **Requires Docker**: Setup is more complex than standard unit tests

4. **Resource Usage**: reth node consumes resources, but CL simulator is lightweight

5. **Network Dependency**: Tests require running Docker containers

## Project Structure

```
test/reth-testing/
├── config/                # Configuration files
│   ├── genesis.json       # Genesis file with contracts deployed
│   └── jwt-secret/        # JWT secret for EL/CL communication
├── docker/                # Docker-related files
│   ├── docker-compose.yml # Docker Compose configuration
│   ├── Dockerfile.el      # Docker image for reth EL client
│   └── Dockerfile.cl-simulator  # Docker image for CL simulator
├── docs/                  # Reth testing documentation
├── scripts/               # Shell scripts and test scripts
│   ├── run-tests.sh       # Main test runner script
│   ├── test-contracts.js  # Main test script (Node.js)
│   ├── cl-simulator/main.js    # CL simulator script
│   ├── check-engine-api-methods.js
│   └── test-payload-attributes.js
├── hardhat.config.js      # Hardhat configuration (references ../common/contracts)
├── package.json           # Node.js dependencies and scripts
├── Makefile              # Convenience make targets
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

**Note**: Solidity wrapper contracts are located in `../common/contracts/` and compiled artifacts are in `../common/artifacts/`. See [`../common/README.md`](../common/README.md) for details.

## References

- [reth Documentation](https://reth.rs/)
- [ethers.js Documentation](https://docs.ethers.org/)
- [Hardhat Documentation](https://hardhat.org/)
- [EIP-4788 Specification](https://eips.ethereum.org/EIPS/eip-4788)
