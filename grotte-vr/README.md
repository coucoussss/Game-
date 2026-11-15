# Grotte des Échos (VR)

Jeu de combat actif en réalité virtuelle (WebXR), dans le navigateur, sans installation.
Au fond d'une grotte lumineuse, **Mousseline**, un golem de mousse grognon avec un chapeau dont il est très fier, garde le passage.
On peut le battre… ou le calmer et l'épargner.

Pas de pluie de projectiles à éviter dans une boîte : on **se déplace vraiment** dans l'arène, on **bloque** avec un bouclier
et on **riposte** avec une baguette magique.

## Lancer le jeu

- **Casque VR** (Meta Quest, Pico, etc.) : servir le dossier en HTTPS (par exemple avec GitHub Pages), ouvrir `grotte-vr/index.html`
  dans le navigateur du casque, puis « Entrer en VR ».
- **Ordinateur** : servir le dossier (`python3 -m http.server` dans `grotte-vr/`), ouvrir `http://localhost:8000`, puis « Jouer sur ordinateur ».

Le WebXR exige une page servie en HTTPS (ou depuis `localhost`). Ouvrir le fichier directement depuis le disque ne marche pas.

## Commandes

| Action | Casque VR | Ordinateur |
|---|---|---|
| Se déplacer | Joystick gauche | ZQSD / WASD |
| Tourner | Joystick droit (par crans) | Souris |
| Lancer un sort | Gâchette droite | Clic gauche |
| Coup d'estoc | Coup de baguette rapide près de Mousseline | — |
| Bouclier | Grip gauche | Clic droit |
| Esquive | (se déplacer) | Espace |
| Complimenter / Blaguer / Écouter | A / B / X | 1 / 2 / 3 |
| Épargner (quand il est calmé) | Y | 4 |

## Le combat

- Mousseline flotte, puis prépare une attaque (il tremble et un son prévient). Trois attaques, toutes lisibles :
  - **Spores** : des boules roses qui te visent ; un pas de côté, le bouclier ou un sort les arrêtent.
  - **Anneau d'épines** : un cercle qui s'élargit au sol ; passe par l'ouverture signalée en jaune.
  - **Charge** : une bande rouge au sol annonce sa trajectoire ; écarte-toi.
- À la moitié de ses PV, il entre en **phase 2** : attaques plus rapides et plus nombreuses.
- **Agir** (seulement quand il n'attaque pas) fait monter son **humeur**. Chaque coup porté la fait baisser.
  À 100, il se calme et on peut l'**épargner** : fin pacifique. Sinon, on peut aussi le vaincre.

## Technique

- Three.js 0.160 embarqué dans `vendor/` (aucune dépendance réseau).
- Tous les sons et la musique sont synthétisés en direct (Web Audio).
- Code : `game.js` (scène, joueur, monstre, attaques, actions, sons) et `index.html` (écran d'accueil, HUD ordinateur).
