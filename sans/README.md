# ⚖️ Jugement Final

Fan game **non officiel** qui recrée le combat contre Sans d'UNDERTALE (Toby Fox), entièrement dans le navigateur (HTML5 Canvas, sans dépendance).
Les sprites sont dessinés pixel par pixel dans le code. Les musiques sont des compositions originales en 8-bit, synthétisées en temps réel avec la Web Audio API. Les dialogues ont été réécrits en français. Aucun fichier du jeu original n'est utilisé.

## Lancer le jeu

Ouvrez `sans/index.html` dans un navigateur récent et mettez le son. Sur téléphone, une croix directionnelle et des boutons Z / X apparaissent.

## Commandes

| Touche | Action |
|---|---|
| Flèches | Déplacer l'âme / naviguer dans les menus |
| Z ou Entrée | Valider, faire défiler le texte |
| X ou Maj | Retour, afficher tout le texte d'un coup |
| Échap / P | Pause |
| M | Couper le son |
| F | Plein écran |

## Ce qui est recréé

- **Écran de nom** avec la grille de lettres et les réactions aux noms spéciaux (essayez « Sans », « Frisk », « Chara »…).
- **Le hall du jugement** : vitraux dorés, piliers en silhouette, puis le monologue de Sans avant le combat.
- **La transition de rencontre** : l'âme clignote, puis rejoint la boîte de combat.
- **L'interface de combat** : COMBAT / AGIR / OBJET / PITIÉ, la barre d'attaque, « MISS » quand Sans esquive, la commande Vérifier, 8 objets de soin (dont les Nouilles qui ne soignent que 4 PV en combat).
- **KARMA (KR)** : chaque contact retire 1 PV et ajoute du KR, qui continue ensuite de vider la barre (en violet). Le KR seul ne peut pas vous achever.
- **Âme bleue** : gravité, sauts à hauteur variable, projections contre les murs dans les 4 directions.
- **Os bleus** (il faut rester immobile), murs d'os, os qui jaillissent des parois après un avertissement, plateformes mobiles au-dessus d'un sol d'os.
- **Gaster Blasters** : ils entrent en tournoyant, se chargent, puis tirent un rayon et reculent.
- **15 attaques**, dont l'attaque finale de 30 secondes pendant laquelle Sans s'épuise.
- **Le piège de la clémence** à mi-combat.
- **L'« attaque spéciale »** de Sans, puis la fin du combat.
- **Game over** : l'âme se brise, puis un message vous encourage à rester déterminé. Sans commente vos morts successives quand vous revenez.
- **Mode entraînement** pour rejouer n'importe quelle attaque, et un **mode facile** qui réduit les dégâts.
