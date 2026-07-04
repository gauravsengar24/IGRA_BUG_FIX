#!/usr/bin/env node
/**
 * Check which Engine API methods are supported by reth
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const JWT_SECRET_PATH = process.env.JWT_SECRET_PATH || 'config/jwt-secret/jwt.hex';
const EL_ENGINE_API_URL = process.env.EL_ENGINE_API_URL || 'http://localhost:8551';

function generateJWT(secretHex) {
  const secret = Buffer.from(secretHex.trim(), 'hex');
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  const payload = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
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
      params: params || [],
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
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

async function checkMethods() {
  console.log('Checking Engine API methods...\n');

  const jwtSecret = fs.readFileSync(JWT_SECRET_PATH, 'utf8');
  const token = generateJWT(jwtSecret);

  const methods = [
    'engine_forkchoiceUpdatedV1',
    'engine_forkchoiceUpdatedV2',
    'engine_forkchoiceUpdatedV3',
    'engine_newPayloadV1',
    'engine_newPayloadV2',
    'engine_newPayloadV3',
    'engine_getPayloadV1',
    'engine_getPayloadV2',
    'engine_getPayloadV3'
  ];

  for (const method of methods) {
    try {
      // Try calling with minimal params to see if method exists
      const result = await callEngineAPI(method, [null, null], token);
      if (result.error) {
        if (result.error.code === -32601) {
          console.log(`❌ ${method}: Method not found`);
        } else {
          console.log(`⚠️  ${method}: ${result.error.message} (code: ${result.error.code})`);
        }
      } else {
        console.log(`✅ ${method}: Available`);
      }
    } catch (error) {
      console.log(`❌ ${method}: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

checkMethods().catch(console.error);
