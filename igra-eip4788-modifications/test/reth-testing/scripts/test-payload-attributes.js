#!/usr/bin/env node
/**
 * Test script to verify payload attributes format for Cancun blocks
 * Tests different payload attribute formats to see what reth accepts
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const JWT_SECRET_PATH = process.env.JWT_SECRET_PATH || 'config/jwt-secret/jwt.hex';
const EL_ENGINE_API_URL = process.env.EL_ENGINE_API_URL || 'http://localhost:8551';

// Simple JWT token generation (matching cl-simulator/main.js)
function generateJWT(secretHex) {
  const secret = Buffer.from(secretHex.trim(), 'hex');
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  const payload = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function callEngineAPI(method, params, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(EL_ENGINE_API_URL);
    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: 1
    });

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (!data) {
            reject(new Error('Empty response'));
            return;
          }
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          console.error(`Failed to parse response: ${data.substring(0, 200)}`);
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

async function testPayloadAttributes() {
  console.log('Testing payload attributes format for Cancun blocks...\n');

  // Load JWT secret
  const jwtSecret = fs.readFileSync(JWT_SECRET_PATH, 'utf8');
  const token = generateJWT(jwtSecret);

  // Get genesis block hash
  const genesisBlock = await callEngineAPI('eth_getBlockByNumber', ['0x0', false], token);
  const genesisHash = genesisBlock.result.hash;
  console.log(`Genesis block hash: ${genesisHash}\n`);

  // Test cases
  const testCases = [
    {
      name: 'Test 1: V3 with parentBeaconBlockRoot',
      method: 'engine_forkchoiceUpdatedV3',
      payloadAttributes: {
        timestamp: '0x1000',
        prevRandao: '0x' + crypto.randomBytes(32).toString('hex'),
        suggestedFeeRecipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        parentBeaconBlockRoot: '0x0000000000000000000000000000000000000000000000000000000000000000'
      }
    },
    {
      name: 'Test 1b: V3 with parentBeaconBlockRoot (smaller timestamp)',
      method: 'engine_forkchoiceUpdatedV3',
      payloadAttributes: {
        timestamp: '0xc',
        prevRandao: '0x' + crypto.randomBytes(32).toString('hex'),
        suggestedFeeRecipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        parentBeaconBlockRoot: '0x0000000000000000000000000000000000000000000000000000000000000000'
      }
    },
    {
      name: 'Test 2: V3 without parentBeaconBlockRoot',
      method: 'engine_forkchoiceUpdatedV3',
      payloadAttributes: {
        timestamp: '0x1000',
        prevRandao: '0x' + crypto.randomBytes(32).toString('hex'),
        suggestedFeeRecipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log(`Method: ${testCase.method || 'engine_forkchoiceUpdatedV1'}`);
    console.log(`Payload attributes:`, JSON.stringify(testCase.payloadAttributes, null, 2));
    
    try {
      const method = testCase.method || 'engine_forkchoiceUpdatedV1';
      const result = await callEngineAPI(method, [
        {
          headBlockHash: genesisHash,
          safeBlockHash: genesisHash,
          finalizedBlockHash: genesisHash
        },
        testCase.payloadAttributes
      ], token);

      if (result.error) {
        console.log(`❌ Error: ${result.error.message} (code: ${result.error.code})`);
        if (result.error.data) {
          console.log(`   Data: ${JSON.stringify(result.error.data)}`);
        }
      } else {
        console.log(`✅ Success!`);
        console.log(`   Payload status: ${result.result?.payloadStatus?.status || 'N/A'}`);
        if (result.result?.payloadId) {
          console.log(`   Payload ID: ${result.result.payloadId}`);
        }
      }
    } catch (error) {
      console.log(`❌ Exception: ${error.message}`);
    }
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

testPayloadAttributes().catch(console.error);
