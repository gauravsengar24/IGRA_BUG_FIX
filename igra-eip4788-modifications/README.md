# Igra L2: Modified EIP-4788 Beacon Root History Contract

This repository contains the modified EIP-4788 Beacon Root History contract used by Igra L2, plus tests and bytecode analysis.

## Start Here

- **Contract overview, rationale, addresses, and constants**: `docs/README.md`
- **Testing overview and strategy**: `test/README.md`
- **Bytecode and storage details**: `docs/modified-eip4788-contract.md`
- **RANDAO reader contract details**: `docs/randao-reader-contract.md`

## Project Structure

```
igra-eip4788-modifications/
├── README.md                   # This file
├── src/                        # Source bytecode files
│   ├── original-eip4788-contract.bytecode
│   ├── modified-eip4788-contract.bytecode
│   ├── randao-reader-contract.bytecode
│   └── bin/                    # Compiled hex bytecode
├── docs/                       # Contract documentation
│   ├── README.md               # Canonical contract overview
│   ├── original-eip4788-contract.md
│   ├── modified-eip4788-contract.md
│   └── randao-reader-contract.md
├── test/                       # Test directory (see test/README.md)
│   ├── reth-testing/           # Reth-based testing (recommended)
│   ├── hardhat-testing/        # Hardhat local testing
│   └── common/                 # Shared test contracts/artifacts
└── scripts/                    # Utility scripts
```

## Testing (Quick Pointer)

This repo provides two complementary testing approaches (reth-based and hardhat-based). See `test/README.md` for the authoritative comparison and commands.

## License

This project maintains the same license as the original EIP-4788 contract.
