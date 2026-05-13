# inc_wallet

Wallet simple pour l'ecosysteme Metani / iTani Network Chain.

inc_wallet ne cree pas une identite separee. Il consomme le Metani ID central fourni par HudLife et affiche le meme wallet iTani que HudLife, ArtLinks et HudWorld.

## Fonctionnalites

- connexion avec HudLife SSO;
- reception ITANI via adresse wallet liee;
- envoi ITANI via wallet externe EVM uniquement;
- staking ITANI via `https://relay.itaninetworkchain.com/api/wallet/stake-tokens`;
- achat BTC/ITABTC au taux fixe `10 000 ITANI = 1 BTC` via JSON-RPC iTani;
- acces iTaniSwap;
- configuration reseau via `metani-network.config.json`.

## Demarrage

```bash
npm install
npm run dev
```

## Verifications

```bash
npm run config:validate
npm run security:check
npm run build
```

## Securite

- aucune cle privee utilisateur ne doit etre stockee dans le frontend;
- aucune mnemonic ne doit etre stockee dans le frontend;
- les signatures et transactions passent par MetaMask, Trust Wallet, WalletConnect ou autre signer externe;
- les endpoints Cloud Run deprecies sont interdits;
- le staking signe `stake_tokens:{address}:{amount}` via un wallet externe avant envoi au relay;
- l'achat BTC signe `buy_btc:{address}:{amountWei}:{satoshis}` puis appelle `swap_iTani_for_itabtc`;
- le retrait BTC L1 exige le bridge Bitcoin actif et une signature `btc_withdrawal:{btc_destination}:{satoshis}:{address}`;
- PayPal ou fiat balance doit passer par webhooks serveur signes et ledger immuable avant production.

<!-- ITANI_PRODUCTION_SYNC_START -->

## iTani Production Sync

Last synchronized: 2026-05-13

This app is tracked by the iTani production registry in iTani-Network-Chain-mainnet/deployment/apps.json.
The current mainnet repository-side production gates are complete: 
pm run ops:preflight passes and production:signoff reports 100% (12/12).

Source of truth: https://github.com/itanidreams-dev/iTani-Network-Chain-mainnet/blob/main/PRODUCTION_100_SIGNOFF.md

External public-production evidence still remains separate from code: external audit reference, real recovery drill timestamp, live watcher drill timestamp, external signer/Vault/KMS/HSM, and independent node/operator proof.

<!-- ITANI_PRODUCTION_SYNC_END -->
