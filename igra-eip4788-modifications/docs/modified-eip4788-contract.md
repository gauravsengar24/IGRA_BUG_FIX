# Modified EIP-4788 Beacon Root History Smart Contract

## Overview

This contract implements a modified version of the Beacon Root History storage for EIP-4788. The modifications extend the original contract to also store `prevRandao` and `blockNumber` for recent blocks. For regular callers, `get()` returns only the `beaconRoot`; for the caller at the RANDAO_READER address, `get()` returns `(beaconRoot, prevRandao, blockNumber)`.

Addresses and shared constants are documented in `docs/README.md`.

The contract has two main functions:
- **get()**: Retrieves the beaconRoot (called by regular users), or retrieves the beaconRoot, the prevRandao and the blockNumber if called by RANDAO_READER.
- **set()**: Stores the beaconRoot, prevRandao, and the blockNumber in a ring buffer (called only by SYSTEM_ADDRESS)

## Key Modifications

1. **Extended Storage Layout**: The contract now stores prevRandao values and block numbers in addition to timestamps and beaconRoots
2. **RANDAO_READER Support**: If `get()` is called by RANDAO_READER address, it returns the prevRandao value instead of the beaconRoot
3. **Conditional get() Return**: `get()` returns a single 32-byte word for regular callers (beaconRoot) and two extra words for RANDAO_READER (prevRandao, stored block number)
4. **Extended set() Function**: The `set()` function now also stores the block's prevRandao value and the block number

For the purpose of these modifications and the Igra/KASPA context, see [docs/README.md](./README.md).

## Pseudocode of the MODIFIED EIP-4788 Beacon Root History smart contract

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

    // Modification: Respond differently to RANDAO_READER
    if evm.caller == RANDAO_READER:
        randao_idx = root_idx + HISTORY_BUFFER_LENGTH
        randao = storage.get(randao_idx)
        blocknum_idx = randao_idx + HISTORY_BUFFER_LENGTH
        blocknum = storage.get(blocknum_idx)
        evm.return(root, randao, blocknum)
   // End of modified code fragment

    evm.return(root)

def set():
    timestamp_idx = to_uint256_be(evm.timestamp) % HISTORY_BUFFER_LENGTH
    root_idx = timestamp_idx + HISTORY_BUFFER_LENGTH

    storage.set(timestamp_idx, evm.timestamp)
    storage.set(root_idx, evm.calldata)

    // Modification: Also store randao and blocknum
    randao_idx = root_idx + HISTORY_BUFFER_LENGTH
    storage.set(randao_idx, evm.randao)
    blocknum_idx = randao_idx + HISTORY_BUFFER_LENGTH
    storage.set(blocknum_idx, evm.blocknum)
   // End of modified code fragment
