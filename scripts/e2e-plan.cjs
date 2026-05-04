const steps = [
  'connect external wallet signer',
  'verify chainId 1229800785',
  'fetch RPC health and eth_chainId',
  'fetch balance',
  'prepare signed transaction with external signer',
  'submit transaction on testnet only',
  'verify receipt/history',
  'verify staking disabled until contract/API configured',
];

console.log('Required E2E plan:');
steps.forEach((step, index) => console.log(`${index + 1}. ${step}`));
