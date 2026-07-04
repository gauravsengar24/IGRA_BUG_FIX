const path = require("path");
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  networks: {
    reth: {
      url: "http://localhost:8545"
    }
  },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },
  paths: {
    // Point root at test/common so contracts/artifacts live together.
    root: path.resolve(__dirname, "..", "common"),
    sources: "contracts",
    tests: path.resolve(__dirname, "test"),
    cache: "cache",
    artifacts: "artifacts",
  },
};
