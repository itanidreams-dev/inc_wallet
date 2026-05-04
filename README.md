# inc_wallet

Simple Metani/iTani wallet scaffold.

## Security posture

- No private key storage in `localStorage`.
- No mnemonic storage in frontend state.
- Wallet connection should use MetaMask, WalletConnect, Trust Wallet or another external signer.
- Staking is disabled until the iTani staking contract/API is verified and configured.
- PayPal or fiat balance logic must use server-side signed webhooks and an immutable ledger before production.

## Network

This repo consumes `metani-network.config.json`.

```bash
npm run config:validate
```

## Production gates

- RPC health stable.
- Chain ID `1229800785` verified.
- External signer flow implemented.
- No secret committed.
- Staking endpoint/contract configured through environment.
- E2E wallet -> balance -> transaction -> staking test passes.
