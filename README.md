# inc_wallet

Wallet simple pour l'écosystème Metani / iTani Network Chain.

inc_wallet ne crée pas une identité séparée. Il consomme le Metani ID central fourni par HudLife et affiche le même wallet iTani que HudLife, ArtLinks et HudWorld.

## Démarrage

```bash
npm install
npm run dev
```

## Sécurité

- aucune clé privée utilisateur ne doit être stockée dans le frontend;
- la session vient de HudLife SSO;
- les endpoints réseau viennent de `metani-network.config.json`;
- les secrets restent dans `.env` ou le secret manager, jamais dans Git.
