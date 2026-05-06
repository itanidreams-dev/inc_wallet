# inc_wallet

Wallet simple pour l'ecosysteme Metani / iTani Network Chain.

inc_wallet ne cree pas une identite separee. Il consomme le Metani ID central fourni par HudLife et affiche le meme wallet iTani que HudLife, ArtLinks et HudWorld.

## Fonctionnalites

- connexion avec HudLife SSO;
- reception ITANI via adresse wallet liee;
- envoi ITANI via wallet externe EVM uniquement;
- staking ITANI via `https://relay.itaninetworkchain.com/api/wallet/stake-tokens`;
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
- PayPal ou fiat balance doit passer par webhooks serveur signes et ledger immuable avant production.
