const CONFIG = {
  EL_ENGINE_API_URL: process.env.EL_ENGINE_API_URL || 'http://reth-el:8551',
  EL_RPC_URL: process.env.EL_RPC_URL || 'http://reth-el:8545',
  CL_HTTP_PORT: parseInt(process.env.CL_HTTP_PORT || '5052', 10),
  JWT_SECRET_PATH: process.env.JWT_SECRET_PATH || '/jwt-secret/jwt.hex',
  BLOCK_INTERVAL: parseInt(process.env.BLOCK_INTERVAL || '12', 10),
  FEE_RECIPIENT: process.env.FEE_RECIPIENT || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  INCLUDE_PARENT_BEACON_BLOCK_ROOT: (process.env.INCLUDE_PARENT_BEACON_BLOCK_ROOT || 'auto').toLowerCase(),
};

module.exports = { CONFIG };