```

## Bytecode Analysis Table

| Offset    | Opcode          | Opcode (Hex) | Stack (after execution)                     | Memory Change        | Storage Change               | Description                                           |
|-----------|-----------------|--------------|---------------------------------------------|----------------------|------------------------------|-------------------------------------------------------|
| 0x00      | caller          | 33           | [caller]                                    | -                    | -                            | Push caller (caller) to stack                         |
| 0x01      | push20 0xff..fe | 73ff..fe     | [caller, SYSTEM_ADDRESS]                    | -                    | -                            | Push SYSTEM_ADDRESS to stack                          |
| 0x16      | eq              | 14           | [is_caller_system_addr]                     | -                    | -                            | is_caller_system_addr = caller == SYSTEM_ADDRESS      |
| 0x17      | push1 0x7d      | 607d         | [is_caller_system_addr, (:5)]               | -                    | -                            | Push jump destination (:5) to stack                   |
| 0x19      | jumpi           | 57           | []                                          | -                    | -                            | Jump to (:5) if is_caller_system_addr                 |
| 0x1a      | push1 0x20      | 6020         | [0x20]                                      | -                    | -                            | Push 0x20 to stack                                    |
| 0x1c      | calldatasize    | 36           | [0x20, calldata_size]                       | -                    | -                            | Push calldata size (bytes)                            |
| 0x1d      | eq              | 14           | [is_calldata_size_match]                    | -                    | -                            | is_calldata_size_match = calldata_size == 32 bytes    |
| 0x1e      | push1 0x24      | 6024         | [is_calldata_size_match, (:1)]              | -                    | -                            | Push jump destination (:1) to stack                   |
| 0x20      | jumpi           | 57           | []                                          | -                    | -                            | Jump to (:1) if is_calldata_size_match                |
| 0x21      | push0           | 5f           | [0]                                         | -                    | -                            | Push 0 (byte size of return data) to stack            |
| 0x22      | push0           | 5f           | [0, 0]                                      | -                    | -                            | Push 0 (memory offset of return data) to stack        |
| 0x23      | revert          | fd           | []                                          | -                    | -                            | Revert with 0 bytes from (empty) memory at offset 0   |
| 0x24 (:1) | jumpdest        | 5b           | []                                          | -                    | -                            | Jump destination (:1)                                 |
| 0x25      | push0           | 5f           | [0]                                         | -                    | -                            | Push 0 (offset in calldata) to stack                  |
| 0x26      | calldataload    | 35           | [calldata]                                  | -                    | -                            | Load timestamp (32 bytes) from calldata at offset 0   |
| 0x27      | dup1            | 80           | [calldata, calldata]                        | -                    | -                            | Duplicate top stack item                              |
| 0x28      | iszero          | 15           | [calldata, is_zero_calldata]                | -                    | -                            | is_zero_calldata = calldata == 0                      |
| 0x29      | push1 0x79      | 6079         | [calldata, is_zero_calldata, (:4)]          | -                    | -                            | Push jump destination (:4) to stack                   |
| 0x2b      | jumpi           | 57           | [calldata]                                  | -                    | -                            | Jump to (:4) if is_zero_calldata                      |
| 0x2c      | push2 0x1fff    | 611fff       | [calldata, HISTORY_BUFFER_LENGTH]           | -                    | -                            | Push HISTORY_BUFFER_LENGTH to stack                   |
| 0x2f      | dup2            | 81           | [calldata, HISTORY_BUFFER_LENGTH, calldata] | -                    | -                            | Duplicate second stack item                           |
| 0x30      | mod             | 06           | [calldata, timestamp_idx]                   | -                    | -                            | timestamp_idx = calldata % HISTORY_BUFFER_LENGTH      |
| 0x31      | swap1           | 90           | [timestamp_idx, calldata]                   | -                    | -                            | Swap top two stack items                              |
| 0x32      | dup2            | 81           | [timestamp_idx, calldata, timestamp_idx]    | -                    | -                            | Duplicate second stack item (timestamp_idx)           |
| 0x33      | sload           | 54           | [timestamp_idx, calldata, timestamp]        | -                    | -                            | Load timestamp from storage slot at timestamp_idx     |
| 0x34      | eq              | 14           | [timestamp_idx, is_timestamp_match]         | -                    | -                            | is_timestamp_match = timestamp == calldata            |
| 0x35      | push1 0x3b      | 603b         | [timestamp_idx, is_timestamp_match, (:2)]   | -                    | -                            | Push jump destination (:2) to stack                   |
| 0x37      | jumpi           | 57           | [timestamp_idx]                             | -                    | -                            | Jump to (:2) if is_timestamp_match                    |
| 0x38      | push0           | 5f           | [timestamp_idx,0]                           | -                    | -                            | Push 0 (byte size of return data) to stack            |
| 0x39      | push0           | 5f           | [timestamp_idx,0, 0]                        | -                    | -                            | Push 0 (memory offset of return data) to stack        |
| 0x3a      | revert          | fd           | [timestamp_idx]                             | -                    | -                            | Revert with 0 bytes from (empty) memory at offset 0   |
| 0x3b (:2) | jumpdest        | 5b           | [timestamp_idx]                             | -                    | -                            | Jump destination (:2)                                 |
| 0x3c      | push2 0x1fff    | 611fff       | [timestamp_idx, HISTORY_BUFFER_LENGTH]      | -                    | -                            | Push HISTORY_BUFFER_LENGTH to stack                   |
| 0x3f      | add             | 01           | [root_idx]                                  | -                    | -                            | root_idx = timestamp_idx + HISTORY_BUFFER_LENGTH      |
| 0x40      | dup1            | 80           | [root_idx, root_idx]                        | -                    | -                            | Duplicate stack top item                              |
| 0x41      | sload           | 54           | [root_idx, root]                            | -                    | -                            | Load beacon root from storage slot at root_idx        |
| 0x42      | push0           | 5f           | [root_idx, root, 0]                         | -                    | -                            | Push 0 (memory offset for mstore) to stack            |
| 0x43      | mstore          | 52           | [root_idx]                                  | M[0..31] = root      | -                            | Store beacon root (32 bytes) in memory at offset 0    |
| 0x44      | caller          | 33           | [root_idx, caller]                          | -                    | -                            | Push caller (msg.sender) to stack                     |
| 0x45      | push20 0xfe..b3 | 73fe..b3     | [root_idx, caller, RANDAO_READER]           | -                    | -                            | Push RANDAO_READER to stack                           |
| 0x5a      | eq              | 14           | [root_idx, is_caller_reader_addr]           | -                    | -                            | is_caller_reader_addr = caller == RANDAO_READER       |
| 0x5b      | push1 0x63      | 6063         | [root_idx, is_caller_reader_addr, (:3)]     | -                    | -                            | Push jump destination (:3) to stack                   |
| 0x5d      | jumpi           | 57           | [root_idx]                                  | -                    | -                            | Jump to (:3) if is_caller_reader_addr                 |
| 0x5e      | pop             | 50           | []                                          | -                    | -                            | Remove stack top item from the stack to clean it      |
| 0x5f      | push1 0x20      | 6020         | [0x20]                                      | -                    | -                            | Push 0x20 (byte size of return data)                  |
| 0x61      | push0           | 5f           | [0x20, 0]                                   | -                    | -                            | Push 0 (memory offset of return data) to stack        |
| 0x62      | return          | f3           | []                                          | -                    | -                            | Return beacon root (32 bytes from memory offset 0)    |
| 0x63 (:3) | jumpdest        | 5b           | [root_idx]                                  | -                    | -                            | Jump destination (:3)                                 |
| 0x64      | push2 0x1fff    | 611fff       | [root_idx, HISTORY_BUFFER_LENGTH]           | -                    | -                            | Push HISTORY_BUFFER_LENGTH to stack                   |
| 0x67      | add             | 01           | [randao_idx]                                | -                    | -                            | randao_idx = root_idx % HISTORY_BUFFER_LENGTH         |
| 0x68      | dup1            | 80           | [randao_idx, randao_idx]                    | -                    | -                            | Duplicate stack top item                              |
| 0x69      | sload           | 54           | [randao_idx, randao]                        | -                    | -                            | Load randao from storage slot at randao_idx           |
| 0x6a      | push1 0x20      | 6020         | [randao_idx, randao, 0x20]                  | -                    | -                            | Push 0x20 (memory offset for mstore) to stack         |
| 0x6c      | mstore          | 52           | [randao_idx]                                | M[32..63] = randao   | -                            | Store randao (32 bytes) in memory at offset 0 x20     |
| 0x6d      | push2 0x1fff    | 611fff       | [randao_idx, HISTORY_BUFFER_LENGTH]         | -                    | -                            | Push HISTORY_BUFFER_LENGTH to stack                   |
| 0x70      | add             | 01           | [blocknum_idx]                              | -                    | -                            | blocknum_idx = randao_idx + HISTORY_BUFFER_LENGTH     |
| 0x71      | sload           | 54           | [blocknum]                                  | -                    | -                            | Load blocknum from storage slot at blocknum_idx       |
| 0x72      | push1 0x40      | 6040         | [randao, 0x40]                              | -                    | -                            | Push 0x40 (memory offset for mstore) to stack         |
| 0x74      | mstore          | 52           | []                                          | M[64..95] = blocknum | -                            | Store randao (32 bytes) in memory at offset 0x40      |
| 0x75      | push1 0x60      | 6060         | [0x60]                                      |                      | -                            | Push 0x60 (byte size of return data) to stack         |
| 0x77      | push0           | 5f           | [0x60, 0]                                   | -                    | -                            | Push 0 (memory offset of return data) to stack        |
| 0x78      | return          | f3           | []                                          | -                    | -                            | Return 3 values (0x60 bytes from memory at offset 0)  |
| 0x79 (:4) | jumpdest        | 5b           | [calldata]                                  | -                    | -                            | Jump destination (:4)                                 |
| 0x7a      | push0           | 5f           | [calldata,0]                                | -                    | -                            | Push 0 (byte size of return data) to stack            |
| 0x7b      | push0           | 5f           | [calldata,0, 0]                             | -                    | -                            | Push 0 (memory offset of return data) to stack        |
| 0x7c      | revert          | fd           | [calldata]                                  | -                    | -                            | Revert with 0 bytes from (empty) memory at offset 0   |
| 0x7d (:5) | jumpdest        | 5b           | []                                          | -                    | -                            | Jump destination (:5)                                 |
| 0x7e      | push2 0x1fff    | 611fff       | [HISTORY_BUFFER_LENGTH]                     | -                    | -                            | Push HISTORY_BUFFER_LENGTH to stack                   |
| 0x81      | timestamp       | 42           | [HISTORY_BUFFER_LENGTH, timestamp]          | -                    | -                            | Push timestamp                                        |
| 0x82      | mod             | 06           | [timestamp_idx]                             | -                    | -                            | timestamp_idx = timestamp % HISTORY_BUFFER_LENGTH     |
| 0x83      | timestamp       | 42           | [timestamp_idx, timestamp]                  | -                    | -                            | Push timestamp to stack                               |
| 0x84      | dup2            | 81           | [timestamp_idx, timestamp, timestamp_idx]   | -                    | -                            | Duplicate second stack item                           |
| 0x85      | sstore          | 55           | [timestamp_idx]                             | -                    | S[timestamp_idx] = timestamp | Store timestamp in storage slot at timestamp_idx      |
| 0x86      | push2 0x1fff    | 611fff       | [timestamp_idx, HISTORY_BUFFER_LENGTH]      | -                    | -                            | Push HISTORY_BUFFER_LENGTH to stack                   |
| 0x89      | add             | 01           | [root_idx]                                  | -                    | -                            | root_idx = timestamp_idx + HISTORY_BUFFER_LENGTH      |
| 0x8a      | push0           | 5f           | [root_idx, 0]                               | -                    | -                            | Push 0 (offset in calldata) to stack                  |
| 0x8b      | calldataload    | 35           | [root_idx, calldata]                        | -                    | -                            | Load beacon root (32 bytes) from calldata at offset 0 |
| 0x8c      | dup2            | 81           | [root_idx, calldata, root_idx]              | -                    | -                            | Duplicate second stack item                           |
| 0x8d      | sstore          | 55           | [root_idx]                                  | -                    | S[root_idx] = calldata       | Store beacon root in storage slot at root_idx         |
| 0x8e      | push2 0x1fff    | 611fff       | [root_idx, HISTORY_BUFFER_LENGTH]           | -                    | -                            | Push HISTORY_BUFFER_LENGTH to stack                   |
| 0x91      | add             | 01           | [randao_idx]                                | -                    | -                            | randao_idx = root_idx + HISTORY_BUFFER_LENGTH         |
| 0x92      | randao          | 44           | [randao_idx, randao]                        | -                    | -                            | Push randao                                           |
| 0x93      | dup2            | 81           | [randao_idx, randao, randao_idx]            | -                    | -                            | Duplicate second stack item                           |
| 0x94      | sstore          | 55           | [randao_idx]                                | -                    | S[randao_idx] = randao       | Store randao in storage slot at randao_idx            |
| 0x95      | push2 0x1fff    | 611fff       | [randao_idx, HISTORY_BUFFER_LENGTH]         | -                    | -                            | Push HISTORY_BUFFER_LENGTH to stack                   |
| 0x98      | add             | 01           | [blocknum_idx]                              | -                    | -                            | blocknum_idx = randao_idx + HISTORY_BUFFER_LENGTH     |
| 0x99      | number          | 43           | [blocknum_idx, blocknum]                    | -                    | -                            | Push blocknum (block.number) to stack                 |
| 0x9a      | swap1           | 90           | [blocknum, blocknum_idx]                    | -                    | -                            | Swap top two stack items                              |
| 0x9b      | sstore          | 55           | []                                          | -                    | S[blocknum_idx] = blocknum   | Store blocknum in storage slot at blocknum_idx        |
| 0x9c      | stop            | 00           | []                                          | -                    | -                            | Stop execution                                        |
      
## Execution Flow Summary

### Entry Point (0x00)
1. Check if caller is SYSTEM_ADDRESS (0x...fe)
   - If yes: Jump to set() at `0x7d` (label `(:5)`)
   - If no: Continue to get() validation

### get() Function Path
1. **Validation Phase (0x1a-0x2b)**
   - Validate calldata size == 32 bytes (0x1a-0x20)
     - If not: Revert (0x21-0x23)
   - Load `calldata` and check != 0 (0x24-0x2b)
     - If zero: Revert (0x7a-0x7c)

2. **Lookup Phase (0x2c-0x3a)**
   - Calculate `timestamp_idx = calldata % HISTORY_BUFFER_LENGTH` (0x2c-0x31)
   - Load stored timestamp and compare with `calldata` (0x32-0x37)
     - If mismatch: Revert (0x38-0x3a)

3. **Return Phase**
   - Calculate `root_idx = timestamp_idx + HISTORY_BUFFER_LENGTH` and load root (0x3c-0x43)
   - Check if caller is RANDAO_READER (0x44-0x5d)
     - If no: Return 32 bytes `root` (0x5e-0x62)
     - If yes: Jump to randao/number return path at `0x63` (label `(:3)`)

4. **RANDAO_READER Return Path (0x63-0x78)**
   - Load `randao` from `randao_idx = root_idx + HISTORY_BUFFER_LENGTH`
   - Load `blocknum` from `blocknum_idx = randao_idx + HISTORY_BUFFER_LENGTH`
   - Return 96 bytes `(root, randao, blocknum)`

### set() Function Path (label `(:5)` at 0x7d)
1. **Calculate Index (0x7e-0x82)**
   - Calculate `timestamp_idx = timestamp % HISTORY_BUFFER_LENGTH`

2. **Store Timestamp (0x83-0x85)**
   - Store `timestamp` at `storage[timestamp_idx]`

3. **Store Root (0x86-0x8d)**
   - Load beacon root from calldata
   - Calculate `root_idx = timestamp_idx + HISTORY_BUFFER_LENGTH`
   - Store beacon root at `storage[root_idx]`

4. **Store Randao (0x8e-0x94)**
   - Calculate `randao_idx = root_idx + HISTORY_BUFFER_LENGTH`
   - Store randao at `storage[randao_idx]`

5. **Store Block Number (0x95-0x9b)**
   - Calculate `blocknum_idx = randao_idx + HISTORY_BUFFER_LENGTH`
   - Store `blocknum` at `storage[blocknum_idx]`

6. **Complete (0x9c)**
   - Stop execution

## Storage Layout

The contract uses a circular buffer pattern with `HISTORY_BUFFER_LENGTH = 8191 (0x1fff)`:

- **Slots 0-8190**: Store timestamps (validation ring buffer)
- **Slots 8191-16381**: Store corresponding beacon roots
- **Slots 16382-24572**: Store corresponding prevRandao values
- **Slots 24573-32763**: Store corresponding block numbers (return ring buffer)

The mappings are:
- `root_idx = timestamp_idx + 8191`
- `randao_idx = root_idx + 8191 = timestamp_idx + 16382`
- `block_number_idx = timestamp_idx + 8191 * 3 = timestamp_idx + 24573`

## Key Constants

- **SYSTEM_ADDRESS**: `0xfffffffffffffffffffffffffffffffffffffffe`
- **RANDAO_READER**: `0xFe38D0727B928E19bE51673Ac0691Ca22C05B1B3` (low 20 bytes of `bytes32(uint256(keccak256('eip4788.modified.reader')) - 1)`)
- **HISTORY_BUFFER_LENGTH**: `8191` (0x1fff)
- **Expected calldata size for get()**: `32 bytes` (0x20)
- **Expected return size for get()**: `32 bytes` (regular callers), `96 bytes` (if called by RANDAO_READER)

## Security Considerations

1. **Access Control**: Only SYSTEM_ADDRESS can call set()
2. **Input Validation**: get() validates calldata size and non-zero value
3. **Timestamp Verification**: get() verifies the stored timestamp matches the input before returning root or randao
4. **Circular Buffer**: Uses modulo operation to prevent storage overflow
