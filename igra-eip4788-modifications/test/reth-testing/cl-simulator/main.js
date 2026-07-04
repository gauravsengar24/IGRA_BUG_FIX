#!/usr/bin/env node

const { CLSimulator } = require('./simulator');
const { log } = require('./logger');

const simulator = new CLSimulator();

process.on('SIGINT', () => {
  simulator.stop();
});

process.on('SIGTERM', () => {
  simulator.stop();
});

simulator.start().catch((error) => {
  log(`Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
