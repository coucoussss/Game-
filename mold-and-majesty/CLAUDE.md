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
- `network.json` : les paramètres du réseau (`NetworkDef`) : flux, épaisseurs, rôles des nœuds, signal, fructification
- `seasons.json` : la durée des saisons, leurs règles, leurs palettes, leurs météos, et les gains de mémoire (`SeasonsDef`)
- `soil.json` : l'absorption d'eau et de minéraux, et l'inertie hydrique des couches (`SoilDef`)

Les types sont définis dans `src/data/types.ts`. Au chargement, `src/data/index.ts` indexe les données
et les **valide** : identifiants uniques, valeurs cohérentes, références croisées. Pour ajouter du
contenu, on édite le JSON, pas le code. Chaque nouvelle règle de cohérence va dans `buildGameData`,
avec un test.

## Réseau de mycélium (étape 2)

- **Modèle** : `entities/Network.ts` est un graphe pur (nœuds, segments, adjacence), sans règles.
  `systems/FlowSystem.ts` simule un tick ; `systems/NetworkBuilder.ts` convertit les gestes en filaments.
- **Tracé** : on part d'un nœud existant et on glisse (souris ou doigt). Un point est posé tous les 10 px,
  aimanté sur une grille de 4 px, ou sur un nœud existant à moins de 6 px (ce qui ferme des boucles).
- **Épaisseurs** : *fin* pousse vite et coûte peu, mais conduit peu et meurt vite quand il est affamé ;
  *épais* pousse lentement et coûte cher, mais a un gros débit et résiste longtemps.
- **Nœuds** : cœur (produit sucre et eau, émet le signal), jonction (simple point de passage), réserve
  (gros stock), relais (réémet le signal), ruche (consomme sucre, eau et signal pour produire des spores).
  Une jonction se convertit en investissant progressivement du sucre (`build`).
- **Flux** : sucre, eau et signal diffusent selon le taux de remplissage des nœuds (pression). Le
  transport conserve la matière et ne rend jamais un stock négatif. Le signal s'atténue à chaque tick.
- **Santé** : chaque segment actif paie un entretien en sucre et en eau à ses extrémités. Sous-alimenté,
  il pâlit (perte de santé proportionnelle au manque), puis meurt à 0 ; les nœuds isolés disparaissent.
- **Ordre d'un tick** : nœuds → transport → entretien → pousse → nettoyage. Tick = 100 ms.

## Ressources, saisons et décor (étape 3)

- **`systems/World.ts`** regroupe tout l'état d'une partie (réseau, calendrier, météo, sol, mémoire,
  générateur aléatoire à graine). Il est sans Phaser et testable ; `step()` = un tick. Ordre d'un tick :
  météo → humidité → absorption → litière → gel → réseau → mémoire.
- **Ressources** :
  - le sucre vient du cœur, et surtout de l'échange minéraux → sucre avec les arbres ;
  - l'eau est bue dans le sol, selon l'humidité et la couche ;
  - les minéraux sont extraits de gisements qui s'épuisent ; l'automne regarnit ceux de surface ;
  - la mémoire est globale : elle se gagne à chaque saison traversée et à chaque spore, et réduit
    le dépérissement ;
  - les spores sont produites par les ruches.
- **Saisons** : 15 minutes chacune (9000 ticks). Les règles changent net au début de la saison (`SeasonRules`
  devient des `FlowModifiers`) ; la palette, elle, glisse vers la suivante pendant les 35 % finaux.
  - Le printemps étend : pousse rapide et bon marché.
  - L'été produit : l'échange avec les arbres est maximal, mais gare aux canicules.
  - L'automne fructifie : les ruches y sont efficaces, la litière rend des minéraux.
  - L'hiver fait survivre : plus de sucre, entretien réduit, surface gelée (plus d'eau, et le gel tue
    les filaments fins).
- **Météo** : tirée parmi celles que la saison permet, avec une durée aléatoire. Le sol suit lentement
  l'humidité ; les couches profondes l'amortissent (`layerBuffer`), donc s'enraciner profond protège
  des sécheresses.
- **Interface minimale** : aucune barre de ressources, l'information passe par le décor.
  - Le feuillage (densité, couleur) est l'horloge des saisons ; il flétrit quand le sol s'assèche.
  - Le sol fonce quand il est humide, se fissure quand il est sec, givre en hiver.
  - Les cristaux de minéraux rétrécissent à mesure qu'on les exploite.
  - Les filaments pâlissent quand ils sont affamés.
  - Le halo du cœur montre ses réserves de sucre, ses cernes la mémoire accumulée.
  - Le nom de la saison s'affiche à son début puis s'efface ; même chose pour les aides d'outil.
  - `I` affiche les chiffres (débogage).
- **Développement** : `?seed=4&tick=22000&speed=60` dans l'URL fixe la graine, le moment de départ et la
  vitesse. En jeu, le bouton 8 fait passer la vitesse de ×1 à ×4 puis ×16.
- **Équilibrage** : `World.test.ts` simule une année entière avec un réseau type. S'il casse après un
  réglage des JSON, c'est que l'équilibre du jeu a changé : vérifier que c'est voulu.

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
- [x] 2. Réseau de mycélium : tracé à la souris ou au doigt sur une grille souple, épaisseurs,
      nœuds (réserve, relais, ruche), flux sucre/eau/signal, dépérissement, tests de simulation
- [x] 3. Ressources (sucre, eau, minéraux, mémoire), cycle de 4 saisons de 15 min, météo,
      interface par le décor
- [ ] 4. Espèces de champignons constructibles par couche (depuis `species.json`)
- [ ] 5. Événements de forêt aléatoires et pondérés (depuis `events.json`)
- [ ] 6. HUD et interface : ressources, menu de construction, info-bulles, police bitmap
- [ ] 7. Sauvegarde et chargement complets, menu principal
- [ ] 8. Plusieurs forêts et progression (depuis `forests.json`)
- [ ] 9. Sprites, animations, audio et finitions
