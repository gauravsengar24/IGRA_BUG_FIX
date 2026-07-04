# Test Directory

This project uses multiple testing approaches for reliable testing of raw EVM bytecode contracts:

1. **Reth-based testing** (see [`./reth-testing/README.md`](./reth-testing/README.md)) - Production-like testing with real block building
2. **Hardhat local testing** (see [`./hardhat-testing/README.md`](./hardhat-testing/README.md)) - Fast local testing with bytecode modification and system address impersonation

## Directory Structure

- **`reth-testing/`** - Reth-specific testing files (Docker configs, reth scripts, Makefile)
- **`hardhat-testing/`** - Hardhat-based tests, including storage/state override simulations
- **`common/`** - Shared files used by both approaches (contracts, package.json, compilation artifacts)

### Reth-based Testing

- Uses direct RPC calls via Node.js and ethers.js
- Bypasses Foundry's call tracer limitations
- Uses the same execution engine (reth) as Igra L2 nodes
- Provides accurate testing environment matching production
- **Naturally tests the `set()` function**: The EL client (reth) automatically calls `set()` during block building, providing real-world testing of this critical function
- Run with: `cd test/reth-testing && ./scripts/run-tests.sh` (automatically compiles contracts if needed)
- Detailed setup: `test/reth-testing/README.md`

### Hardhat Local Testing

- Fast local testing using Hardhat's network
- Modifies bytecode on-the-fly to use a test system address
- Impersonates system address to directly test `set()` function
- Tests index wrapping over 8191 and other edge cases
- Run with: `cd test/hardhat-testing && npm test`
- Detailed setup: `test/hardhat-testing/README.md`

## Comparison with Other Testing Approaches

| Feature                     | Hardhat Local                      | Reth-based      |
|-----------------------------|------------------------------------|-----------------|
| Direct `set()` testing      | ✅ Yes (via impersonation)          | ✅ Yes (natural) |
| Index wrapping tests        | ✅ Yes (via timestamp manipulation) | ⚠️ Limited      |
| Production-like environment | ❌ No                               | ✅ Yes           |
| Speed                       | ✅ Very fast                        | ⚠️ Slower       |
| Real block building         | ❌ No                               | ✅ Yes           |
| Bytecode modification       | ⚠️ Required                        | ❌ No            |
