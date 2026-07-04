# Source Code

This directory contains the bytecode source files for all contracts.

## Files

- **`original-eip4788-contract.bytecode`**: Original EIP-4788 Beacon Root History contract (mnemonic format)
- **`modified-eip4788-contract.bytecode`**: Modified EIP-4788 contract with prevRandao support (mnemonic format)
- **`randao-reader-contract.bytecode`**: RANDAO_READER wrapper contract (mnemonic format)

## Bytecode Format

All `.bytecode` files use EVM mnemonic opcode format with:
- Opcode names (e.g., `caller`, `push1`, `sstore`)
- Push opcodes with their arguments (e.g., `push20 0x...`)
- Comments and analysis tables embedded in the files

## Compiled Bytecode

The compiled hexadecimal bytecode files are located in the `bin/` subdirectory:
- `bin/original-eip4788-contract.bytecode.hex`
- `bin/modified-eip4788-contract.bytecode.hex`
- `bin/randao-reader-contract.bytecode.hex`

These hex files contain the raw bytecode ready for deployment.

## Converting Bytecode to Hex

You can use the utility script `../scripts/bytecode-to-hex.py` to convert mnemonic bytecode to hexadecimal format:

```bash
python3 ../scripts/bytecode-to-hex.py original-eip4788-contract.bytecode > bin/original-eip4788-contract.bytecode.hex
```
