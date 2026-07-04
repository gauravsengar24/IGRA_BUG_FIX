const { expect } = require("chai");
const { ethers } = require("hardhat");
const { setPrevRandao } = require("@nomicfoundation/hardhat-network-helpers");
const fs = require("fs");
const path = require("path");

// EIP-4788 contract address
const EIP4788_ADDRESS = "0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02";
const HISTORY_BUFFER_LENGTH = 8191; // 0x001fff

// Original SYSTEM_ADDRESS: 0xfffffffffffffffffffffffffffffffffffffffe
// Modified SYSTEM_ADDRESS (for testing): 0x00fffffffffffffffffffffffffffffffffffffe
const ORIGINAL_SYSTEM_ADDRESS = "0xfffffffffffffffffffffffffffffffffffffffe";
const TEST_SYSTEM_ADDRESS = "0x00fffffffffffffffffffffffffffffffffffffe";

// RANDAO_READER address
const RANDAO_READER = "0xFe38D0727B928E19bE51673Ac0691Ca22C05B1B3";

/**
 * Load and modify bytecode to use a test system address
 * Changes the first byte of SYSTEM_ADDRESS from 0xff to 0x00
 * Original: 0xfffffffffffffffffffffffffffffffffffffffe
 * Modified: 0x00fffffffffffffffffffffffffffffffffffffe
 * 
 * The SYSTEM_ADDRESS appears as: push20 (0x73) followed by 20 bytes
 * We need to find: 73 ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff fe
 */
function loadAndModifyBytecode() {
  const hexPath = path.join(__dirname, "../../src/bin/modified-eip4788-contract.bytecode.hex");
  let bytecode = fs.readFileSync(hexPath, "utf8").trim();
  
  // Remove 0x prefix if present
  if (bytecode.startsWith("0x")) {
    bytecode = bytecode.slice(2);
  }
  
  // Convert to buffer for easier manipulation
  const buffer = Buffer.from(bytecode, "hex");
  
  // Find the SYSTEM_ADDRESS pattern: push20 (0x73) followed by 20 bytes of address
  // Pattern: 73 ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff fe
  const push20Opcode = 0x73;
  let found = false;
  
  for (let i = 0; i < buffer.length - 21; i++) {
    if (buffer[i] === push20Opcode) {
      // Check if the next 20 bytes match the SYSTEM_ADDRESS pattern
      // First byte should be 0xff, last byte should be 0xfe
      if (buffer[i + 1] === 0xff && buffer[i + 20] === 0xfe) {
        // Verify it's all 0xff except the last byte
        let allFF = true;
        for (let j = 1; j < 19; j++) {
          if (buffer[i + 1 + j] !== 0xff) {
            allFF = false;
            break;
          }
        }
        if (allFF) {
          // Modify the first byte of the address from 0xff to 0x00
          buffer[i + 1] = 0x00;
          found = true;
          console.log(`  Modified SYSTEM_ADDRESS at byte offset ${i + 1}`);
          break;
        }
      }
    }
  }
  
  if (!found) {
    throw new Error("Could not find SYSTEM_ADDRESS in bytecode");
  }
  
  return "0x" + buffer.toString("hex");
}

/**
 * Deploy modified bytecode to the EIP-4788 address
 */
async function deployModifiedContract() {
  const modifiedBytecode = loadAndModifyBytecode();
  
  // Use hardhat_setCode to deploy bytecode directly to the address
  await ethers.provider.send("hardhat_setCode", [EIP4788_ADDRESS, modifiedBytecode]);
  
  console.log(`✓ Deployed modified contract to ${EIP4788_ADDRESS}`);
  console.log(`  Modified SYSTEM_ADDRESS: ${TEST_SYSTEM_ADDRESS}`);
  
  return modifiedBytecode;
}

/**
 * Call set() function on the contract
 * Note: The contract uses block.timestamp internally, not a parameter
 */
