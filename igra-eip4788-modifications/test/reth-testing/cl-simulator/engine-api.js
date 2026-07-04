const http = require('http');
const https = require('https');
const { URL } = require('url');
const { CONFIG } = require('./config');
const { log } = require('./logger');
const { truncateForLogging, summarizePayload } = require('./utils');

class EngineAPIClient {
  constructor(url, jwtManager) {
    this.url = url;
    this.jwtManager = jwtManager;
    this.requestId = 1;
    this.capabilities = null;
  }

  async call(method, params = []) {
    const url = new URL(this.url);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    let paramsForLogging = params;
    if (params.length > 0 && params[0] && typeof params[0] === 'object') {
      if (method.includes('newPayload') || method.includes('getPayload')) {
        paramsForLogging = [summarizePayload(params[0])];
      } else if (method.includes('forkchoiceUpdated')) {
        paramsForLogging = params.map((p, idx) => {
          if (p && typeof p === 'object') {
            if (idx === 0 && (p.headBlockHash || p.safeBlockHash || p.finalizedBlockHash)) {
              return { forkchoiceState: p };
            }
            if (idx === 1 && (p.timestamp || p.prevRandao)) {
              return { payloadAttributes: p };
            }
          }
          return p;
        });
      }
    }

    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        Authorization: `Bearer ${this.jwtManager.getToken()}`
      }
    };

    log(`[ENGINE API REQUEST] ${method}`, 'blue');
    log(`  Params: ${truncateForLogging(paramsForLogging)}`, 'blue');

    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              const errorMsg = json.error.message || JSON.stringify(json.error);
              const errorCode = json.error.code ? ` (code: ${json.error.code})` : '';
              const errorData = json.error.data ? ` data: ${JSON.stringify(json.error.data)}` : '';
              log(`[ENGINE API ERROR] ${method}`, 'red');
              log(`  Error: ${errorMsg}${errorCode}${errorData}`, 'red');
              reject(new Error(`${errorMsg}${errorCode}${errorData}`));
            } else {
              let resultForLogging = json.result;
              if (json.result && typeof json.result === 'object') {
                if (method.includes('getPayload')) {
                  resultForLogging = summarizePayload(json.result);
                } else if (method.includes('forkchoiceUpdated')) {
                  resultForLogging = json.result;
                } else if (method.includes('newPayload')) {
                  resultForLogging = json.result;
                }
              }

              log(`[ENGINE API RESPONSE] ${method}`, 'green');
              log(`  Result: ${truncateForLogging(resultForLogging)}`, 'green');

              resolve(json.result);
            }
          } catch (error) {
            log(`[ENGINE API PARSE ERROR] ${method}`, 'red');
            log(`  Error: ${error.message}`, 'red');
            log(`  Raw response: ${data.substring(0, 500)}...`, 'red');
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        log(`[ENGINE API REQUEST ERROR] ${method}`, 'red');
        log(`  Error: ${error.message}`, 'red');
        reject(error);
      });

      req.write(requestBody);
      req.end();
    });
  }

  async getBlockByNumber(blockNumber = 'latest') {
    const url = new URL(CONFIG.EL_RPC_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: [blockNumber, false],
      id: 1
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              const errorMsg = json.error.message || JSON.stringify(json.error);
              const errorCode = json.error.code ? ` (code: ${json.error.code})` : '';
              const errorData = json.error.data ? ` data: ${JSON.stringify(json.error.data)}` : '';
              reject(new Error(`${errorMsg}${errorCode}${errorData}`));
            } else {
              resolve(json.result);
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(requestBody);
      req.end();
    });
  }

  async exchangeCapabilities() {
    const clCapabilities = [
      'engine_forkchoiceUpdatedV1',
      'engine_forkchoiceUpdatedV2',
      'engine_forkchoiceUpdatedV3',
      'engine_newPayloadV1',
      'engine_newPayloadV2',
      'engine_newPayloadV3',
      'engine_newPayloadV4',
      'engine_getPayloadV1',
      'engine_getPayloadV2',
      'engine_getPayloadV3',
      'engine_getPayloadV4'
    ];
    try {
      const elCapabilities = await this.call('engine_exchangeCapabilities', [clCapabilities]);
      return elCapabilities || [];
    } catch (error) {
      console.warn(`[WARN] engine_exchangeCapabilities not supported: ${error.message}`);
      return [];
    }
  }

  async forkchoiceUpdated(headBlockHash, safeBlockHash, finalizedBlockHash, timestamp, prevRandao, parentBeaconBlockRoot = null) {
    const timestampHex = typeof timestamp === 'string' && timestamp.startsWith('0x')
      ? timestamp
      : `0x${timestamp.toString(16)}`;

    if (!finalizedBlockHash) {
      throw new Error('finalizedBlockHash is required for engine_forkchoiceUpdatedV3');
    }

    const payloadAttributes = {
      timestamp: timestampHex,
      prevRandao: prevRandao,
      suggestedFeeRecipient: CONFIG.FEE_RECIPIENT
    };

    const beaconRoot = parentBeaconBlockRoot !== null
      ? parentBeaconBlockRoot
      : '0x0000000000000000000000000000000000000000000000000000000000000000';

    const baseV3Attributes = {
      timestamp: payloadAttributes.timestamp,
      prevRandao: payloadAttributes.prevRandao,
      suggestedFeeRecipient: payloadAttributes.suggestedFeeRecipient,
      withdrawals: [],
    };

    const forkchoiceState = {
      headBlockHash: headBlockHash,
      safeBlockHash: safeBlockHash,
      finalizedBlockHash: finalizedBlockHash
    };

    const includeBeaconRoot = CONFIG.INCLUDE_PARENT_BEACON_BLOCK_ROOT;
    const shouldInclude =
      includeBeaconRoot === 'true' || (includeBeaconRoot === 'auto' && parentBeaconBlockRoot !== null);

    const tryForkchoice = async (withBeaconRoot) => {
      const v3Attributes = withBeaconRoot
        ? { ...baseV3Attributes, parentBeaconBlockRoot: beaconRoot }
        : { ...baseV3Attributes };
      return this.call('engine_forkchoiceUpdatedV3', [forkchoiceState, v3Attributes]);
    };

    try {
      return await tryForkchoice(shouldInclude);
    } catch (error) {
      const message = (error && error.message) ? error.message : '';
      const looksLikeBeaconRootIssue =
        message.includes('parent beacon block root') ||
        message.includes('parentBeaconBlockRoot') ||
        message.includes('Invalid payload attributes');
      if (shouldInclude && looksLikeBeaconRootIssue) {
        log('Retrying forkchoiceUpdatedV3 without parentBeaconBlockRoot due to EL rejection', 'yellow');
        return await tryForkchoice(false);
      }
      throw error;
    }
  }

  async forkchoiceUpdatedNoAttributes(headBlockHash, safeBlockHash, finalizedBlockHash) {
    return this.call('engine_forkchoiceUpdatedV3', [
      {
        headBlockHash: headBlockHash,
        safeBlockHash: safeBlockHash,
        finalizedBlockHash: finalizedBlockHash
      }
    ]);
  }

  async newPayload(payload, parentBeaconBlockRoot = null) {
    const shouldTryV4 = !this.capabilities || this.capabilities.includes('engine_newPayloadV4');
    if (shouldTryV4) {
      try {
        const expectedBlobVersionedHashes = [];
        const beaconRoot = parentBeaconBlockRoot || '0x0000000000000000000000000000000000000000000000000000000000000000';
        const executionRequests = [];
        return this.call('engine_newPayloadV4', [payload, expectedBlobVersionedHashes, beaconRoot, executionRequests]);
      } catch (error) {
        log(`Warning: engine_newPayloadV4 failed, falling back to V3: ${error.message}`, 'yellow');
      }
    }
    const expectedBlobVersionedHashes = [];
    const beaconRoot = parentBeaconBlockRoot || '0x0000000000000000000000000000000000000000000000000000000000000000';
    return this.call('engine_newPayloadV3', [payload, expectedBlobVersionedHashes, beaconRoot]);
  }

  async getPayload(payloadId) {
    const shouldTryV4 = !this.capabilities || this.capabilities.includes('engine_getPayloadV4');
    if (shouldTryV4) {
      try {
        return await this.call('engine_getPayloadV4', [payloadId]);
      } catch (error1) {
        try {
          return await this.call('engine_getPayloadV4', [payloadId, 4]);
        } catch (error2) {
          try {
            return await this.call('engine_getPayloadV4', [payloadId, '0x04']);
          } catch (error3) {
            return await this.call('engine_getPayloadV3', [payloadId]);
          }
        }
      }
    }
    try {
      return await this.call('engine_getPayloadV3', [payloadId]);
    } catch (error1) {
      try {
        return await this.call('engine_getPayloadV3', [payloadId, 3]);
      } catch (error2) {
        return await this.call('engine_getPayloadV3', [payloadId, '0x03']);
      }
    }
  }
}

module.exports = { EngineAPIClient };
