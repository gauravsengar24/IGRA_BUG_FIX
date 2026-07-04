const crypto = require('crypto');

function truncateForLogging(obj, maxLength = 500) {
  const str = JSON.stringify(obj, null, 2);
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + '... [truncated]';
}

function isZeroHash(value) {
  return typeof value === 'string' && /^0x0{64}$/i.test(value);
}

function randomNonZeroHash() {
  let value;
  do {
    value = '0x' + crypto.randomBytes(32).toString('hex');
  } while (isZeroHash(value));
  return value;
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (payload.executionPayload) {
    const ep = payload.executionPayload;
    const summary = {
      ...payload,
      executionPayload: {}
    };
    Object.keys(ep).forEach((key) => {
      if (key === 'transactions' || key === 'withdrawals') {
        summary.executionPayload[key] = Array.isArray(ep[key]) ? ep[key] : [];
      } else {
        summary.executionPayload[key] = ep[key];
      }
    });
    return summary;
  }

  if (payload.blockNumber || payload.blockHash) {
    const summary = {};
    Object.keys(payload).forEach((key) => {
      if (key === 'transactions' || key === 'withdrawals') {
        summary[key] = Array.isArray(payload[key]) ? payload[key] : [];
      } else {
        summary[key] = payload[key];
      }
    });
    return summary;
  }

  return payload;
}

module.exports = {
  truncateForLogging,
  isZeroHash,
  randomNonZeroHash,
  summarizePayload,
};
