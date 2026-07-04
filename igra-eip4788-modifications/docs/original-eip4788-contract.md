
# (Original) EIP-4788 Beacon Root History Smart Contract

## Overview

The EIP-4788 Beacon Root History smart contract exposes the short history of parent beacon block roots (up to 8191 blocks), allowing other contracts to query the parent beacon root for a block by its timestamp.

Addresses and shared constants are documented in `docs/README.md`.

This contract implements the Beacon Root History storage for EIP-4788. It has two main functions:
- **get()**: Retrieves a beacon root for a given timestamp (called by regular users)
- **set()**: Stores a new beacon root (called only by SYSTEM_ADDRESS)

## Pseudocode of the (original) EIP-4788 Beacon Root History smart contract

```text
if evm.caller == SYSTEM_ADDRESS:
   set()
else:
   get()

def get():
    if len(evm.calldata) != 32:
        evm.revert()

    if to_uint256_be(evm.calldata) == 0:
        evm.revert()

    timestamp_idx = to_uint256_be(evm.calldata) % HISTORY_BUFFER_LENGTH
    timestamp = storage.get(timestamp_idx)

    if timestamp != evm.calldata:
        evm.revert()

    root_idx = timestamp_idx + HISTORY_BUFFER_LENGTH
    root = storage.get(root_idx)

    evm.return(root)

def set():
    timestamp_idx = to_uint256_be(evm.timestamp) % HISTORY_BUFFER_LENGTH
    root_idx = timestamp_idx + HISTORY_BUFFER_LENGTH

    storage.set(timestamp_idx, evm.timestamp)
    storage.set(root_idx, evm.calldata)
```

## Bytecode Analysis Table

