const crypto = require('crypto');
const { CONFIG } = require('./config');
const { log } = require('./logger');
const { isZeroHash, randomNonZeroHash } = require('./utils');
const { JWTManager } = require('./jwt');
const { EngineAPIClient } = require('./engine-api');
const { createHttpServer } = require('./http-server');

class CLSimulator {
  constructor() {
    this.jwtManager = new JWTManager(CONFIG.JWT_SECRET_PATH);
    this.engineAPI = null;
    this.isRunning = false;
    this.blockCreationInterval = null;
    this.currentHeadHash = null;
    this.currentSafeHash = null;
    this.currentFinalizedHash = null;
    this.genesisBlockHash = null;
    this.currentBeaconRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
    this.lastProposedTimestamp = null;
    this.isCreatingBlock = false;
  }

  async initialize() {
    log('Initializing CL Simulator...', 'blue');

    if (!this.jwtManager.loadSecret()) {
      throw new Error('Failed to load JWT secret');
    }

    this.engineAPI = new EngineAPIClient(CONFIG.EL_ENGINE_API_URL, this.jwtManager);

    try {
      const capabilities = await this.engineAPI.exchangeCapabilities();
      this.engineAPI.capabilities = capabilities;
      log(
        `Engine API capabilities: ${capabilities.length > 0 ? capabilities.join(', ') : 'none (will use fallback)'}`,
        'blue'
      );
      if (capabilities.length === 0) {
        log('Warning: engine_exchangeCapabilities not supported or returned empty, will try API versions directly', 'yellow');
      }
    } catch (error) {
      log(`Warning: Failed to exchange capabilities: ${error.message}`, 'yellow');
      log('Will try API versions directly', 'yellow');
    }

    try {
      const genesisBlock = await this.engineAPI.getBlockByNumber('0x0');
      if (genesisBlock) {
        this.currentHeadHash = genesisBlock.hash;
        this.currentSafeHash = genesisBlock.hash;
        this.currentFinalizedHash = genesisBlock.hash;
        this.genesisBlockHash = genesisBlock.hash;
        if (genesisBlock.parentBeaconBlockRoot) {
          this.currentBeaconRoot = genesisBlock.parentBeaconBlockRoot;
        }
        log(`Initialized with genesis block: ${genesisBlock.hash}`, 'green');
        log(`Initial beacon root: ${this.currentBeaconRoot}`, 'green');
      }
    } catch (error) {
      log(`Warning: Could not get genesis block: ${error.message}`, 'yellow');
      log('Will try to initialize on first block creation', 'yellow');
    }

    log('CL Simulator initialized', 'green');
  }

