# 🐟 Undyne l'Immortelle — fan game

Fan game **non officiel** qui recrée le combat contre **Undyne l'Immortelle** (route génocide d'*UNDERTALE*, de Toby Fox) dans le navigateur, en HTML5 Canvas, sans dépendance ni connexion.

## Lancer le jeu

Ouvrez `undyne/index.html` dans un navigateur récent, puis mettez le son 🎧.

## Commandes

| Touche | Action |
|---|---|
| Flèches | Se déplacer (âme rouge), orienter le bouclier (âme verte), naviguer dans les menus |
| Z ou Entrée | Valider, faire défiler les dialogues, frapper sur la cible |
| X ou Maj | Annuler, afficher tout le texte d'un coup |
| M | Couper le son |
| F | Plein écran |

## Contenu

- **Interface fidèle** : boîte de combat, boutons COMBAT / AGIR / OBJET / PITIÉ, barre de PV, texte qui s'affiche lettre par lettre avec bips de voix, bulles de dialogue, cible d'attaque avec barre mobile, chiffres de dégâts et barre de vie de l'ennemie.
- **Sprite d'Undyne dessiné pixel par pixel** (affiché en x2, comme les sprites de combat d'origine) : crinière rouge qui ondule, cache-œil, œil jaune qui étincelle, crocs, nageoires, armure noire à contours blancs, cœur sur le plastron, lance. Le sprite respire, tremble et fond quand elle faiblit, puis se dissout en poussière.
- **Âme verte** : l'âme est immobile et il faut parer les lances avec le bouclier dans les quatre directions. Les flèches jaunes font demi-tour au dernier moment.
- **Âme rouge** : lances qui encerclent l'âme puis foncent dessus, lances qui jaillissent du sol, murs de lances, pluie de lances avec avertissements.
- **Environ 17 tours scénarisés** qui deviennent de plus en plus durs et alternent les deux modes, avec des répliques originales en français.
- **Séquences complètes** : rencontre (clignotement de l'âme), monologue où Undyne se reforme, Game Over (cœur brisé puis éclaté) avec réessai, fin où Undyne fond et se dissout en poussière, écran de victoire et statistiques.
- **Objets** : Tarte Caramel, Héros Légendaire (+ATQ), Steak Facial, Morceau de Bonhomme de Neige, Thé de la Mer (+vitesse), Pomme-Crabe.
- **Deux modes** : *Normal* (fidèle au combat d'origine) et *Clément* (dégâts reçus divisés par deux).

## Musique et sons

Tout est synthétisé en temps réel avec la Web Audio API. La musique de combat, « Lance de la Justice », est une **composition chiptune originale** qui s'inspire de l'énergie de *Battle Against a True Hero* : tempo rapide, ré mineur, lead en onde carrée avec écho, basse en octaves et batterie 8-bit. Ce n'est pas une reprise du morceau de Toby Fox. Les bruitages (voix, bouclier, lances, coups, cœur brisé, poussière…) sont eux aussi générés par le code.

## Fichiers

- `index.html` : page du jeu
- `game.js` : logique du combat, menus, attaques, scènes
- `sprite.js` : petit moteur de pixel art et sprite d'Undyne
- `audio.js` : musique et bruitages procéduraux
- `font.js` : police pixel *Press Start 2P* embarquée (SIL OFL 1.1, voir `FONT-LICENSE-OFL.txt`)

---
*UNDERTALE et ses personnages appartiennent à Toby Fox. Ce projet est un hommage de fan, gratuit et sans lien officiel.*
