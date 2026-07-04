const fs = require('fs');
const crypto = require('crypto');
const { log } = require('./logger');

class JWTManager {
  constructor(secretPath) {
    this.secretPath = secretPath;
    this.secret = null;
    this.token = null;
    this.tokenIat = null;
  }

  loadSecret() {
    try {
      const secretHex = fs.readFileSync(this.secretPath, 'utf8').trim();
      this.secret = Buffer.from(secretHex, 'hex');
      log(`Loaded JWT secret from ${this.secretPath}`, 'green');
      this.generateToken();
      return true;
    } catch (error) {
      log(`Failed to load JWT secret: ${error.message}`, 'red');
      return false;
    }
  }

  generateToken() {
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now,
      exp: now + 3600
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    this.token = `${encodedHeader}.${encodedPayload}.${signature}`;
    this.tokenIat = now;
  }

  getToken() {
    const now = Math.floor(Date.now() / 1000);

    if (!this.token || !this.tokenIat) {
      this.generateToken();
      return this.token;
    }

    const payload = JSON.parse(Buffer.from(this.token.split('.')[1], 'base64url').toString());
    if (payload.exp < now) {
      this.generateToken();
      return this.token;
    }

    const age = now - this.tokenIat;
    if (age > 50) {
      this.generateToken();
    }

    return this.token;
  }
}

module.exports = { JWTManager };
