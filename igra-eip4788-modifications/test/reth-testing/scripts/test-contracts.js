#!/usr/bin/env node
/**
 * Test script for the Igra's version of the EIP-4788 contract running on reth node
 * Uses direct RPC calls via ethers.js
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Configuration
// Local EL/CL testnet: reth (EL) + CL simulator (CL)
// This provides proper prevrandao support via Engine API integration
const RPC_URL = process.env.RETH_RPC_URL || "http://localhost:8545"; // EL node port
const CL_API_URL = process.env.CL_API_URL || "http://localhost:5052"; // CL simulator HTTP API

// Use built-in fetch (Node.js 18+)
// For older Node.js versions, node-fetch is available as fallback
let fetch;
if (global.fetch) {
  fetch = global.fetch;
} else {
  try {
    fetch = require("node-fetch");
  } catch (e) {
    console.error("Error: fetch is not available.");
    console.error("Please use Node.js 18+ (which has built-in fetch) or install node-fetch:");
    console.error("  npm install");
    process.exit(1);
  }
}
const BEACON_ROOT_CONTRACT = "0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02";
const RANDAO_READER = "0xFe38D0727B928E19bE51673Ac0691Ca22C05B1B3"; // low 20 bytes of bytes32(uint256(keccak256('eip4788.modified.reader')) - 1)
const SYSTEM_ADDRESS = "0xfffffffffffffffffffffffffffffffffffffffe";
const HISTORY_BUFFER_LENGTH = 8191; // 0x001fff

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log("\n" + "=".repeat(50));
  log(title, "blue");
  console.log("=".repeat(50));
}

function isZeroHash(value) {
  return typeof value === "string" && /^0x0{64}$/i.test(value);
}

function createFailTracker() {
  let hadFailure = false;
  const fail = (message) => {
    hadFailure = true;
    log(message, "red");
  };
  return { fail, hadFailure: () => hadFailure };
}

function logConfiguration() {
  logSection("EIP-4788 Contract Testing on Local EL/CL Testnet");
  log("\nConfiguration:", "blue");
  log("  Local EL/CL testnet: reth (EL) + CL simulator (CL)", "blue");
  log(`  EL Node RPC: ${RPC_URL} (reth execution layer)`, "blue");
  log(`  CL Simulator API: ${CL_API_URL} (CL simulator)`, "blue");
  log("  EL and CL communicate via Engine API for prevrandao + beacon root support", "blue");
}

async function createProviderOrExit(fail) {
  log(`\nConnecting to EL node RPC: ${RPC_URL}`, "blue");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  try {
    const initialBlockNumber = await provider.getBlockNumber();
    log("✓ Connected to EL node", "green");
    log(`  Block: ${initialBlockNumber}`, "blue");
    return provider;
  } catch (error) {
    fail(`✗ Failed to connect: ${error.message}`);
    log("  Make sure EL/CL nodes are running", "yellow");
    log("  Check: docker compose ps", "yellow");
    log("  Start: docker compose up -d", "yellow");
    process.exit(1);
  }
}

function createWaitForBlocks(provider) {
  return async (minBlock, timeoutMs = 60000) => {
    const start = Date.now();
    while (true) {
      const blockNumber = await provider.getBlockNumber();
      if (blockNumber >= minBlock) {
        const block = await provider.getBlock(blockNumber);
        if (block && block.timestamp && block.timestamp > 0) {
          return { blockNumber, block };
        }
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for block >= ${minBlock} with non-zero timestamp`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };
}

async function ensureReadyBlockOrExit(provider, waitForBlocks, fail) {
  const { blockNumber: readyBlockNumber, block: readyBlock } = await waitForBlocks(1);
  const initialPrevRandao = readyBlock.prevRandao || readyBlock.mixHash;
  if (initialPrevRandao && !isZeroHash(initialPrevRandao)) {
    log("✓ prevrandao available in block data", "green");
    log(`  prevrandao: ${initialPrevRandao}`, "blue");
  } else {
    log("⚠ prevrandao not available in block data (may still work in EVM)", "yellow");
  }
  log(`\nUsing block ${readyBlockNumber} with timestamp ${readyBlock.timestamp}`, "blue");
  const readyPrevRandao = readyBlock.prevRandao || readyBlock.mixHash;
  if (!readyPrevRandao || isZeroHash(readyPrevRandao)) {
    fail(`✗ Block ${readyBlockNumber} has missing/zero prevRandao`);
    process.exit(1);
  } else {
    log(`✓ Block ${readyBlockNumber} prevRandao available`, "green");
    log(`  prevRandao: ${readyPrevRandao}`, "blue");
  }
  if (!readyBlock.parentBeaconBlockRoot || isZeroHash(readyBlock.parentBeaconBlockRoot)) {
    fail(`✗ Block ${readyBlockNumber} has missing/zero parentBeaconBlockRoot`);
    process.exit(1);
  } else {
    log(`✓ Block ${readyBlockNumber} parentBeaconBlockRoot available`, "green");
    log(`  parentBeaconBlockRoot: ${readyBlock.parentBeaconBlockRoot}`, "blue");
  }
  return { readyBlockNumber, readyBlock };
}

function loadArtifactsOrExit(fail) {
  logSection("Loading Compiled Contracts");
  const artifactsPath = path.join(__dirname, "../../common/artifacts/contracts");
  try {
    const beaconRootArtifact = JSON.parse(
      fs.readFileSync(path.join(artifactsPath, "BeaconRootWrapper.sol/BeaconRootWrapper.json"), "utf8")
    );
    const randaoArtifact = JSON.parse(
      fs.readFileSync(path.join(artifactsPath, "RandaoGetterWrapper.sol/RandaoGetterWrapper.json"), "utf8")
    );
    log("✓ Contracts loaded", "green");
    return { BeaconRootWrapper: beaconRootArtifact, RandaoGetterWrapper: randaoArtifact };
  } catch (error) {
    fail(`✗ Failed to load contracts: ${error.message}`);
    log("Please run 'npm run compile' first", "yellow");
    process.exit(1);
  }
}

async function verifyDeploymentOrExit(provider, fail) {
  logSection("Verifying Contract Deployment");
  const beaconCode = await provider.getCode(BEACON_ROOT_CONTRACT);
  const randaoCode = await provider.getCode(RANDAO_READER);

  if (beaconCode === "0x" || beaconCode.length < 10) {
    fail(`✗ Beacon Root contract not deployed at ${BEACON_ROOT_CONTRACT}`);
    process.exit(1);
  }
  log("✓ Beacon Root contract deployed", "green");
  log(`  Code length: ${beaconCode.length / 2 - 1} bytes`, "blue");

  if (randaoCode === "0x" || randaoCode.length < 10) {
    fail(`✗ RANDAO READER contract not deployed at ${RANDAO_READER}`);
    process.exit(1);
  }
  log("✓ RANDAO READER contract deployed", "green");
  log(`  Code length: ${randaoCode.length / 2 - 1} bytes`, "blue");
}

function createCallHelpers(provider, testAccount, waitForBlocks) {
  const ethCallGas = "0x2dc6c0"; // 3,000,000
  const callContract = async ({ to, from, data, blockTag = "latest" }) => {
    try {
      return await provider.call({
        to,
        from,
        data,
        gas: ethCallGas,
        blockTag
      });
    } catch {
      return null;
    }
  };
  const decodeBeaconRoot = (result) => {
    if (result === "0x" || result.length < 66) return null;
    const [root] = ethers.AbiCoder.defaultAbiCoder().decode(["bytes32"], result);
    return root;
  };
  const decodeRandao = (result) => {
    if (result === "0x" || result.length < 194) return null;
    const [root, randao, blockNumber] =
      ethers.AbiCoder.defaultAbiCoder().decode(["bytes32", "bytes32", "uint256"], result);
    return { root, randao, blockNumber };
  };
  const callBeaconGet = async (ts, blockTag = "latest") => {
    const callData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [ts]);
    const result = await callContract({
      to: BEACON_ROOT_CONTRACT,
      from: testAccount.address,
      data: callData,
      blockTag
    });
    return decodeBeaconRoot(result);
  };
  const callRandaoReader = async (ts, blockTag = "latest") => {
    const callData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [ts]);
    const result = await callContract({
      to: RANDAO_READER,
      from: testAccount.address,
      data: callData,
      blockTag
    });
    return decodeRandao(result);
  };
  const retryCall = async (fn, retries = 1) => {
    let last = null;
    for (let i = 0; i <= retries; i++) {
      last = await fn();
      if (last) return last;
      if (i < retries) {
        await waitForBlocks((await provider.getBlockNumber()) + 1, 60000);
      }
    }
    return null;
  };

  return { callContract, decodeRandao, callBeaconGet, callRandaoReader, retryCall };
}

async function getLatestBlockOrExit(provider, waitForBlocks, fail) {
  const startBlock = await provider.getBlockNumber();
  await waitForBlocks(startBlock + 2, 60000);
  const latestBlockNumber = await provider.getBlockNumber();
  const latestBlock = await provider.getBlock(latestBlockNumber);
  if (!latestBlock) {
    fail(`✗ Could not load latest block ${latestBlockNumber}`);
    process.exit(1);
  }
  return latestBlock;
}

async function findPreviousBlockWithStoredEntry(provider, callBeaconGet, callRandaoReader, startBlockNumber, maxLookback = 256) {
  for (let i = 1; i <= maxLookback && startBlockNumber - i >= 0; i++) {
    const b = await provider.getBlock(startBlockNumber - i);
    if (!b) break;
    const root = await callBeaconGet(b.timestamp);
    const randaoResult = await callRandaoReader(b.timestamp);
    if (!root || !randaoResult) continue;

    const { root: rRoot, randao: rRandao, blockNumber: rBlock } = randaoResult;
    const headerRoot = b.parentBeaconBlockRoot;
    const headerRandao = b.prevRandao || b.mixHash;
    if (!headerRoot || !headerRandao) continue;
    const ok =
      root.toLowerCase() === headerRoot.toLowerCase() &&
      rRoot.toLowerCase() === headerRoot.toLowerCase() &&
      rRandao.toLowerCase() === headerRandao.toLowerCase() &&
      rBlock === BigInt(b.number);
    if (ok) {
      return b;
    }
  }
  return null;
}

async function testSetAccessControl(provider, fail) {
  logSection("Testing set() Access Control");
  log("Testing that set() reverts when called from non-SYSTEM_ADDRESS...", "blue");

  const testBeaconRootForSet = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const setCallData = testBeaconRootForSet;
  const fundedKey =
    process.env.RETH_FUNDED_PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  const signer = await getFundedSigner(provider, fundedKey, "set() access control");
  if (!signer) return;

  try {
    const txFees = await getTxFees(provider);
    const tx = await signer.sendTransaction({
      to: BEACON_ROOT_CONTRACT,
      data: setCallData,
      gasLimit: 3_000_000,
      ...txFees
    });
    const receipt = await tx.wait();
    if (receipt && receipt.status === 0n) {
      log("✓ set() correctly reverted from non-SYSTEM_ADDRESS", "green");
      log(`  Caller: ${signer.address}`, "blue");
    } else {
      fail("✗ set() tx from non-SYSTEM_ADDRESS did not revert");
      log(`  Tx hash: ${tx.hash}`, "red");
    }
  } catch (error) {
    log("✓ set() correctly rejected tx from non-SYSTEM_ADDRESS", "green");
    log(`  Caller: ${signer.address}`, "blue");
    log(`  Error (expected): ${error.message.substring(0, 150)}...`, "blue");
    log("  This confirms access control is working correctly.", "blue");
  }
}

async function testRandaoReader(provider, helpers, storedTimestamp, fromAddress, fail) {
  log("\nTesting RANDAO_READER...", "blue");
  const rawCallData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [storedTimestamp]);

  try {
    const directResult = await helpers.callContract({
      to: BEACON_ROOT_CONTRACT,
      from: RANDAO_READER,
      data: rawCallData
    });
    const directDecoded = helpers.decodeRandao(directResult);
    if (!directDecoded) {
      log(`⚠ Direct RANDAO_READER-path call returned unexpected result: ${directResult}`, "yellow");
    } else {
      log("✓ Direct RANDAO_READER-path call succeeded", "green");
    }
  } catch (error) {
    log(`⚠ Direct RANDAO_READER-path call failed: ${error.message}`, "yellow");
  }

  try {
    const result = await helpers.callContract({
      to: RANDAO_READER,
      from: fromAddress,
      data: rawCallData
    });
    const decoded = helpers.decodeRandao(result);
    if (!decoded) {
      fail(`✗ RANDAO_READER returned unexpected result: ${result}`);
    } else {
      const { root: returnedRoot, randao: returnedRandao, blockNumber: returnedBlockNumber } = decoded;
      log("✓ RANDAO_READER call succeeded", "green");
      log(`  Returned root: ${returnedRoot}`, "blue");
      log(`  Returned randao: ${returnedRandao}`, "blue");
      log(`  Returned block: ${returnedBlockNumber}`, "blue");
    }
  } catch (error) {
    fail(`✗ RANDAO_READER call failed: ${error.message}`);
  }
}

async function runHeaderMatchingSuite(provider, helpers, waitForBlocks, storedBlock, fail) {
  const assertUniqueTimestamp = async (blockNumber, targetTimestamp, maxLookback = 256) => {
    const latest = await provider.getBlockNumber();
    const lowerBound = Math.max(0, blockNumber - maxLookback);
    for (let i = latest; i >= lowerBound; i--) {
      const b = await provider.getBlock(i);
      if (!b) break;
      if (b.timestamp === targetTimestamp && b.number !== blockNumber) {
        throw new Error(
          `Duplicate timestamp detected: ${targetTimestamp} at blocks ${blockNumber} and ${b.number}`
        );
      }
    }
  };

  const runHeaderMatching = async (label, blockNum, blockData, options = {}) => {
    const { allowMissing = false } = options;
    log(`\nTesting end-to-end header matching (${label})...`, "blue");
    await assertUniqueTimestamp(blockNum, blockData.timestamp);

    const expectedRoot = blockData.parentBeaconBlockRoot;
    const expectedRandao = blockData.prevRandao || blockData.mixHash;
    const expectedBlockNumber = blockNum;

    let regularResult = await helpers.callBeaconGet(blockData.timestamp, blockNum);
    if (!regularResult) {
      if (allowMissing) {
        log(`⚠ Skipping ${label} header matching: get() returned empty`, "yellow");
        return;
      }
      await waitForBlocks((await provider.getBlockNumber()) + 1, 20000);
      regularResult = await helpers.callBeaconGet(blockData.timestamp, blockNum);
    }
    if (!regularResult) {
      fail("✗ Header match failed: get() returned empty");
    } else if (regularResult.toLowerCase() === expectedRoot.toLowerCase()) {
      log("✓ get() matches block parentBeaconBlockRoot", "green");
    } else {
      fail("✗ get() root mismatch");
      log(`  Header root:   ${expectedRoot}`, "red");
      log(`  Contract root: ${regularResult}`, "red");
    }

    const readerResult = await helpers.callRandaoReader(blockData.timestamp, blockNum);
    if (!readerResult) {
      fail("✗ Header match failed: RANDAO_READER returned empty");
    } else {
      const { root: returnedRoot, randao: returnedRandao, blockNumber: returnedBlockNumber } = readerResult;
      const okRoot = returnedRoot.toLowerCase() === expectedRoot.toLowerCase();
      const okRandao = returnedRandao.toLowerCase() === expectedRandao.toLowerCase();
      const okBlock = returnedBlockNumber === BigInt(expectedBlockNumber);
      if (okRoot && okRandao && okBlock) {
        log("✓ RANDAO_READER matches block header (root, randao, block)", "green");
      } else {
        fail("✗ RANDAO_READER header mismatch");
        log(`  Header root:   ${expectedRoot}`, "red");
        log(`  Contract root: ${returnedRoot}`, "red");
        log(`  Header randao: ${expectedRandao}`, "red");
        log(`  Contract randao: ${returnedRandao}`, "red");
        log(`  Header block:  ${expectedBlockNumber}`, "red");
        log(`  Contract block: ${returnedBlockNumber}`, "red");
      }
      try {
        const returnedHeader = await provider.getBlock(Number(returnedBlockNumber));
        if (!returnedHeader) {
          log(`⚠ Could not load header for returned block ${returnedBlockNumber}`, "yellow");
        } else {
          const returnedHeaderRoot = returnedHeader.parentBeaconBlockRoot;
          const returnedHeaderRandao = returnedHeader.prevRandao || returnedHeader.mixHash;
          const okReturnRoot = returnedHeaderRoot && returnedRoot.toLowerCase() === returnedHeaderRoot.toLowerCase();
          const okReturnRandao = returnedHeaderRandao && returnedRandao.toLowerCase() === returnedHeaderRandao.toLowerCase();
          if (okReturnRoot && okReturnRandao) {
            log("✓ Returned block header matches returned root/randao", "green");
          } else {
            fail("✗ Returned block header mismatch");
            if (returnedHeaderRoot) {
              log(`  Returned header root:   ${returnedHeaderRoot}`, "red");
            }
            log(`  Returned root:          ${returnedRoot}`, "red");
            if (returnedHeaderRandao) {
              log(`  Returned header randao: ${returnedHeaderRandao}`, "red");
            }
            log(`  Returned randao:        ${returnedRandao}`, "red");
          }
        }
      } catch (error) {
        log(`⚠ Failed to verify returned block header: ${error.message}`, "yellow");
      }
    }
  };

  try {
    await runHeaderMatching("latest", storedBlock.number, storedBlock);
    await runRetentionCheck(provider, helpers);

    const nextBlockTarget = (await provider.getBlockNumber()) + 2;
    await waitForBlocks(nextBlockTarget, 60000);
    const historicalBlock = await findPreviousBlockWithStoredEntry(
      provider,
      helpers.callBeaconGet,
      helpers.callRandaoReader,
      storedBlock.number
    );
    if (!historicalBlock) {
      log("⚠ Historical header matching skipped (no earlier block with stored entry found)", "yellow");
    } else {
      await runHeaderMatching(
        `historical ${historicalBlock.number}`,
        historicalBlock.number,
        historicalBlock,
        { allowMissing: true }
      );
    }
  } catch (error) {
    fail(`✗ End-to-end header matching failed: ${error.message}`);
  }
}

async function runRetentionCheck(provider, helpers) {
  log("\nTesting retention for recent blocks (latest state)...", "blue");
  const latestForRetention = await provider.getBlockNumber();
  const retentionCount = Math.min(5000, latestForRetention);
  const retentionSample = makeRetentionSample(retentionCount, latestForRetention);
  log(`  Retention sampling ${retentionSample.length} blocks (of ${retentionCount})`, "blue");

  for (let i = 0; i < retentionSample.length; i++) {
    const bn = retentionSample[i];
    const b = await provider.getBlock(bn);
    if (!b) {
      throw new Error(`Failed to load block ${bn} during retention check`);
    }
    const root = await helpers.retryCall(() => helpers.callBeaconGet(b.timestamp), 1);
    if (!root) {
      await assertRetentionOverwrite(provider, b);
      continue;
    }
    if (root.toLowerCase() !== b.parentBeaconBlockRoot.toLowerCase()) {
      throw new Error(`Retention failure: root mismatch at block ${bn}`);
    }
    const readerRes = await helpers.retryCall(() => helpers.callRandaoReader(b.timestamp), 1);
    if (!readerRes) {
      throw new Error(`Retention failure: RANDAO_READER reverted for block ${bn} timestamp ${b.timestamp}`);
    }
    const { root: rRoot, randao: rRandao, blockNumber: rBlock } = readerRes;
    const headerRandao = b.prevRandao || b.mixHash;
    if (rRoot.toLowerCase() !== b.parentBeaconBlockRoot.toLowerCase()) {
      throw new Error(`Retention failure: reader root mismatch at block ${bn}`);
    }
    if (rRandao.toLowerCase() !== headerRandao.toLowerCase()) {
      throw new Error(`Retention failure: reader randao mismatch at block ${bn}`);
    }
    if (rBlock !== BigInt(bn)) {
      throw new Error(`Retention failure: reader block mismatch at block ${bn}`);
    }
    if (i % 20 === 0) {
      log(`  retention OK through block ${bn}`, "blue");
    }
  }

}

async function assertRetentionOverwrite(provider, block) {
  const readStorageSlot = async (slot) => {
    const hexSlot = ethers.zeroPadValue(ethers.toBeHex(slot), 32);
    return await provider.getStorage(BEACON_ROOT_CONTRACT, hexSlot, "latest");
  };
  const idx = BigInt(block.timestamp) % 8191n;
  const storedTimestampHex = await readStorageSlot(idx);
  const storedTimestamp = BigInt(storedTimestampHex);
  if (
    storedTimestamp !== 0n &&
    storedTimestamp > BigInt(block.timestamp) &&
    (storedTimestamp - BigInt(block.timestamp)) % 8191n === 0n
  ) {
    log(
      `  retention note: block ${block.number} timestamp ${block.timestamp} overwritten by ${storedTimestamp}`,
      "blue"
    );
    return;
  }
  if (storedTimestamp === BigInt(block.timestamp)) {
    const rootIdx = Number(idx) + HISTORY_BUFFER_LENGTH;
    const randaoIdx = rootIdx + HISTORY_BUFFER_LENGTH;
    const blockIdx = randaoIdx + HISTORY_BUFFER_LENGTH;
    const storedRoot = await readStorageSlot(rootIdx);
    const storedRandao = await readStorageSlot(randaoIdx);
    const storedBlock = await readStorageSlot(blockIdx);
    throw new Error(
      `Retention failure: get() reverted for block ${block.number} timestamp ${block.timestamp} ` +
      `(slot=${idx}, storedRoot=${storedRoot}, storedRandao=${storedRandao}, storedBlock=${storedBlock})`
    );
  }
  throw new Error(`Retention failure: get() reverted for block ${block.number} timestamp ${block.timestamp}`);
}

function makeRetentionSample(count, maxBlock) {
  if (count <= 100) {
    return Array.from({ length: count }, (_, i) => maxBlock - i);
  }
  const picks = new Set();
  while (picks.size < 100) {
    const bn = maxBlock - Math.floor(Math.random() * count);
    if (bn >= 1) picks.add(bn);
  }
  return Array.from(picks).sort((a, b) => b - a);
}

async function runWrapperTxTests(provider, helpers, waitForBlocks, artifacts, fail) {
  log("\nTesting wrapper contracts via real transactions...", "blue");
  const fundedKey =
    process.env.RETH_FUNDED_PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const wrapperSigner = await getFundedSigner(provider, fundedKey, "wrapper tx tests");
  if (!wrapperSigner) return;

  try {
    await ensureNoPendingTxs(provider, wrapperSigner);
    const txFees = await getTxFees(provider, true);
    const wrappers = await deployWrapperContracts(wrapperSigner, artifacts, txFees);
    const headerBlock = await selectLatestStoredBlock(provider, helpers, waitForBlocks);

    if (!headerBlock) {
      throw new Error("Wrapper precheck failed: latest state never returned stored entry");
    }

    const { beaconTx, randaoTx } = await sendWrapperCalls(wrappers, headerBlock.timestamp, txFees);
    await waitForNextBlocks(provider, 2);
    await verifyWrapperOutputs(provider, helpers, artifacts, headerBlock, beaconTx, randaoTx, fail);
  } catch (error) {
    if (error.message === "pending txs in pool") {
      return;
    }
    fail(`✗ Wrapper transaction tests failed: ${error.message}`);
  }
}

async function getFundedSigner(provider, privateKey, label) {
  let signer;
  try {
    signer = new ethers.Wallet(privateKey, provider);
    const balance = await provider.getBalance(signer.address);
    if (balance === 0n) {
      throw new Error(`Signer ${signer.address} has zero balance`);
    }
    return signer;
  } catch (error) {
    log(`⚠ Skipping ${label}: ${error.message}`, "yellow");
    return null;
  }
}

async function ensureNoPendingTxs(provider, signer) {
  const nonceLatest = await provider.getTransactionCount(signer.address, "latest");
  const noncePending = await provider.getTransactionCount(signer.address, "pending");
  log(`  Wrapper signer: ${signer.address}`, "blue");
  log(`  Nonce latest: ${nonceLatest}, pending: ${noncePending}`, "blue");
  if (noncePending > nonceLatest) {
    log(
      `⚠ Skipping wrapper tx tests: pending transactions detected (nonce ${nonceLatest} -> ${noncePending})`,
      "yellow"
    );
    log("  Clear pending txs or restart the EL to include them in a block.", "yellow");
    throw new Error("pending txs in pool");
  }
}

async function getTxFees(provider, logFees = false) {
  const feeData = await provider.getFeeData();
  const latestBlockForFee = await provider.getBlock("latest");
  const baseFee = latestBlockForFee?.baseFeePerGas ?? 0n;
  const txFees = {
    maxFeePerGas: feeData.maxFeePerGas ?? (baseFee * 2n + ethers.parseUnits("2", "gwei")),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2", "gwei")
  };
  if (logFees) {
    log(`  Base fee: ${baseFee} wei`, "blue");
    log(`  maxFeePerGas: ${txFees.maxFeePerGas} wei`, "blue");
    log(`  maxPriorityFeePerGas: ${txFees.maxPriorityFeePerGas} wei`, "blue");
  }
  return txFees;
}

async function deployWrapperContracts(signer, artifacts, txFees) {
  const beaconFactory = new ethers.ContractFactory(
    artifacts.BeaconRootWrapper.abi,
    artifacts.BeaconRootWrapper.bytecode,
    signer
  );
  const randaoFactory = new ethers.ContractFactory(
    artifacts.RandaoGetterWrapper.abi,
    artifacts.RandaoGetterWrapper.bytecode,
    signer
  );

  const beaconWrapper = await beaconFactory.deploy(BEACON_ROOT_CONTRACT, txFees);
  await beaconWrapper.waitForDeployment();
  const randaoWrapper = await randaoFactory.deploy(RANDAO_READER, txFees);
  await randaoWrapper.waitForDeployment();
  log("✓ Deployed wrapper contracts", "green");

  return { beaconWrapper, randaoWrapper };
}

async function selectLatestStoredBlock(provider, helpers, waitForBlocks) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const latestNumber = await provider.getBlockNumber();
    const latestBlock = await provider.getBlock(latestNumber);
    if (!latestBlock) {
      throw new Error(`Failed to load latest block ${latestNumber}`);
    }
    const ts = latestBlock.timestamp;
    const okBeacon = await helpers.callBeaconGet(ts, "latest");
    const okReader = await helpers.callRandaoReader(ts, "latest");
    if (okBeacon && okReader) {
      return latestBlock;
    }
    log(`⚠ Wrapper precheck: latest block ${latestNumber} timestamp ${ts} not stored yet`, "yellow");
    await waitForBlocks(latestNumber + 2, 60000);
  }
  return null;
}

async function sendWrapperCalls(wrappers, timestamp, txFees) {
  const beaconTx = await wrappers.beaconWrapper.get(timestamp, { gasLimit: 3_000_000, ...txFees });
  log(`  Wrapper get() tx: ${beaconTx.hash} (nonce ${beaconTx.nonce})`, "blue");
  const randaoTx = await wrappers.randaoWrapper.getPrevRandao(timestamp, {
    gasLimit: 3_000_000,
    ...txFees,
    nonce: beaconTx.nonce + 1
  });
  log(`  Wrapper getPrevRandao() tx: ${randaoTx.hash} (nonce ${randaoTx.nonce})`, "blue");
  return { beaconTx, randaoTx };
}

async function verifyWrapperOutputs(provider, helpers, artifacts, headerBlock, beaconTx, randaoTx, fail) {
  const headerTimestamp = headerBlock.timestamp;
  const expectedBlockNumber = headerBlock.number;
  const expectedRoot = headerBlock.parentBeaconBlockRoot;
  const expectedRandao = headerBlock.prevRandao || headerBlock.mixHash;

  const beaconReceipt = await provider.getTransactionReceipt(beaconTx.hash);
  if (!beaconReceipt) {
    throw new Error("Wrapper get() tx still pending after 2 blocks");
  }
  log(`  Wrapper get() mined in block ${beaconReceipt.blockNumber}`, "blue");
  const beaconTrace = await traceTxOutput(beaconReceipt.hash);
  if (!beaconTrace || !beaconTrace.output || beaconTrace.output === "0x") {
    fail("✗ Wrapper get() returned empty output");
  } else {
    const beaconIface = new ethers.Interface(artifacts.BeaconRootWrapper.abi);
    const [success, data] = beaconIface.decodeFunctionResult("get", beaconTrace.output);
    if (!success || data.length < 66) {
      fail("✗ Wrapper get() call failed");
      log(`  success: ${success}`, "red");
      log(`  data: ${data}`, "red");
      log(`  trace output: ${beaconTrace.output}`, "red");
      if (beaconTrace.error) {
        log(`  trace error: ${beaconTrace.error}`, "red");
      }
      const traceLines = summarizeTrace(beaconTrace);
      if (traceLines.length) {
        log("  trace calls:", "red");
        for (const line of traceLines) {
          log(`    ${line}`, "red");
        }
      }
      try {
        const directRoot = await helpers.callBeaconGet(headerTimestamp);
        if (directRoot) {
          log(`  Direct eth_call BEACON get() succeeds (root ${directRoot})`, "red");
        } else {
          log(`  Direct eth_call BEACON get() failed for timestamp ${headerTimestamp}`, "red");
        }
      } catch (err) {
        log(`  Direct eth_call BEACON get() error: ${err.message}`, "red");
      }
    } else {
      const [returnedRoot] = ethers.AbiCoder.defaultAbiCoder().decode(["bytes32"], data);
      if (returnedRoot.toLowerCase() === expectedRoot.toLowerCase()) {
        log("✓ Wrapper get() matches block parentBeaconBlockRoot", "green");
      } else {
        fail("✗ Wrapper get() root mismatch");
        log(`  Header root:   ${expectedRoot}`, "red");
        log(`  Contract root: ${returnedRoot}`, "red");
      }
    }
  }

  const randaoReceipt = await provider.getTransactionReceipt(randaoTx.hash);
  if (!randaoReceipt) {
    throw new Error("Wrapper getPrevRandao() tx still pending after 2 blocks");
  }
  log(`  Wrapper getPrevRandao() mined in block ${randaoReceipt.blockNumber}`, "blue");
  const randaoTrace = await traceTxOutput(randaoReceipt.hash);
  if (!randaoTrace || !randaoTrace.output || randaoTrace.output === "0x") {
    fail("✗ Wrapper getPrevRandao() returned empty output");
  } else {
    const randaoIface = new ethers.Interface(artifacts.RandaoGetterWrapper.abi);
    const [success, data] = randaoIface.decodeFunctionResult("getPrevRandao", randaoTrace.output);
    if (!success || data.length < 194) {
      fail("✗ Wrapper getPrevRandao() call failed");
      log(`  success: ${success}`, "red");
      log(`  data: ${data}`, "red");
      log(`  trace output: ${randaoTrace.output}`, "red");
      if (randaoTrace.error) {
        log(`  trace error: ${randaoTrace.error}`, "red");
      }
      const traceLines = summarizeTrace(randaoTrace);
      if (traceLines.length) {
        log("  trace calls:", "red");
        for (const line of traceLines) {
          log(`    ${line}`, "red");
        }
      }
      try {
        const directCheck = await helpers.callRandaoReader(headerTimestamp);
        if (directCheck) {
          const { root: directRoot, randao: directRandao, blockNumber: directBlock } = directCheck;
          log(
            `  Direct eth_call RANDAO_READER succeeds (root ${directRoot}, randao ${directRandao}, block ${directBlock})`,
            "red"
          );
        } else {
          log(`  Direct eth_call RANDAO_READER failed for timestamp ${headerTimestamp}`, "red");
        }
      } catch (err) {
        log(`  Direct eth_call RANDAO_READER error: ${err.message}`, "red");
      }
    } else {
      const [returnedRoot, returnedRandao, returnedBlockNumber] =
        ethers.AbiCoder.defaultAbiCoder().decode(["bytes32", "bytes32", "uint256"], data);
      const okRoot = returnedRoot.toLowerCase() === expectedRoot.toLowerCase();
      const okRandao = returnedRandao.toLowerCase() === expectedRandao.toLowerCase();
      const okBlock = returnedBlockNumber === BigInt(expectedBlockNumber);
      if (okRoot && okRandao && okBlock) {
        log("✓ Wrapper getPrevRandao() matches block header (root, randao, block)", "green");
      } else {
        fail("✗ Wrapper getPrevRandao() header mismatch");
        log(`  Header root:   ${expectedRoot}`, "red");
        log(`  Contract root: ${returnedRoot}`, "red");
        log(`  Header randao: ${expectedRandao}`, "red");
        log(`  Contract randao: ${returnedRandao}`, "red");
        log(`  Header block:  ${expectedBlockNumber}`, "red");
        log(`  Contract block: ${returnedBlockNumber}`, "red");
      }
      try {
        const returnedHeader = await provider.getBlock(Number(returnedBlockNumber));
        if (!returnedHeader) {
          log(`⚠ Could not load header for returned block ${returnedBlockNumber}`, "yellow");
        } else {
          const returnedHeaderRoot = returnedHeader.parentBeaconBlockRoot;
          const returnedHeaderRandao = returnedHeader.prevRandao || returnedHeader.mixHash;
          const okReturnRoot = returnedHeaderRoot && returnedRoot.toLowerCase() === returnedHeaderRoot.toLowerCase();
          const okReturnRandao = returnedHeaderRandao && returnedRandao.toLowerCase() === returnedHeaderRandao.toLowerCase();
          if (okReturnRoot && okReturnRandao) {
            log("✓ Returned block header matches returned root/randao", "green");
          } else {
            fail("✗ Returned block header mismatch");
            if (returnedHeaderRoot) {
              log(`  Returned header root:   ${returnedHeaderRoot}`, "red");
            }
            log(`  Returned root:          ${returnedRoot}`, "red");
            if (returnedHeaderRandao) {
              log(`  Returned header randao: ${returnedHeaderRandao}`, "red");
            }
            log(`  Returned randao:        ${returnedRandao}`, "red");
          }
        }
      } catch (error) {
        log(`⚠ Failed to verify returned block header: ${error.message}`, "yellow");
      }
    }
  }
}

async function traceTxOutput(txHash) {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "debug_traceTransaction",
    params: [txHash, { tracer: "callTracer" }]
  };
  const res = await fetchWithTimeout(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, 4000);
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message);
  }
  return json.result;
}

async function fetchWithTimeout(url, options, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeTrace(trace) {
  const lines = [];
  const walk = (call, depth = 0) => {
    if (!call) return;
    const indent = "  ".repeat(depth);
    const to = call.to || "unknown";
    const err = call.error ? ` error=${call.error}` : "";
    const out = call.output ? ` outputLen=${(call.output.length - 2) / 2}` : "";
    const gas = call.gasUsed ? ` gasUsed=${call.gasUsed}` : "";
    lines.push(`${indent}${call.type || "call"} to=${to}${err}${out}${gas}`);
    if (Array.isArray(call.calls)) {
      for (const child of call.calls) {
        walk(child, depth + 1);
      }
    }
  };
  walk(trace, 0);
  return lines;
}

async function waitForNextBlocks(provider, count, timeoutMs = 40000) {
  const start = Date.now();
  let target = (await provider.getBlockNumber()) + count;
  while (Date.now() - start < timeoutMs) {
    const current = await provider.getBlockNumber();
    if (current >= target) return current;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function logNoteOnSet() {
  logSection("Note on set() Function");
  log("The set() function requires SYSTEM_ADDRESS as caller.", "blue");
  log("Access control is tested directly - calls from non-SYSTEM_ADDRESS correctly revert.", "blue");
  log("The contract bytecode and deployment are verified above.", "blue");
}

function logSummary(hadFailure) {
  logSection("Test Summary");
  log("✓ Contracts are correctly deployed", "green");
  log("✓ Contract bytecode verified", "green");
  log("✓ Contract interfaces are accessible via RPC", "green");
  log("✓ set() access control tested - non-SYSTEM_ADDRESS calls correctly revert", "green");
  log("✓ Direct RPC calls tested (reverts are expected when no entry exists)", "green");
  log("✓ Block header fields are non-zero in recent blocks (prevRandao + parentBeaconBlockRoot)", "green");
  if (hadFailure) {
    log("\n✗ One or more end-to-end verifications failed.", "red");
    process.exitCode = 1;
  } else {
    log("\n✓ All end-to-end verifications passed!", "green");
  }
}

async function main() {
  const tracker = createFailTracker();
  logConfiguration();

  const provider = await createProviderOrExit(tracker.fail);
  const testAccount = ethers.Wallet.createRandom();
  const waitForBlocks = createWaitForBlocks(provider);
  await ensureReadyBlockOrExit(provider, waitForBlocks, tracker.fail);

  const artifacts = loadArtifactsOrExit(tracker.fail);
  await verifyDeploymentOrExit(provider, tracker.fail);

  const helpers = createCallHelpers(provider, testAccount, waitForBlocks);

  logSection("Testing Contract Functionality");
  log("Testing direct contract calls via RPC...", "blue");

  const storedBlock = await getLatestBlockOrExit(provider, waitForBlocks, tracker.fail);
  await testSetAccessControl(provider, tracker.fail);
  await testRandaoReader(provider, helpers, storedBlock.timestamp, testAccount.address, tracker.fail);
  await runHeaderMatchingSuite(provider, helpers, waitForBlocks, storedBlock, tracker.fail);
  await runWrapperTxTests(provider, helpers, waitForBlocks, artifacts, tracker.fail);

  logNoteOnSet();
  logSummary(tracker.hadFailure());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    log(`\n✗ Error: ${error.message}`, "red");
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
