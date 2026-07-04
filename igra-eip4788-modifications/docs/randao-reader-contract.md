# RANDAO_READER Contract

## Overview

This contract calls the modified EIP-4788 Beacon Root History contract. Upon the call the modified contract detects the caller as RANDAO_READER and returns the beacon root, the prevRandao and the block number values.

For the Igra/KASPA context, addresses, and shared constants, see `docs/README.md`.

# Pseudocode of the "RANDAO_READER" contract

```
def get_randao():
    # Call the modified EIP-4788 contract
    success, return_data = staticcall(
        gas=evm.gas,
        address=BEACON_ROOT_CONTRACT,
        calldata=evm.calldata  # Forward all calldata as-is
    )

    if not success:
        # Propagate revert data from the called contract
        evm.revert(return_data)  # Revert with the same data as the called contract

    evm.return(return_data)  # Return whatever was received (proxy behavior)
```

**Note:** This contract acts as a proxy and forwards whatever it receives from the STATICCALLed BEACON_ROOT_CONTRACT. It does not perform input validation. If the call reverts, this contract will propagate that revert data. The contract also does not enforce a specific return data size - it returns whatever the called contract returns.

## Bytecode Analysis Table

| Offset | Opcode           | Opcode (Hex) | Stack After                                         | Memory Change                     | Description                                          |
|--------|------------------|--------------|-----------------------------------------------------|-----------------------------------|------------------------------------------------------|
| 0x00   | calldatasize     | 36           | [calldata_size]                                     | -                                 | Push calldata size                                   |
| 0x01   | push0            | 5f           | [calldata_size, 0]                                  | -                                 | Push 0 (dest offset for calldatacopy)                |
| 0x02   | push0            | 5f           | [calldata_size, 0, 0]                               | -                                 | Push 0 (source offset for calldatacopy)              |
| 0x03   | calldatacopy     | 37           | []                                                  | M[0..calldata_size-1] = calldata  | Copy calldata to memory                              |
| 0x04   | push0            | 5f           | [0]                                                 | -                                 | Push 0 (return data size, for STATICCALL)            |
| 0x05   | push0            | 5f           | [0, 0]                                              | -                                 | Push 0 (return data offset, for STATICCALL)          |
| 0x06   | calldatasize     | 36           | [0, 0, calldata_size]                               | -                                 | Push calldata size                                   |
| 0x07   | push0            | 5f           | [0, 0, calldata_size, 0]                            | -                                 | Push 0 (calldata offset)                             |
| 0x08   | push20 0x...ac02 | 73...ac02    | [0, 0, calldata_size, 0, BEACON_ROOT_CONTRACT]      | -                                 | Push BEACON_ROOT_CONTRACT address to stack           |
| 0x1d   | gas              | 5a           | [0, 0, calldata_size, 0, BEACON_ROOT_CONTRACT, gas] | -                                 | Push remaining gas to stack                          |
| 0x1e   | staticcall       | fa           | [success]                                           | -                                 | Call BEACON_ROOT_CONTRACT with calldata (STATICCALL) |
| 0x1f   | returndatasize   | 3d           | [success, return_size]                              | -                                 | Push size of return data                             |
| 0x20   | push0            | 5f           | [success, return_size, 0]                           | -                                 | Push 0 (return data offset)                          |
| 0x21   | push0            | 5f           | [success, return_size, 0, 0]                        | -                                 | Push 0 (memory offset for returndatacopy)            |
| 0x22   | returndatacopy   | 3e           | [success]                                           | M[0..return_size-1] = return_data | Copy return data from call to memory offset 0        |
| 0x23   | iszero           | 15           | [is_failure]                                        | -                                 | Check if call failed (success == 0)                  |
| 0x24   | push1 0x2a       | 602a         | [is_failure, 0x2a]                                  | -                                 | Push jump destination to revert path                 |
| 0x26   | jumpi            | 57           | []                                                  | -                                 | Jump to revert path if is_failure == 1               |
| 0x27   | returndatasize   | 3d           | [return_size]                                       | -                                 | Push size of return data                             |
| 0x28   | push0            | 5f           | [return_size, 0]                                    | -                                 | Push 0 (memory offset for return)                    |
| 0x29   | return           | f3           | []                                                  | -                                 | Return whatever was received                         |
| 0x2a   | jumpdest         | 5b           | []                                                  | -                                 | Jump destination: Revert path (call failed)          |
| 0x2b   | returndatasize   | 3d           | [return_size]                                       | -                                 | Push size of return (revert) data                    |
| 0x2c   | push0            | 5f           | [return_size, 0]                                    | -                                 | Push 0 (memory offset for revert)                    |
| 0x2d   | revert           | fd           | []                                                  | -                                 | Revert execution with propagated revert data         |

## Execution Flow Summary

### Entry Point (0x00)
1. **Call Preparation (0x00-0x1e)**
   - Copy calldata into memory (0x00-0x03)
   - Prepare call parameters on stack:
     - return data size: 0 (0x04)
     - return data offset: 0 (0x05)
     - calldata size: forward all calldata as-is (0x06)
     - calldata offset: 0 (0x07)
     - BEACON_ROOT_CONTRACT address (0x08-0x1c)
     - gas: remaining gas (0x1d)
   - Execute staticcall (0x1e)

2. **Call Validation (0x1f-0x26)**
   - Copy return data into memory starting at offset 0 (0x1f-0x22)
   - Check if call succeeded (0x23-0x26)
     - If failed: Revert with propagated revert data (0x2a-0x2d)
     - Note: This includes validation failures from the called contract (calldata size != 32, timestamp == 0, timestamp mismatch)
     - The revert data from the called contract is propagated to the caller

3. **Return Phase (0x27-0x29)**
   - Return using actual returndatasize from memory offset 0
   - Note: This contract acts as a proxy and forwards whatever it receives, without enforcing a specific size

## Key Constants

- **BEACON_ROOT_CONTRACT**: `0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02` (modified EIP-4788 contract)
- **RANDAO_READER**: `0xFe38D0727B928E19bE51673Ac0691Ca22C05B1B3` (this contract's address, low 20 bytes of `bytes32(uint256(keccak256('eip4788.modified.reader')) - 1)`)

## Security Considerations

1. **No Input Validation**: This contract does not validate input as the called contract is assumed to perform these validations.

2. **Call Validation**: Verifies the call succeeded. Does not enforce a specific return data size - acts as a proxy and forwards whatever is received.

3. **Revert Behavior**: Reverts in the following conditions:
   - Call to BEACON_ROOT_CONTRACT failed (includes validation failures from called contract)
   - When reverting, propagates the revert data from the called contract (not empty revert)

4. **Call**: Uses STATICCALL to invoke the Beacon Root contract.

5. **Gas Forwarding**: Forwards remaining gas to the called contract.

6. **Proxy Behavior**: Returns whatever data the called contract returns, without size restrictions. This allows the contract to adapt if the called contract's return format changes.

## Interaction with Modified EIP-4788 Contract

The modified EIP-4788 contract detects the call from RANDAO_READER address and returns data which is different (extended) than data returned by any other address.  
Refer to [./modified-eip4788-contract.md](./modified-eip4788-contract.md) for details.
