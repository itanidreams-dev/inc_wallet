const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'metani-network.config.json'), 'utf8'));
const deprecated = ['itani-network-chain-kirdnwz4rq-uc.a.run.app', 'itani-network-chain-1009642477948.us-central1.run.app'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const [name, network] of Object.entries({ mainnet: config.mainnet, testnet: config.testnet })) {
  assert(network.chainId === 1229800785, `${name}.chainId must be 1229800785`);
  assert(network.chainIdHex === '0x494d4551', `${name}.chainIdHex must be 0x494d4551`);
  assert(network.nativeCurrency.symbol === 'ITANI', `${name}.nativeCurrency.symbol must be ITANI`);
  for (const key of ['rpcUrls', 'restUrls', 'blockExplorerUrls']) {
    assert(Array.isArray(network[key]) && network[key].length > 0, `${name}.${key} is required`);
    for (const url of network[key]) {
      assert(url.startsWith('https://'), `${name}.${key} must use https`);
      assert(!deprecated.some((part) => url.includes(part)), `${name}.${key} contains deprecated Cloud Run endpoint`);
    }
  }
}

console.log('metani-network.config.json is valid');
