# Documentation

This directory contains documentation for the modified EIP-4788 Beacon Root History contract used by Igra L2.

## EIP-4788 Summary

The original EIP-4788 contract stores a ring buffer of recent parent beacon block roots and exposes them by timestamp. The contract has a `set()` path called by the system address to write the timestamp/root pair and a `get()` path used by normal callers to validate a timestamp and return the corresponding root.

## Modification Summary

This repository modifies the contract to store additional history alongside the beacon root:
- `prevRandao`
- `blockNumber`

For regular callers, `get()` behaves exactly like the original. For the `RANDAO_READER` caller, `get()` returns `(beaconRoot, prevRandao, blockNumber)` for the supplied timestamp.

## Contract Addresses and Constants

- **Beacon Root History (modified)**: `0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02`
- **RANDAO_READER**: `0xFe38D0727B928E19bE51673Ac0691Ca22C05B1B3`
- **SYSTEM_ADDRESS**: `0xfffffffffffffffffffffffffffffffffffffffe`
- **HISTORY_BUFFER_LENGTH**: `8191` (0x001fff)

## Storage Layout (Ring Buffer)

```
Slots 0-8190:        Timestamps
Slots 8191-16382:    Beacon Roots
Slots 16383-24573:   prevRandao Values
Slots 24574-32764:   Block Numbers
```

## Rationale (Igra/KASPA Context)

- **Cryptographic linking**: Igra L2 uses KASPA DAG as its sequencer; storing `prevRandao` enables cryptographic linking between L2 and L1 blocks.
- **Attestations**: Attestors can anchor L2 state commitments to KASPA L1 by referencing L1 metadata stored in `beaconRoot` and `prevRandao`.
- **Block number linkage**: Storing `blockNumber` enables linking `timestamp -> blockNumber`, which is needed to tie EIP-4788 history to block hash history (e.g., via EIP-2935).

## Detailed Docs

- `original-eip4788-contract.md`: Original contract bytecode analysis
- `modified-eip4788-contract.md`: Modified contract bytecode analysis
- `randao-reader-contract.md`: RANDAO_READER proxy contract analysis

## Testing

See `test/README.md` for the testing strategy and entry points.

## References

- EIP-4788: https://eips.ethereum.org/EIPS/eip-4788
- EIP-2935: https://eips.ethereum.org/EIPS/eip-2935
- Ethereum Merge (prevRandao): https://ethereum.org/en/upgrades/merge/
- PREVRANDAO opcode: https://ethereum.org/en/developers/docs/evm/opcodes/