  async createBlock() {
    if (this.isCreatingBlock) {
      log('Skipping block creation: previous createBlock still in progress', 'yellow');
      return;
    }
    this.isCreatingBlock = true;

    try {
      const currentBlock = await this.engineAPI.getBlockByNumber('latest');
      if (!currentBlock) {
        log('No current block found, skipping', 'yellow');
        return;
      }

      const currentBlockNumber = parseInt(currentBlock.number, 16);
      const nextBlockNumber = currentBlockNumber + 1;
      const currentTimestamp = parseInt(currentBlock.timestamp, 16);

      let nextTimestamp;
      if (currentTimestamp === 0) {
        if (this.lastProposedTimestamp !== null) {
          nextTimestamp = this.lastProposedTimestamp + CONFIG.BLOCK_INTERVAL;
        } else {
          nextTimestamp = Math.floor(Date.now() / 1000);
        }
      } else {
        nextTimestamp = currentTimestamp + CONFIG.BLOCK_INTERVAL;
      }
      if (this.lastProposedTimestamp !== null) {
        const minNext = this.lastProposedTimestamp + 1;
        if (nextTimestamp < minNext) {
          log(`Adjusting next timestamp from ${nextTimestamp} to ${minNext} to keep monotonicity`, 'yellow');
          nextTimestamp = minNext;
        }
      }
      this.lastProposedTimestamp = nextTimestamp;

      const prevRandao = randomNonZeroHash();

      let parentBeaconBlockRoot;
      if (nextBlockNumber === 1) {
        if (currentBlock.parentBeaconBlockRoot && !isZeroHash(currentBlock.parentBeaconBlockRoot)) {
          parentBeaconBlockRoot = currentBlock.parentBeaconBlockRoot;
          log(`Using genesis parentBeaconBlockRoot for block 1: ${parentBeaconBlockRoot}`, 'blue');
        } else {
          parentBeaconBlockRoot = randomNonZeroHash();
          log(`Genesis parentBeaconBlockRoot is missing/zero; generated non-zero value for block 1: ${parentBeaconBlockRoot}`, 'yellow');
        }
      } else {
        parentBeaconBlockRoot = randomNonZeroHash();
        log(`Generated random parentBeaconBlockRoot for block ${nextBlockNumber}: ${parentBeaconBlockRoot}`, 'blue');
      }

      log(`Creating block ${nextBlockNumber} (timestamp: ${nextTimestamp})`, 'blue');
      log(`Using parent beacon block root: ${parentBeaconBlockRoot}`, 'blue');
      log(`Payload attributes: timestamp=${`0x${nextTimestamp.toString(16)}`}, prevRandao=${prevRandao.substring(0, 20)}...`, 'blue');

      let genesisHash = this.genesisBlockHash;
      if (!genesisHash) {
        try {
          const genesisBlock = await this.engineAPI.getBlockByNumber('0x0');
          if (genesisBlock && genesisBlock.hash) {
            genesisHash = genesisBlock.hash;
            this.genesisBlockHash = genesisBlock.hash;
          } else {
            genesisHash = currentBlock.hash;
          }
        } catch (error) {
          log(`Warning: Could not get genesis block for safeBlockHash/finalizedBlockHash: ${error.message}`, 'yellow');
          genesisHash = currentBlock.hash;
        }
      }

      let forkchoiceResult;
      try {
        forkchoiceResult = await this.engineAPI.forkchoiceUpdated(
          currentBlock.hash,
          genesisHash,
          genesisHash,
          `0x${nextTimestamp.toString(16)}`,
          prevRandao,
          parentBeaconBlockRoot
        );
      } catch (error) {
        log(`Forkchoice update failed: ${error.message}`, 'red');
        throw error;
      }

      if (!forkchoiceResult || !forkchoiceResult.payloadStatus) {
        log('No payload status in forkchoice result', 'yellow');
        if (forkchoiceResult) {
          log(`Forkchoice result: ${JSON.stringify(forkchoiceResult)}`, 'yellow');
        }
        return;
      }

      const status = forkchoiceResult.payloadStatus.status;
      log(`Forkchoice update status: ${status}`, 'blue');
      if (forkchoiceResult.payloadStatus.validationError) {
        log(`Forkchoice validation error: ${forkchoiceResult.payloadStatus.validationError}`, 'yellow');
      }

      const payloadId = forkchoiceResult.payloadId || forkchoiceResult.payload_id;
      if (payloadId) {
        await this.processPayloadId(payloadId, nextBlockNumber, parentBeaconBlockRoot, genesisHash);
      } else {
        await this.handleNoPayloadId(nextBlockNumber, forkchoiceResult);
      }
    } catch (error) {
      log(`Error creating block: ${error.message}`, 'red');
    } finally {
      this.isCreatingBlock = false;
    }
  }

  async processPayloadId(payloadId, nextBlockNumber, parentBeaconBlockRoot, genesisHash) {
    try {
      log(`Got payload ID: ${payloadId}`, 'blue');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      let payloadIdParam;
      if (typeof payloadId === 'string') {
        if (payloadId.startsWith('0x')) {
          const hexPart = payloadId.slice(2);
          payloadIdParam = '0x' + hexPart.padStart(16, '0');
        } else {
          payloadIdParam = '0x' + payloadId.padStart(16, '0');
        }
      } else {
        payloadIdParam = '0x' + payloadId.toString(16).padStart(16, '0');
      }

      log(`Fetching payload with ID: ${payloadIdParam}`, 'blue');
      const payload = await this.engineAPI.getPayload(payloadIdParam);
      const executionPayload = payload.executionPayload || payload;

      if (!executionPayload) {
        throw new Error('No execution payload found in response');
      }

      executionPayload.blobGasUsed = '0x0';
      executionPayload.excessBlobGas = '0x0';

      if (!Array.isArray(executionPayload.withdrawals)) {
        executionPayload.withdrawals = [];
      }
      if (!Array.isArray(executionPayload.transactions)) {
        executionPayload.transactions = [];
      }

      const blockNumber = executionPayload.blockNumber || payload.blockNumber;
      const blockHash = executionPayload.blockHash || payload.blockHash;

      log(`Payload fetched successfully, has blockNumber: ${!!blockNumber}, has blockHash: ${!!blockHash}`, 'blue');
      log(`Payload structure: ${payload.executionPayload ? 'V4 (wrapped)' : 'V3 (direct)'}, fields: ${Object.keys(payload).join(', ')}`, 'blue');
      log(`Set blobGasUsed: ${executionPayload.blobGasUsed}, excessBlobGas: ${executionPayload.excessBlobGas}`, 'blue');

      const payloadBeaconRoot = executionPayload.parentBeaconBlockRoot || parentBeaconBlockRoot;
      const newPayloadResult = await this.engineAPI.newPayload(executionPayload, payloadBeaconRoot);
      log(`New payload status: ${newPayloadResult.status}`, 'blue');

      if (newPayloadResult.status === 'VALID' && blockHash) {
        const finalizeBeaconRoot = executionPayload.parentBeaconBlockRoot || parentBeaconBlockRoot;
        const finalizeResult = await this.engineAPI.forkchoiceUpdatedNoAttributes(
          blockHash,
          genesisHash,
          genesisHash
        );

        if (finalizeResult && finalizeResult.payloadStatus.latestValidHash) {
          this.currentHeadHash = finalizeResult.payloadStatus.latestValidHash;
          this.currentSafeHash = finalizeResult.payloadStatus.latestValidHash;
          this.currentFinalizedHash = finalizeResult.payloadStatus.latestValidHash;
          if (payload.parentBeaconBlockRoot) {
            this.currentBeaconRoot = payload.parentBeaconBlockRoot;
          } else {
            this.currentBeaconRoot = randomNonZeroHash();
          }
          log(`Block created successfully: ${finalizeResult.payloadStatus.latestValidHash}`, 'green');
          log(`Updated beacon root: ${this.currentBeaconRoot}`, 'green');
          this.currentHeadHash = blockHash;
          this.currentSafeHash = blockHash;
          this.currentFinalizedHash = blockHash;
        }
      }
    } catch (payloadError) {
      log(`Error fetching/proposing payload: ${payloadError.message}`, 'yellow');
      await this.checkForAutoBlock(nextBlockNumber);
    }
  }