async function callSet(beaconRoot, signer) {
  const callData = ethers.zeroPadValue(beaconRoot, 32);
  const tx = await signer.sendTransaction({
    to: EIP4788_ADDRESS,
    data: callData,
  });
  return tx.wait();
}

/**
 * Get the current block timestamp
 */
async function getCurrentTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}

/**
 * Call get() function on the contract
 */
async function callGet(timestamp) {
  const callData = ethers.zeroPadValue(ethers.toBeHex(timestamp), 32);
  const result = await ethers.provider.call({
    to: EIP4788_ADDRESS,
    data: callData,
  });
  return result;
}

function decodeRootResult(result) {
  const [value] = ethers.AbiCoder.defaultAbiCoder().decode(["bytes32"], result);
  return value;
}

function decodeRandaoResult(result) {
  const [root, randao, returnedBlockNumber] = ethers.AbiCoder.defaultAbiCoder().decode(
    ["bytes32", "bytes32", "uint256"],
    result
  );
  return { root, randao, returnedBlockNumber };
}

async function setRandomPrevRandao() {
  const prevRandao = ethers.hexlify(ethers.randomBytes(32));
  await setPrevRandao(prevRandao);
  return prevRandao;
}

/**
 * Call get() function as RANDAO_READER
 */
async function callGetAsRandoReader(timestamp) {
  const callData = ethers.zeroPadValue(ethers.toBeHex(timestamp), 32);
  const result = await ethers.provider.call({
    to: EIP4788_ADDRESS,
    from: RANDAO_READER,
    data: callData,
  });
  return result;
}

async function setStorageSlot(slot, value) {
  const slotHex = ethers.zeroPadValue(ethers.toBeHex(slot), 32);
  await ethers.provider.send("hardhat_setStorageAt", [EIP4788_ADDRESS, slotHex, value]);
}

