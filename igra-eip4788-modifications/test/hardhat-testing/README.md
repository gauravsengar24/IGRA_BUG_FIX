# Hardhat Local Testing Strategy

This document describes the Hardhat-based local testing strategy for the modified EIP-4788 contract.

## Overview

This testing approach uses Hardhat's local network capabilities to test the modified EIP-4788 contract by:
1. Modifying the bytecode on-the-fly to use a test system address (instead of the real SYSTEM_ADDRESS)
2. Deploying the modified bytecode directly to the EIP-4788 contract address using `hardhat_setCode`
3. Impersonating the test system address to simulate `set()` calls
4. Testing various edge cases including index wrapping over 8191

For the overall testing strategy and comparison with reth-based testing, see `test/README.md`.

## Key Features

### Bytecode Modification

The test script modifies the bytecode to change the SYSTEM_ADDRESS from:
- **Original**: `0xfffffffffffffffffffffffffffffffffffffffe` (cannot be impersonated)
- **Modified**: `0x00fffffffffffffffffffffffffffffffffffffe` (can be impersonated)

This is done by finding the `push20` instruction followed by the SYSTEM_ADDRESS bytes and changing the first byte from `0xff` to `0x00`.

### Deployment

The modified bytecode is deployed directly to the EIP-4788 contract address (`0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02`) using Hardhat's `hardhat_setCode` RPC method. This allows testing without needing to deploy a new contract.

### System Address Impersonation

Hardhat's `hardhat_impersonateAccount` is used to impersonate the test system address, allowing the test script to send transactions from that address and call the `set()` function.

## Test Coverage

### Access Control Tests
- ✅ `set()` calls from TEST_SYSTEM_ADDRESS succeed
- ✅ `set()` calls from regular addresses revert

### Basic Operations
- ✅ Store and retrieve beacon root
- ✅ Store and retrieve prevRandao via RANDAO_READER
- ✅ Reject `get()` with zero timestamp
- ✅ Reject `get()` with wrong calldata size

### Index Wrapping Tests (HISTORY_BUFFER_LENGTH = 8191)
- ✅ Handle index wrapping at boundary (8191 -> 0)
- ✅ Handle multiple wraps (8191 -> 0 -> 1 -> ...)
- ✅ Overwrite old values when index wraps

### Edge Cases
- ✅ Handle maximum uint256 timestamp
- ✅ Handle very large timestamps
- ✅ Handle sequential sets with different timestamps
- ✅ Handle `get()` with non-existent timestamp
- ✅ Store and retrieve prevRandao correctly after wrapping

### Storage Layout Verification
- ✅ Verify storage slots are correctly calculated
- ✅ Verify timestamp, root, and randao are stored in correct slots

## Running the Tests

```bash
cd test/hardhat-testing
npm install
npm test
```

Or directly:
```bash
cd test/hardhat-testing
npx hardhat test hardhat-local-test.js
```

## Advantages

1. **Direct `set()` Testing**: Unlike other testing approaches, this allows direct testing of the `set()` function by impersonating the system address.

2. **Index Wrapping Testing**: Can easily test edge cases around index wrapping by manipulating block timestamps using `evm_setNextBlockTimestamp`.

3. **Fast Execution**: Runs entirely in Hardhat's local network, making it very fast compared to Docker-based testing.

4. **Comprehensive Coverage**: Can test edge cases that are difficult to test in production-like environments.

## Limitations

1. **Modified Bytecode**: The bytecode is modified for testing purposes, so it doesn't exactly match production bytecode (though the modification is minimal and well-understood).

2. **Local Network Only**: Tests run on Hardhat's local network, not on a real blockchain or testnet.

3. **No Real Block Building**: Unlike the reth-based testing approach, this doesn't test the actual block-building process.

## prevRandao in Hardhat Local Environment

**Important Note**: The PREVRANDAO opcode (0x44) works correctly in Hardhat's local test environment. Tests explicitly set the next block's PREVRANDAO via `hardhat_setPrevRandao` to a random 32-byte value and verify that the contract stores and returns the same value. This value:

- Is different for each block (provides randomness)
- Is a valid 32-byte non-zero value
- Is properly stored and retrieved by the contract

**Note**: While `block.prevRandao` property in Hardhat's block object is `null` (a limitation of Hardhat's API), the PREVRANDAO opcode itself works correctly and returns proper values. The contract uses the opcode directly, so it receives the correct prevRandao value for each block, which is why all prevRandao-related tests pass successfully.

## Implementation Details

### Bytecode Modification

The modification happens in the `loadAndModifyBytecode()` function:
1. Reads the hex bytecode from `src/bin/modified-eip4788-contract.bytecode.hex`
2. Searches for the pattern: `push20 (0x73)` followed by `0xff...0xfe` (SYSTEM_ADDRESS)
3. Changes the first byte from `0xff` to `0x00`
4. Returns the modified bytecode

### Timestamp Manipulation

Tests use `evm_setNextBlockTimestamp` to control block timestamps, allowing precise testing of:
- Index wrapping scenarios
- Edge cases with specific timestamps
- Storage slot calculations

### Storage Verification

Tests verify the storage layout by:
1. Calculating expected storage slots based on timestamp
2. Reading storage directly using `getStorage`
3. Verifying timestamp, root, and randao are stored correctly

## Future Enhancements

Potential improvements:
1. Add more edge case tests (e.g., concurrent writes, gas limit tests)
2. Add performance benchmarks
3. Add fuzzing tests
4. Test with different HISTORY_BUFFER_LENGTH values
