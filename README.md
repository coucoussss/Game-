# 🎮 Jeux

- **Nuit des Morts** (ci-dessous) : `index.html`
- **Undyne l'Immortelle** : fan game inspiré d'Undertale. Voir [`undyne/README.md`](undyne/README.md) et ouvrir `undyne/index.html`.

# 🧟 Nuit des Morts

Jeu de combat 2D contre des zombies, de nuit, sous la pluie. Il tourne entièrement dans le navigateur en HTML5 Canvas, sans aucune dépendance.
Tous les sons (armes, zombies, pluie, tonnerre, musique) sont **générés en temps réel** avec la Web Audio API.

## Lancer le jeu

Ouvrez `index.html` dans un navigateur récent (Chrome, Firefox, Edge). Mettez le son 🎧.

## Commandes

| Touche | Action |
|---|---|
| Q / D (AZERTY) ou A / D (QWERTY) | Se déplacer |
| Z / W / Espace | Sauter |
| Maj | Sprinter (consomme l'endurance) |
| Souris + clic gauche | Viser / tirer |
| Clic droit ou F | Coup de machette (peut décapiter et trancher des bras) |
| E | Coup de pied (repousse et étourdit) |
| R | Recharger |
| 1 / 2 / 3, molette, Tab | Pistolet / fusil à pompe / fusil d'assaut |
| M | Couper le son |
| Échap / P | Pause |

## Contenu

- **3 types de zombies** : marcheurs (lents, en meute), coureurs (rapides et hurlants à partir de la vague 2), colosses (très résistants, à partir de la vague 4). Certains sortent de terre.
- **Combat réaliste** : localisation des dégâts, avec des tirs à la tête ×2,6. Il y a aussi du recul, de la dispersion en mouvement, des douilles éjectées, un rechargement en temps réel, du démembrement, des décapitations et du sang persistant au sol.
- **Éclairage dynamique** : lampe torche dans la direction du tir, flash du canon, lampadaires qui grésillent, feux de tonneaux, éclairs. Les yeux des zombies luisent dans le noir.
- **Ambiance** : pluie, brouillard, orage, ville en ruines en parallaxe. La musique devient plus intense quand la horde se rapproche.
- Vagues de difficulté croissante, combos, butin (munitions, trousses de soin), meilleur score sauvegardé.

---

## ⚖️ Aussi dans ce dépôt : Jugement Final

Un fan game du combat contre Sans (UNDERTALE) : ouvrez `sans/index.html`. Détails dans [`sans/README.md`](sans/README.md).