describe("EIP-4788 Modified Contract - Hardhat Local Testing", function () {
  let testSystemSigner;
  let regularSigner;
  
  before(async function () {
    // Get signers
    [regularSigner] = await ethers.getSigners();
    
    // Impersonate the test system address
    await ethers.provider.send("hardhat_impersonateAccount", [TEST_SYSTEM_ADDRESS]);
    testSystemSigner = await ethers.getSigner(TEST_SYSTEM_ADDRESS);
    
    // Fund the test system address
    await regularSigner.sendTransaction({
      to: TEST_SYSTEM_ADDRESS,
      value: ethers.parseEther("10"),
    });
    
    // Deploy the modified contract
    await deployModifiedContract();
  });
  
  after(async function () {
    // Stop impersonating
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [TEST_SYSTEM_ADDRESS]);
  });
  
  describe("Access Control", function () {
    it("Should allow set() from TEST_SYSTEM_ADDRESS", async function () {
      const beaconRoot = ethers.randomBytes(32);
      const tx = await callSet(beaconRoot, testSystemSigner);
      expect(tx.status).to.equal(1);
    });
    
    it("Should reject set() from regular address", async function () {
      const beaconRoot = ethers.randomBytes(32);
      const callData = ethers.zeroPadValue(beaconRoot, 32);
      
      // This should revert because regular address is not SYSTEM_ADDRESS
      await expect(
        regularSigner.sendTransaction({
          to: EIP4788_ADDRESS,
          data: callData,
        })
      ).to.be.reverted;
    });
  });
  
  describe("Basic set() and get() Operations", function () {
    it("Should store and retrieve beacon root", async function () {
      const beaconRoot = ethers.randomBytes(32);
      
      // Set the beacon root (uses current block timestamp)
      const tx = await callSet(beaconRoot, testSystemSigner);
      const block = await ethers.provider.getBlock(tx.blockNumber);
      const timestamp = block.timestamp;
      
      // Get the beacon root
      const result = await callGet(timestamp);
      const value = decodeRootResult(result);
      expect(value).to.equal(ethers.hexlify(beaconRoot));
    });

    it("Should return root-only for regular callers", async function () {
      const beaconRoot = ethers.randomBytes(32);

      // Set the beacon root (uses current block timestamp)
      const tx = await callSet(beaconRoot, testSystemSigner);
      const block = await ethers.provider.getBlock(tx.blockNumber);
      const timestamp = block.timestamp;

      // Regular caller: 32-byte root
      const regularResult = await callGet(timestamp);
      expect(regularResult.length).to.equal(66); // 0x + 64 hex chars
      const regularRoot = decodeRootResult(regularResult);
      expect(regularRoot).to.equal(ethers.hexlify(beaconRoot));
    });

    it("Should return root+randao+blocknum for RANDAO_READER", async function () {
      const beaconRoot = ethers.randomBytes(32);
      const expectedPrevRandao = await setRandomPrevRandao();

      // Set the beacon root (uses current block timestamp)
      const tx = await callSet(beaconRoot, testSystemSigner);
      const block = await ethers.provider.getBlock(tx.blockNumber);
      const timestamp = block.timestamp;

      // RANDAO_READER: root + randao + blocknum (96 bytes)
      await ethers.provider.send("hardhat_impersonateAccount", [RANDAO_READER]);
      try {
        const randaoResult = await callGetAsRandoReader(timestamp);
        expect(randaoResult.length).to.equal(194); // 0x + 192 hex chars
        const { root, randao, returnedBlockNumber } = decodeRandaoResult(randaoResult);
        expect(root).to.equal(ethers.hexlify(beaconRoot));
        expect(randao).to.equal(expectedPrevRandao);
        expect(returnedBlockNumber).to.equal(BigInt(block.number));
      } finally {
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [RANDAO_READER]);
      }
    });
    
    it("Should store and retrieve prevRandao via RANDAO_READER", async function () {
      const beaconRoot = ethers.randomBytes(32);
      const expectedPrevRandao = await setRandomPrevRandao();
      
      // Set the beacon root (this also stores prevRandao)
      const tx = await callSet(beaconRoot, testSystemSigner);
      const block = await ethers.provider.getBlock(tx.blockNumber);
      const timestamp = block.timestamp;
      const blockNumber = block.number;
      
      // Calculate storage slot for prevRandao
      const timestampIdx = Number(BigInt(timestamp.toString()) % BigInt(HISTORY_BUFFER_LENGTH));
      const randaoIdx = timestampIdx + HISTORY_BUFFER_LENGTH * 2;
      
      // Get stored prevRandao from storage
      const storedRandao = await ethers.provider.getStorage(EIP4788_ADDRESS, randaoIdx);
      expect(storedRandao).to.equal(expectedPrevRandao);
      
      // Impersonate RANDAO_READER to call get()
      await ethers.provider.send("hardhat_impersonateAccount", [RANDAO_READER]);
      
      try {
        // Get root, prevRandao, and block number via RANDAO_READER
        const result = await callGetAsRandoReader(timestamp);
        // Result should be (root, prevRandao, block number)
        expect(result.length).to.equal(194); // 0x + 192 hex chars = 96 bytes
        const { root, randao, returnedBlockNumber } = decodeRandaoResult(result);
        // Root should match what was stored for this timestamp
        expect(root).to.equal(ethers.hexlify(beaconRoot));
        // Verify the actual value matches what's stored in storage
        expect(randao).to.equal(storedRandao);
        expect(returnedBlockNumber).to.equal(BigInt(blockNumber));
      } finally {
        // Stop impersonating RANDAO_READER
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [RANDAO_READER]);
      }
    });
    
    it("Should reject get() with zero timestamp", async function () {
      await expect(callGet(0)).to.be.reverted;
    });
    
    it("Should reject get() with zero timestamp via RANDAO_READER", async function () {
      // Impersonate RANDAO_READER to call get()
      await ethers.provider.send("hardhat_impersonateAccount", [RANDAO_READER]);
      
      try {
        // Should revert because timestamp is zero
        await expect(callGetAsRandoReader(0)).to.be.reverted;
      } finally {
        // Stop impersonating RANDAO_READER
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [RANDAO_READER]);
      }
    });
    
    it("Should reject get() with wrong calldata size", async function () {
      await expect(
        ethers.provider.call({
          to: EIP4788_ADDRESS,
          data: "0x1234", // Wrong size
        })
      ).to.be.reverted;
    });
    
    it("Should reject get() with wrong calldata size via RANDAO_READER", async function () {
      // Impersonate RANDAO_READER to call get()
      await ethers.provider.send("hardhat_impersonateAccount", [RANDAO_READER]);
      
      try {
        // Should revert because calldata size is wrong
        await expect(
          ethers.provider.call({
            to: EIP4788_ADDRESS,
            from: RANDAO_READER,
            data: "0x1234", // Wrong size
          })
        ).to.be.reverted;
      } finally {
        // Stop impersonating RANDAO_READER
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [RANDAO_READER]);
      }
    });
  });
  
  describe("Index Wrapping (HISTORY_BUFFER_LENGTH = 8191)", function () {
    it("Should handle index wrapping at boundary (8191 -> 0)", async function () {
      // Get current timestamp and use it as base
      const currentBlock = await ethers.provider.getBlock("latest");
      const baseTimestamp = BigInt(currentBlock.timestamp);
      const historyLength = BigInt(HISTORY_BUFFER_LENGTH);
      const baseMod = baseTimestamp % historyLength;
      const offsetToLast =
        (historyLength - 1n - baseMod + historyLength) % historyLength;
      const targetTimestamp1 = baseTimestamp + offsetToLast;
      const targetTimestamp2 = targetTimestamp1 + 1n; // wraps to index 0
      
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(targetTimestamp1)]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot1 = ethers.randomBytes(32);
      const tx1 = await callSet(beaconRoot1, testSystemSigner);
      
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(targetTimestamp2)]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot2 = ethers.randomBytes(32);
      const tx2 = await callSet(beaconRoot2, testSystemSigner);
      
      const block1 = await ethers.provider.getBlock(tx1.blockNumber);
      const block2 = await ethers.provider.getBlock(tx2.blockNumber);
      const timestamp1 = block1.timestamp;
      const timestamp2 = block2.timestamp;
      
      // Verify both can be retrieved
      const result1 = decodeRootResult(await callGet(timestamp1));
      const result2 = decodeRootResult(await callGet(timestamp2));
      
      expect(result1).to.equal(ethers.hexlify(beaconRoot1));
      expect(result2).to.equal(ethers.hexlify(beaconRoot2));
    });
    
    it("Should handle multiple wraps (8191 -> 0 -> 1 -> ...)", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const baseTimestamp = BigInt(currentBlock.timestamp);
      const historyLength = BigInt(HISTORY_BUFFER_LENGTH);
      const baseMod = baseTimestamp % historyLength;
      const offsetToWrapStart =
        (historyLength - 2n - baseMod + historyLength) % historyLength;
      const startTimestamp = baseTimestamp + offsetToWrapStart; // idx = 8191 - 2
      const beaconRoots = [];
      
      // Use sequential timestamps to cross the wrap: 8191-2, 8191-1, 0, 1, 2
      for (let i = 0; i < 5; i++) {
        const targetTimestamp = startTimestamp + BigInt(i);
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(targetTimestamp)]);
        await ethers.provider.send("evm_mine", []);
        const beaconRoot = ethers.randomBytes(32);
        const tx = await callSet(beaconRoot, testSystemSigner);
        const block = await ethers.provider.getBlock(tx.blockNumber);
        beaconRoots.push({ timestamp: block.timestamp, beaconRoot });
      }
      
      // Verify all can be retrieved
      for (const { timestamp, beaconRoot } of beaconRoots) {
        const result = decodeRootResult(await callGet(timestamp));
        expect(result).to.equal(ethers.hexlify(beaconRoot));
      }
    });
    
    it("Should overwrite old values when index wraps", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const baseTimestamp = currentBlock.timestamp;
      
      // Set value at index 0 (timestamp % 8192 = 0)
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(baseTimestamp) + 1]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot1 = ethers.randomBytes(32);
      const tx1 = await callSet(beaconRoot1, testSystemSigner);
      const block1 = await ethers.provider.getBlock(tx1.blockNumber);
      const timestamp1 = block1.timestamp;
      
      // Set value at index 0 again (different timestamp, same index)
      // baseTimestamp + 8192 also maps to index 0
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(BigInt(baseTimestamp) + 8192n)]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot2 = ethers.randomBytes(32);
      const tx2 = await callSet(beaconRoot2, testSystemSigner);
      const block2 = await ethers.provider.getBlock(tx2.blockNumber);
      const timestamp2 = block2.timestamp;
      
      // The contract checks if stored timestamp matches input
      // So timestamp1 should revert because the stored timestamp is timestamp2
      await expect(callGet(timestamp1)).to.be.reverted;
      const result2 = decodeRootResult(await callGet(timestamp2));
      expect(result2).to.equal(ethers.hexlify(beaconRoot2));
    });
    
    it("Should store and retrieve beaconRoot correctly after wrapping", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const baseTimestamp = currentBlock.timestamp;
      
      // Set value at index 0
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(baseTimestamp) + 1]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot1 = ethers.randomBytes(32);
      const tx1 = await callSet(beaconRoot1, testSystemSigner);
      const block1 = await ethers.provider.getBlock(tx1.blockNumber);
      const timestamp1 = block1.timestamp;
      
      // Set another value that wraps to the same index
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(BigInt(timestamp1) + BigInt(HISTORY_BUFFER_LENGTH))]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot2 = ethers.randomBytes(32);
      const tx2 = await callSet(beaconRoot2, testSystemSigner);
      const block2 = await ethers.provider.getBlock(tx2.blockNumber);
      const timestamp2 = block2.timestamp;
      
      // Verify beaconRoot for timestamp2 can be retrieved
      const result2 = decodeRootResult(await callGet(timestamp2));
      expect(result2).to.equal(ethers.hexlify(beaconRoot2));
      
      // Verify timestamp1 cannot be retrieved (overwritten)
      await expect(callGet(timestamp1)).to.be.reverted;
    });
  });

  describe("State/Storage Overrides (Hardhat)", function () {
    it("Should read simulated entries via direct storage writes", async function () {
      const snapshot = await ethers.provider.send("evm_snapshot", []);
      try {
        const currentBlock = await ethers.provider.getBlock("latest");
        const timestamp = BigInt(currentBlock.timestamp) + 123n;
        const blockNumber = BigInt(currentBlock.number) + 7n;
        const beaconRoot = ethers.hexlify(ethers.randomBytes(32));
        const prevRandao = ethers.hexlify(ethers.randomBytes(32));

        const idx = Number(timestamp % BigInt(HISTORY_BUFFER_LENGTH));
        const rootIdx = idx + HISTORY_BUFFER_LENGTH;
        const randaoIdx = rootIdx + HISTORY_BUFFER_LENGTH;
        const blockIdx = randaoIdx + HISTORY_BUFFER_LENGTH;

        await setStorageSlot(idx, ethers.zeroPadValue(ethers.toBeHex(timestamp), 32));
        await setStorageSlot(rootIdx, beaconRoot);
        await setStorageSlot(randaoIdx, prevRandao);
        await setStorageSlot(blockIdx, ethers.zeroPadValue(ethers.toBeHex(blockNumber), 32));

        const result = await callGet(Number(timestamp));
        const root = decodeRootResult(result);
        expect(root).to.equal(beaconRoot);

        await ethers.provider.send("hardhat_impersonateAccount", [RANDAO_READER]);
        try {
          const randaoResult = await callGetAsRandoReader(Number(timestamp));
          const { root: rRoot, randao, returnedBlockNumber } = decodeRandaoResult(randaoResult);
          expect(rRoot).to.equal(beaconRoot);
          expect(randao).to.equal(prevRandao);
          expect(returnedBlockNumber).to.equal(blockNumber);
        } finally {
          await ethers.provider.send("hardhat_stopImpersonatingAccount", [RANDAO_READER]);
        }
      } finally {
        await ethers.provider.send("evm_revert", [snapshot]);
      }
    });
  });
  
  describe("Edge Cases", function () {
    it("Should handle large timestamps", async function () {
      // Use a large but safe timestamp (Hardhat EVM has timestamp limits)
      const currentBlock = await ethers.provider.getBlock("latest");
      const largeTimestamp = BigInt(currentBlock.timestamp) + 1000000n; // Add 1M seconds
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(largeTimestamp)]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot = ethers.randomBytes(32);
      
      const tx = await callSet(beaconRoot, testSystemSigner);
      const block = await ethers.provider.getBlock(tx.blockNumber);
      const actualTimestamp = block.timestamp;
      
      // Get using the actual timestamp
      const result = decodeRootResult(await callGet(actualTimestamp));
      expect(result).to.equal(ethers.hexlify(beaconRoot));
    });
    
    it("Should handle sequential sets with different timestamps", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const baseTimestamp = BigInt(currentBlock.timestamp);
      const timestamps = [
        baseTimestamp + 1000n,
        baseTimestamp + 2000n,
        baseTimestamp + 3000n,
        baseTimestamp + 4000n,
        baseTimestamp + 5000n
      ];
      const beaconRoots = timestamps.map(() => ethers.randomBytes(32));
      const actualTimestamps = [];
      
      // Set all values
      for (let i = 0; i < timestamps.length; i++) {
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamps[i])]);
        await ethers.provider.send("evm_mine", []);
        const tx = await callSet(beaconRoots[i], testSystemSigner);
        const block = await ethers.provider.getBlock(tx.blockNumber);
        actualTimestamps.push(block.timestamp);
      }
      
      // Verify all can be retrieved
      for (let i = 0; i < timestamps.length; i++) {
        const result = decodeRootResult(await callGet(actualTimestamps[i]));
        expect(result).to.equal(ethers.hexlify(beaconRoots[i]));
      }
    });
    
    it("Should handle get() with non-existent timestamp", async function () {
      const nonExistentTimestamp = 999999999;
      
      // Should revert because timestamp doesn't match stored value
      await expect(callGet(nonExistentTimestamp)).to.be.reverted;
    });
    
    it("Should handle get() with non-existent timestamp via RANDAO_READER", async function () {
      const nonExistentTimestamp = 999999999;
      
      // Impersonate RANDAO_READER to call get()
      await ethers.provider.send("hardhat_impersonateAccount", [RANDAO_READER]);
      
      try {
        // Should revert because timestamp doesn't match stored value
        await expect(callGetAsRandoReader(nonExistentTimestamp)).to.be.reverted;
      } finally {
        // Stop impersonating RANDAO_READER
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [RANDAO_READER]);
      }
    });
    
    it("Should store and retrieve prevRandao correctly after wrapping", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const baseTimestamp = currentBlock.timestamp;
      
      // Set value at index 0
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(baseTimestamp) + 1]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot1 = ethers.randomBytes(32);
      const tx1 = await callSet(beaconRoot1, testSystemSigner);
      
      // Set another value that wraps to index 0
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(BigInt(baseTimestamp) + 8192n)]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot2 = ethers.randomBytes(32);
      const expectedPrevRandao = await setRandomPrevRandao();
      const tx2 = await callSet(beaconRoot2, testSystemSigner);
      const block2 = await ethers.provider.getBlock(tx2.blockNumber);
      const timestamp2 = block2.timestamp;
      
      // Calculate storage slot for prevRandao
      const timestampIdx2 = Number(BigInt(timestamp2.toString()) % BigInt(HISTORY_BUFFER_LENGTH));
      const randaoIdx2 = timestampIdx2 + HISTORY_BUFFER_LENGTH * 2;
      
      // Get stored prevRandao from storage
      const storedRandao2 = await ethers.provider.getStorage(EIP4788_ADDRESS, randaoIdx2);
      expect(storedRandao2).to.equal(expectedPrevRandao);
      
      // Impersonate RANDAO_READER to call get()
      await ethers.provider.send("hardhat_impersonateAccount", [RANDAO_READER]);
      
      try {
        // Get root, prevRandao, and block number for timestamp2 via RANDAO_READER
        const randaoResult = await callGetAsRandoReader(timestamp2);
        expect(randaoResult.length).to.equal(194); // 0x + 192 hex chars
        const { root, randao, returnedBlockNumber } = decodeRandaoResult(randaoResult);
        // Root should match the stored value
        const storedRoot = await ethers.provider.getStorage(EIP4788_ADDRESS, timestampIdx2 + HISTORY_BUFFER_LENGTH);
        expect(root).to.equal(storedRoot);
        // Verify the actual value matches what's stored in storage
        expect(randao).to.equal(storedRandao2);
        expect(returnedBlockNumber).to.equal(BigInt(block2.number));
      } finally {
        // Stop impersonating RANDAO_READER
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [RANDAO_READER]);
      }
    });
  });
  
  describe("Storage Layout Verification", function () {
    it("Should verify storage slots are correctly calculated", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const targetTimestamp = BigInt(currentBlock.timestamp) + 1000n;
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(targetTimestamp)]);
      await ethers.provider.send("evm_mine", []);
      const beaconRoot = ethers.randomBytes(32);
      const expectedPrevRandao = await setRandomPrevRandao();
      const tx = await callSet(beaconRoot, testSystemSigner);
      const block = await ethers.provider.getBlock(tx.blockNumber);
      const actualTimestamp = block.timestamp;
      
      const timestampIdx = Number(BigInt(actualTimestamp.toString()) % BigInt(HISTORY_BUFFER_LENGTH));
      const rootIdx = timestampIdx + HISTORY_BUFFER_LENGTH;
      const randaoIdx = rootIdx + HISTORY_BUFFER_LENGTH;
      const blockNumberIdx = timestampIdx + HISTORY_BUFFER_LENGTH * 3;
      
      // Verify storage slots using getStorageAt
      const storedTimestamp = await ethers.provider.getStorage(EIP4788_ADDRESS, timestampIdx);
      const storedRoot = await ethers.provider.getStorage(EIP4788_ADDRESS, rootIdx);
      const storedRandao = await ethers.provider.getStorage(EIP4788_ADDRESS, randaoIdx);
      const storedBlockNumber = await ethers.provider.getStorage(EIP4788_ADDRESS, blockNumberIdx);
      
      expect(storedTimestamp).to.equal(ethers.toBeHex(actualTimestamp, 32));
      expect(storedBlockNumber).to.equal(ethers.toBeHex(block.number, 32));
      expect(storedRoot).to.equal(ethers.hexlify(beaconRoot));
      expect(storedRandao).to.equal(expectedPrevRandao);
      
      // Also verify via RANDAO_READER get() call
      await ethers.provider.send("hardhat_impersonateAccount", [RANDAO_READER]);
      try {
        const randaoResult = await callGetAsRandoReader(actualTimestamp);
        const { root, randao, returnedBlockNumber } = decodeRandaoResult(randaoResult);
        // Root should match stored root
        expect(root).to.equal(storedRoot);
        // Verify it matches what's stored in storage
        expect(randao).to.equal(storedRandao);
        expect(returnedBlockNumber).to.equal(BigInt(block.number));
      } finally {
        await ethers.provider.send("hardhat_stopImpersonatingAccount", [RANDAO_READER]);
      }
    });
  });
});
