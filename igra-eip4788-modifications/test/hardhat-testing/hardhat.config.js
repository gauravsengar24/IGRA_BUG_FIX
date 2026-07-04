require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
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
    // Hardhat tests use raw bytecode; point sources to an empty folder to skip compilation.
    sources: "./_no_sources",
    tests: "./",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowBlocksWithSameTimestamp: true,
    },
  },
};