| Offset | Opcode         | Opcode (Hex) | Stack (after execution)                          | Memory Change   | Storage Change                     | Description                                                                     |
|--------|----------------|--------------|--------------------------------------------------|-----------------|------------------------------------|---------------------------------------------------------------------------------|
| 0x00   | caller         | 33           | [msg.sender]                                     | -               | -                                  | Push msg.sender (20 bytes) to stack                                             |
| 0x01   | push20 0x...fe | 73...fe      | [msg.sender, 0x...fe]                            | -               | -                                  | Push SYSTEM_ADDRESS (0xfffffffffffffffffffffffffffffffffffffffe) to stack       |
| 0x16   | eq             | 14           | [is_system]                                      | -               | -                                  | Compare: is_system = (msg.sender == SYSTEM_ADDRESS)? 1 : 0                      |
| 0x17   | push1 0x4d     | 604d         | [is_system, 0x4d]                                | -               | -                                  | Push jump destination (0x4d = 77 decimal) for set() function                    |
| 0x19   | jumpi          | 57           | []                                               | -               | -                                  | Conditional jump: if is_system == 1, jump to 0x4d (set function), else continue |
| 0x1a   | push1 0x20     | 6020         | [0x20]                                           | -               | -                                  | Push 32 (0x20) to stack (expected calldata size for get())                      |
| 0x1c   | calldatasize   | 36           | [0x20, calldata_size]                            | -               | -                                  | Push size of calldata in bytes                                                  |
| 0x1d   | eq             | 14           | [size_match]                                     | -               | -                                  | Compare: size_match = (calldata_size == 32)? 1 : 0                              |
| 0x1e   | push1 0x24     | 6024         | [size_match, 0x24]                               | -               | -                                  | Push jump destination (0x24 = 36 decimal) to get() validation                   |
| 0x20   | jumpi          | 57           | []                                               | -               | -                                  | Conditional jump: if size_match == 1, jump to 0x24, else continue to revert     |
| 0x21   | push0          | 5f           | [0]                                              | -               | -                                  | Push 0 (offset for revert)                                                      |
| 0x22   | push0          | 5f           | [0, 0]                                           | -               | -                                  | Push 0 (size for revert - empty revert)                                         |
| 0x23   | revert         | fd           | []                                               | -               | -                                  | Revert execution (calldata size != 32)                                          |
| 0x24   | jumpdest       | 5b           | []                                               | -               | -                                  | Jump destination: Start of get() function validation                            |
| 0x25   | push0          | 5f           | [0]                                              | -               | -                                  | Push 0 (offset for calldataload)                                                |
| 0x26   | calldataload   | 35           | [calldata_word]                                  | -               | -                                  | Load 32 bytes from calldata offset 0 (the timestamp parameter)                  |
| 0x27   | dup1           | 80           | [calldata_word, calldata_word]                   | -               | -                                  | Duplicate top stack item                                                        |
| 0x28   | iszero         | 15           | [calldata_word, is_zero]                         | -               | -                                  | Check if calldata_word == 0, push 1 if true, 0 if false                         |
| 0x29   | push1 0x49     | 6049         | [calldata_word, is_zero, 0x49]                   | -               | -                                  | Push jump destination (0x49 = 73 decimal) to revert path                        |
| 0x2b   | jumpi          | 57           | [calldata_word]                                  | -               | -                                  | Conditional jump: if is_zero == 1, jump to 0x49 (revert), else continue         |
| 0x2c   | push3 0x001fff | 62001fff     | [calldata_word, 0x001fff]                        | -               | -                                  | Push HISTORY_BUFFER_LENGTH (8191 = 0x001fff) to stack                           |
| 0x30   | dup2           | 81           | [calldata_word, 0x001fff, calldata_word]         | -               | -                                  | Duplicate second stack item (calldata_word)                                     |
| 0x31   | mod            | 06           | [calldata_word, timestamp_idx]                   | -               | -                                  | Calculate: timestamp_idx = calldata_word % 0x001fff                             |
| 0x32   | swap1          | 90           | [timestamp_idx, calldata_word]                   | -               | -                                  | Swap top two stack items                                                        |
| 0x33   | dup2           | 81           | [timestamp_idx, calldata_word, timestamp_idx]    | -               | -                                  | Duplicate second stack item (timestamp_idx)                                     |
| 0x34   | sload          | 54           | [timestamp_idx, calldata_word, stored_timestamp] | -               | -                                  | Load storage value at timestamp_idx                                             |
| 0x35   | eq             | 14           | [timestamp_idx, match]                           | -               | -                                  | Compare: match = (calldata_word == stored_timestamp)? 1 : 0                     |
| 0x36   | push1 0x3c     | 603c         | [timestamp_idx, match, 0x3c]                     | -               | -                                  | Push jump destination (0x3c = 60 decimal) to success path                       |
| 0x38   | jumpi          | 57           | [timestamp_idx]                                  | -               | -                                  | Conditional jump: if match == 1, jump to 0x3c, else continue to revert          |
| 0x39   | push0          | 5f           | [timestamp_idx, 0]                               | -               | -                                  | Push 0 (offset for revert)                                                      |
| 0x3a   | push0          | 5f           | [timestamp_idx, 0, 0]                            | -               | -                                  | Push 0 (size for revert)                                                        |
| 0x3b   | revert         | fd           | []                                               | -               | -                                  | Revert execution (timestamp mismatch)                                           |
| 0x3c   | jumpdest       | 5b           | [timestamp_idx]                                  | -               | -                                  | Jump destination: Success path - continue to return root                        |
| 0x3d   | push3 0x001fff | 62001fff     | [timestamp_idx, 0x001fff]                        | -               | -                                  | Push HISTORY_BUFFER_LENGTH (8191) to stack                                      |
| 0x41   | add            | 01           | [root_idx]                                       | -               | -                                  | Calculate: root_idx = timestamp_idx + 0x001fff                                  |
| 0x42   | sload          | 54           | [root]                                           | -               | -                                  | Load storage value at root_idx (the beacon root)                                |
| 0x43   | push0          | 5f           | [root, 0]                                        | -               | -                                  | Push 0 (memory offset for mstore)                                               |
| 0x44   | mstore         | 52           | []                                               | M[0..31] = root | -                                  | Store root (32 bytes) in memory starting at offset 0                            |
| 0x45   | push1 0x20     | 6020         | [0x20]                                           | -               | -                                  | Push 32 (0x20) - size of return data                                            |
| 0x47   | push0          | 5f           | [0x20, 0]                                        | -               | -                                  | Push 0 (memory offset for return)                                               |
| 0x48   | return         | f3           | []                                               | -               | -                                  | Return 32 bytes from memory offset 0 (the beacon root)                          |
| 0x49   | jumpdest       | 5b           | []                                               | -               | -                                  | Jump destination: Revert path (calldata == 0)                                   |
| 0x4a   | push0          | 5f           | [0]                                              | -               | -                                  | Push 0 (offset for revert)                                                      |
| 0x4b   | push0          | 5f           | [0, 0]                                           | -               | -                                  | Push 0 (size for revert)                                                        |
| 0x4c   | revert         | fd           | []                                               | -               | -                                  | Revert execution (calldata == 0)                                                |
| 0x4d   | jumpdest       | 5b           | []                                               | -               | -                                  | Jump destination: Start of set() function (called by system)                    |
| 0x4e   | push3 0x001fff | 62001fff     | [0x001fff]                                       | -               | -                                  | Push HISTORY_BUFFER_LENGTH (8191) to stack                                      |
| 0x52   | timestamp      | 42           | [0x001fff, block.timestamp]                      | -               | -                                  | Push current block timestamp to stack                                           |
| 0x53   | mod            | 06           | [timestamp_idx]                                  | -               | -                                  | Calculate: timestamp_idx = block.timestamp % 0x001fff                           |
| 0x54   | timestamp      | 42           | [timestamp_idx, block.timestamp]                 | -               | -                                  | Push current block timestamp again                                              |
| 0x55   | dup2           | 81           | [timestamp_idx, block.timestamp, timestamp_idx]  | -               | -                                  | Duplicate timestamp_idx                                                         |
| 0x56   | sstore         | 55           | [timestamp_idx]                                  | -               | S[timestamp_idx] = block.timestamp | Store block.timestamp at storage slot timestamp_idx                             |
| 0x57   | push0          | 5f           | [timestamp_idx, 0]                               | -               | -                                  | Push 0 (offset for calldataload)                                                |
| 0x58   | calldataload   | 35           | [timestamp_idx, calldata_word]                   | -               | -                                  | Load 32 bytes from calldata offset 0 (the beacon root)                          |
| 0x59   | swap1          | 90           | [calldata_word, timestamp_idx]                   | -               | -                                  | Swap top two stack items                                                        |
| 0x5a   | push3 0x001fff | 62001fff     | [calldata_word, timestamp_idx, 0x001fff]         | -               | -                                  | Push HISTORY_BUFFER_LENGTH (8191) to stack                                      |
| 0x5e   | add            | 01           | [calldata_word, root_idx]                        | -               | -                                  | Calculate: root_idx = timestamp_idx + 0x001fff                                  |
| 0x5f   | sstore         | 55           | []                                               | -               | S[root_idx] = calldata_word        | Store beacon root (calldata_word) at storage slot root_idx                      |
| 0x60   | stop           | 00           | []                                               | -               | -                                  | Stop execution (successful completion)                                          |

