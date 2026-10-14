# Serveur en ligne d'Aura Clash

Relais WebSocket (Cloudflare Worker + Durable Object) pour jouer en ligne avec la version HTML.
Chaque salon a un code de 5 caractères ; l'hôte fait tourner le combat, le serveur relaie.

Déploiement (compte Cloudflare gratuit) :

```bash
cd online
npx wrangler login
npx wrangler deploy
```

Puis reporter l'adresse affichée (`wss://aura-clash-online.<sous-domaine>.workers.dev`) dans
`ONLINE_SERVER` (`src/net/online.js`) et régénérer les builds.
Test local : `npx wrangler dev`, puis ouvrir le jeu avec `?server=ws://localhost:8787`.
