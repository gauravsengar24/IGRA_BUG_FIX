const http = require('http');
const { log } = require('./logger');

function createHttpServer(port) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/eth/v1/node/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ready' }));
      return;
    }

    if (req.url === '/eth/v1/node/syncing' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: {
          is_syncing: false,
          sync_distance: '0',
          el_offline: false
        }
      }));
      return;
    }

    if (req.url === '/eth/v1/beacon/genesis' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: {
          genesis_time: '0',
          genesis_validators_root: '0x0000000000000000000000000000000000000000000000000000000000000000',
          genesis_fork_version: '0x00000000'
        }
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    log(`CL HTTP API server listening on port ${port}`, 'green');
  });

  return server;
}

module.exports = { createHttpServer };
