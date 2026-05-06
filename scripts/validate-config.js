import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../metani-network.config.json', import.meta.url), 'utf8'));

if (config.chainId !== 1229800785) {
  throw new Error(`Invalid chainId: ${config.chainId}`);
}

for (const endpoint of [...config.rpcUrls, ...config.restUrls]) {
  if (endpoint.includes('cloudrun.app') || endpoint.includes('a.run.app')) {
    throw new Error(`Legacy Cloud Run endpoint is not allowed: ${endpoint}`);
  }
}

console.log('metani-network.config.json is valid');