  async handleNoPayloadId(nextBlockNumber, forkchoiceResult) {
    log('No payload ID returned, EL may create blocks automatically', 'blue');

    if (forkchoiceResult.payloadStatus.latestValidHash) {
      this.currentHeadHash = forkchoiceResult.payloadStatus.latestValidHash;
      this.currentSafeHash = forkchoiceResult.payloadStatus.latestValidHash;
      this.currentFinalizedHash = forkchoiceResult.payloadStatus.latestValidHash;
      log(`Forkchoice updated, latest hash: ${forkchoiceResult.payloadStatus.latestValidHash}`, 'green');
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const newBlock = await this.engineAPI.getBlockByNumber('latest');
      if (newBlock && parseInt(newBlock.number, 16) >= nextBlockNumber) {
        log(`Block ${nextBlockNumber} appears to have been created: ${newBlock.hash}`, 'green');
        this.currentHeadHash = newBlock.hash;
        this.currentSafeHash = newBlock.hash;
        this.currentFinalizedHash = newBlock.hash;
        if (newBlock.parentBeaconBlockRoot) {
          this.currentBeaconRoot = newBlock.parentBeaconBlockRoot;
        } else {
          this.currentBeaconRoot = randomNonZeroHash();
        }
      }
    } catch (error) {
      // Ignore - block might not be ready yet
    }
  }

  async checkForAutoBlock(nextBlockNumber) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const newBlock = await this.engineAPI.getBlockByNumber('latest');
      if (newBlock && parseInt(newBlock.number, 16) >= nextBlockNumber) {
        log(`Block ${nextBlockNumber} was created automatically: ${newBlock.hash}`, 'green');
        this.currentHeadHash = newBlock.hash;
        this.currentSafeHash = newBlock.hash;
        this.currentFinalizedHash = newBlock.hash;
        if (newBlock.parentBeaconBlockRoot) {
          this.currentBeaconRoot = newBlock.parentBeaconBlockRoot;
        } else {
          this.currentBeaconRoot = randomNonZeroHash();
        }
      }
    } catch (checkError) {
      // Ignore
    }
  }

  startBlockCreation() {
    if (this.blockCreationInterval) {
      return;
    }

    log(`Starting block creation (interval: ${CONFIG.BLOCK_INTERVAL}s)`, 'blue');
    this.isRunning = true;

    this.createBlock();
    this.blockCreationInterval = setInterval(() => {
      this.createBlock();
    }, CONFIG.BLOCK_INTERVAL * 1000);
  }

  stopBlockCreation() {
    if (this.blockCreationInterval) {
      clearInterval(this.blockCreationInterval);
      this.blockCreationInterval = null;
      this.isRunning = false;
      log('Stopped block creation', 'yellow');
    }
  }

  startHTTPServer() {
    return createHttpServer(CONFIG.CL_HTTP_PORT);
  }

  async start() {
    try {
      await this.initialize();
      this.startHTTPServer();
      this.startBlockCreation();
      log('CL Simulator started successfully', 'green');
    } catch (error) {
      log(`Failed to start CL Simulator: ${error.message}`, 'red');
      process.exit(1);
    }
  }

  stop() {
    log('Stopping CL Simulator...', 'yellow');
    this.stopBlockCreation();
    process.exit(0);
  }
}

module.exports = { CLSimulator };
