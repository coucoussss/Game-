# Mold & Majesty

## Vision

Jeu de gestion en pixel art. Le joueur incarne un **réseau de mycélium** qui bâtit un royaume
souterrain dans une forêt, vue **en coupe 2D** : le ciel et les arbres en haut, les couches de sol
en dessous (surface, humus, profondeurs).

- Le réseau s'étend en faisant pousser des filaments. Chaque nœud coûte des ressources et en rapporte.
- Les **espèces de champignons** tiennent lieu de bâtiments. Chacune pousse dans une couche donnée
  et produit quelque chose (nutriments, eau, spores…).
- La forêt est vivante : des **événements** (pluie, sécheresse, chute d'arbre…) bouleversent l'économie.
- Il y a plusieurs **forêts** (niveaux), chacune avec ses contraintes.
- Ton : contemplatif, un peu majestueux, un peu moisi. Palette sombre et terreuse, mycélium clair.

## Stack

- **TypeScript** (strict) + **Vite** + **Phaser 3**. La version est épinglée à 3.90.0 : ne pas passer à Phaser 4.
- Tests : **Vitest**, en environnement `node` (pas de navigateur).
- Pas de backend. La sauvegarde passe par `localStorage`, via `SaveSystem`.
- Résolution native **384×216**, avec `pixelArt: true` et `roundPixels: true`. La mise à l'échelle est
  **entière uniquement** : `computeIntegerZoom` (dans `src/ui/integerScale.ts`) est recalculé à chaque
  redimensionnement.

## Commandes

```bash
npm install
npm run dev        # serveur de dev
npm run build      # typecheck (tsc --noEmit) + build Vite dans dist/
npm test           # tests Vitest
```

Après **chaque étape**, `npm run build` et `npm test` doivent passer. On commite ensuite.

## Architecture

```
mold-and-majesty/
├── index.html
├── src/
│   ├── main.ts        # configuration Phaser, mise à l'échelle entière
│   ├── config.ts      # constantes globales (résolution, clé et version de sauvegarde)
│   ├── scenes/        # scènes Phaser (Boot, Game, menus…) : affichage et entrées uniquement
│   ├── systems/       # logique de jeu pure (économie, croissance, événements, sauvegarde)
│   ├── entities/      # objets du monde (nœuds, filaments, champignons, créatures)
│   ├── data/          # JSON de contenu + types + chargement/validation (index.ts)
│   └── ui/            # HUD, menus, info-bulles, utilitaires d'affichage
└── public/            # assets statiques (sprites, polices bitmap, sons)
```

### Données

Le contenu du jeu vit dans des **fichiers JSON séparés du code**, dans `src/data/` :

- `species.json` : les espèces de champignons (`SpeciesDef`)
- `events.json` : les événements de forêt (`EventDef`)
- `forests.json` : les forêts jouables (`ForestDef`)

Les types sont définis dans `src/data/types.ts`. Au chargement, `src/data/index.ts` indexe les données
et les **valide** : identifiants uniques, valeurs cohérentes, références croisées. Pour ajouter du
contenu, on édite le JSON, pas le code. Chaque nouvelle règle de cohérence va dans `buildGameData`,
avec un test.

## Conventions de code

- Le code et les identifiants sont en **anglais**. Les commentaires, les textes affichés et les messages
  d'erreur sont en **français**.
- Nommage : `PascalCase` pour les classes, les types et leurs fichiers (`SaveSystem.ts`) ; `camelCase`
  pour les fonctions, les variables et les fichiers utilitaires (`integerScale.ts`) ; `kebab-case` pour
  les `id` des JSON.
- **Séparer la logique du rendu.** Dans la mesure du possible, `systems/` et `entities/` n'importent pas
  Phaser, pour rester testables sous Vitest. Les scènes lisent l'état et l'affichent.
- Ce qui touche au navigateur est injecté en dépendance (par exemple, `SaveSystem` reçoit un `KeyValueStorage`).
- La simulation tourne à **tick fixe**, indépendamment du framerate.
- Les coordonnées sont toujours en **pixels entiers**. Les tuiles font 8 px.
- Les tests sont placés à côté du code : `foo.ts` a son `foo.test.ts`. Toute la logique de `systems/` est testée.
- Pas de `any`. On préfère `readonly`, et les unions de chaînes plutôt que les enums.
- Le format de sauvegarde est versionné (`SAVE_VERSION` dans `config.ts`). On l'incrémente à chaque
  changement incompatible ; une sauvegarde d'une autre version est ignorée.
- Les commits sont petits et ciblés : un par étape (ou sous-étape), avec un message à l'impératif en français.

## Étapes

> ⚠️ Le brief initial ne contenait pas la liste d'étapes. Celle-ci est une **proposition**,
> à remplacer ou à ajuster.

- [x] 0. Fondations : Vite + TS + Phaser 3, rendu 384×216 pixel-perfect à l'échelle entière,
      données JSON validées, `SaveSystem` sur localStorage, Vitest
- [ ] 1. Vue en coupe de la forêt : grille de tuiles par couche, caméra, défilement horizontal
- [ ] 2. Réseau de mycélium : nœuds et filaments, croissance au clic, coûts
- [ ] 3. Économie : ressources (nutriments, eau, spores), simulation à tick fixe
- [ ] 4. Espèces de champignons constructibles par couche (depuis `species.json`)
- [ ] 5. Événements de forêt aléatoires et pondérés (depuis `events.json`)
- [ ] 6. HUD et interface : ressources, menu de construction, info-bulles, police bitmap
- [ ] 7. Sauvegarde et chargement complets, menu principal
- [ ] 8. Plusieurs forêts et progression (depuis `forests.json`)
- [ ] 9. Sprites, animations, audio et finitions