## Execution Flow Summary

### Entry Point (0x00)
1. Check if caller is SYSTEM_ADDRESS (0x...fe)
   - If yes: Jump to set() at 0x4d
   - If no: Continue to get() validation

### get() Function Path (0x1a-0x48)
1. **Validation Phase (0x1a-0x2b)**
   - Validate calldata size == 32 bytes (0x1a-0x20)
     - If not: Revert (0x21-0x23)
   - Load calldata and check != 0 (0x24-0x2b)
     - If zero: Revert (0x49-0x4c)

2. **Lookup Phase (0x2c-0x3b)**
   - Calculate `timestamp_idx = calldata % 0x001fff` (0x2c-0x31)
   - Load stored timestamp and compare with calldata (0x32-0x38)
     - If mismatch: Revert (0x39-0x3b)

3. **Return Phase (0x3c-0x48)**
   - Calculate `root_idx = timestamp_idx + 0x001fff` (0x3c-0x41)
   - Load root from storage (0x42)
   - Store root in memory (0x43-0x44)
   - Return 32 bytes from memory (0x45-0x48)

### set() Function Path (0x4d-0x60)
1. **Calculate Index (0x4d-0x53)**
   - Calculate `timestamp_idx = block.timestamp % 0x001fff`

2. **Store Timestamp (0x54-0x56)**
   - Store `block.timestamp` at `storage[timestamp_idx]`

3. **Store Root (0x57-0x5f)**
   - Load beacon root from calldata (0x57-0x58)
   - Calculate `root_idx = timestamp_idx + 0x001fff` (0x59-0x5e)
   - Store beacon root at `storage[root_idx]` (0x5f)

4. **Complete (0x60)**
   - Stop execution

## Storage Layout

The contract uses a circular buffer pattern with `HISTORY_BUFFER_LENGTH = 8191 (0x001fff)`:

- **Slots 0-8190**: Store timestamps
- **Slots 8191-16382**: Store corresponding beacon roots

The mapping is: `root_idx = timestamp_idx + 8191`

## Key Constants

- **SYSTEM_ADDRESS**: `0xfffffffffffffffffffffffffffffffffffffffe`
- **HISTORY_BUFFER_LENGTH**: `8191` (0x001fff)
- **Expected calldata size for get()**: `32 bytes` (0x20)

## Security Considerations

1. **Access Control**: Only SYSTEM_ADDRESS can call set()
2. **Input Validation**: get() validates calldata size and non-zero value
3. **Timestamp Verification**: get() verifies the stored timestamp matches the input before returning root
4. **Circular Buffer**: Uses modulo operation to prevent storage overflow
