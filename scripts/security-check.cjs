const fs = require('fs');
const path = require('path');

const banned = [
  /privateKey\s*[:=]/i,
  /mnemonic\s*[:=]/i,
  /localStorage\.setItem\([^)]*(private|mnemonic|seed|secret)/i,
  /itani-network-chain-kirdnwz4rq-uc\.a\.run\.app/i,
  /itani-network-chain-1009642477948\.us-central1\.run\.app/i,
];
const ignored = new Set(['.git', 'node_modules']);

function walk(dir) {
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    if (entry.isFile() && /\.(js|jsx|ts|tsx|json|md|env|html)$/i.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const pattern of banned) {
        if (pattern.test(text)) throw new Error(`security check failed in ${full}: ${pattern}`);
      }
    }
  }
}

walk(path.join(__dirname, '..'));
console.log('security check passed');
