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
- `allies.json` : les espèces alliées (personnalité, habitat, accord, service, trahison) et la dynamique de confiance (`AlliesDef`)
- `threats.json` : les moisissures rivales, les parasites et la défense chimique du réseau (`ThreatsDef`)
- `events.json` : les événements climatiques et leurs probabilités par saison (`EventsDef`)
- `sporulation.json` : le mini-jeu rythmique de la sporée (tempo, motifs, fenêtres de jugement) et le calcul de la portée (`SporulationDef`)
- `skills.json` : l'arbre de compétences, avec 3 branches de 4 rangs (`SkillsDef`)
- `forests.json` : les 8 forêts de la campagne, dans l'ordre, chacune avec son biome, sa règle spéciale (`ForestRules`), son objectif de portée, ses rivaux et son souvenir
- `biomes.json` : la teinte d'ambiance de chaque biome

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

## Alliés et menaces (étape 4)

- **Alliés** (`entities/Ally.ts`, `systems/AllySystem.ts`) : arbres, fourmis, vers, scarabées.
  - **Personnalité** : 5 traits (chaleur, patience, avidité, générosité, loyauté) définis par espèce
    dans le JSON, avec une variation individuelle.
  - **Confiance** (0..1) : elle monte quand l'accord est honoré (× chaleur) et baisse à proportion du
    manque (× (1 − patience)). Sans contact avec le réseau, elle revient doucement vers sa valeur initiale.
  - **Accords** : chaque tick, l'allié prend au nœud en contact ce qu'il réclame, puis donne en proportion
    de ce qu'il a reçu et de sa confiance. Les arbres échangent minéraux → sucre par leurs racines (il
    n'y a plus d'échange abstrait au cœur). L'arbre-mère plonge une racine vers le cœur.
  - **Services** : les fourmis nettoient les parasites, les vers regarnissent les gisements, les
    scarabées font avancer les ruches.
  - **Trahisons** (sous un seuil de confiance, d'autant plus probables que l'allié est peu loyal) :
    - l'arbre aspire du sucre puis boude (il prend sans rien donner) ;
    - les fourmis pillent le nœud le plus sucré ;
    - le ver ronge un filament ;
    - le scarabée dépose des parasites.
  - **Départs et arrivées** : à bout de confiance, une bête quitte la forêt (pas les arbres). De nouvelles
    arrivent à chaque saison. Les bêtes dorment l'hiver.
  - **Lisibilité** : aucune jauge. L'humeur (`moodOf` : dévoué, amical, méfiant, hostile) se traduit
    en animations :
    - ramure d'arbre qui s'affaisse ou tremble, sève dorée qui descend ou grise qui remonte ;
    - colonne de fourmis ordonnée ou grouillante ;
    - ver qui ondule ou se rétracte ;
    - carapace de scarabée irisée, ou élytres qui frémissent.
- **Moisissures rivales** (`systems/RivalSystem.ts`) : colonies de cellules sur une grille de 4 px.
  Elles grandissent, sécrètent des toxines (dégâts × `decay`, comme le gel) et dévorent les gisements.
  **Guerre chimique** : chaque nœud riche en signal détruit les cellules à sa portée en payant du sucre,
  ce qui fait des relais l'arme du réseau. Anéantir une colonie donne de la mémoire.
- **Parasites** (`systems/ParasiteSystem.ts`) : une épidémie qui court sur le graphe. La charge monte,
  le parasite vole du sucre et contamine par les segments. Le signal soigne, les fourmis nettoient,
  et l'outil **Couper** (touche 7) tranche un filament pour arrêter la contagion.
- **Climat** (`systems/ClimateSystem.ts`), un événement à la fois :
  - **sécheresse** : le sol s'assèche vite ;
  - **inondation** : l'eau monte des profondeurs et noie les filaments ;
  - **feu** : deux fronts courent en surface, brûlent arbres et filaments affleurants, puis laissent des
    cendres riches ; un arbre brûlé repousse en deux saisons ;
  - **gel tardif** : la surface gèle hors saison ;
  - **chêne abattu** : un gisement riche apparaît en surface.
  Seules les catastrophes sont nommées par un bandeau éphémère.
- **Rendu** : `ForestView` (arbres), `AllyView` (bêtes), `ThreatView` (menaces, climat),
  `EffectsView` (consomme `world.events` : trahisons, contagions, apparitions).
- **Développement** : `?event=fire|flood|drought|cold-snap|fallen-oak`, `?rival=verdigris|black-rot`,
  `?parasite`. `new World(data, forêt, graine, { threats: false })` désactive les menaces, comme dans le
  test d'équilibrage.

## Sporée et compétences (étape 5)

- **Sporée d'automne** : une fois par automne, avec au moins une ruche et des spores, le champignon du
  coin supérieur droit (ou la touche F) lance `RhythmScene`. La logique est pure, dans
  `systems/RhythmGame.ts` : la partition est générée depuis une graine, chaque frappe est jugée
  (parfait, bien ou fausse note), et le score va de 0 à 1. `World.sporulate(score)` libère les spores ;
  la portée en mètres vaut (base + spores × k) × facteur de rythme. La portée donne de la mémoire
  et sert d'objectif aux forêts (étape 6).
- **Compétences** (`systems/Skills.ts`) : chaque effet multiplie un paramètre des JSON. `applyBonuses`
  produit des **données effectives** (`World.data`) à partir des données de base (`World.baseData`), si
  bien qu'aucun système ne connaît les compétences. On les achète avec de la mémoire, dans
  `SkillScene` (les cernes en haut à gauche, ou la touche K).
- **Sorties de champignons** (`FruitView`) : chaque ruche fait pousser un carpophore en surface, relié
  par un fil lumineux. Il grandit, luit en automne (halo en mélange additif) et lâche des spores en
  particules ; la sporée déclenche une explosion de spores.

## Campagne et progression (étape 6)

- **8 forêts** (`forests.json`) : tempérée, marais, pinède brûlée, givre, jungle, ruines, caverne,
  Arbre-Mère. Chaque règle spéciale agit à deux niveaux :
  - sur les données, via `systems/ForestRules.ts` : durée des saisons (la jungle n'a pas d'hiver),
    gel, poids des événements, menaces, moisissures autorisées, production du cœur ;
  - sur le terrain, géré par `World` : nappe d'eau, gravats infranchissables, arbres calcinés,
    Arbre-Mère géant (`Ally.size`), caverne sans ciel.
  Ordre d'application : JSON → règle de forêt → compétences.
- **Objectif** : une sporée qui porte au moins à `goal.reach` mètres. Elle conquiert la forêt et
  débloque la suivante (`recordReach`).
- **Génération procédurale** (`systems/ForestGenerator.ts`) : une graine et une profondeur donnent une
  forêt valide, inspirée d'un biome de la campagne, plus dure à chaque profondeur. C'est le **mode
  infini** : chaque objectif atteint ouvre la profondeur suivante.
- **Profil** (`systems/Profile.ts`, sauvegardé en localStorage via `scenes/session.ts`) : forêts ouvertes
  et conquises, records, banque de mémoire et compétences (partagées entre les forêts), souvenirs vus,
  progression du mode infini, réglages, et **une** partie en cours (`World.snapshot()` /
  `World.restore()`, une reprise déterministe). Sauvegarde automatique à chaque saison, à Échap
  (retour au royaume) et quand l'onglet est masqué.
- **Écrans** : `ForestSelectScene` (carte du royaume, avec Entrer, Reprendre, Infini, Mémoire).
  En développement, `?forest=mist-marsh` (ou `?forest=endless-5`) lance directement une forêt.

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

- [x] 0. Fondations : Vite + TS + Phaser 3, rendu 384×216 pixel-perfect à l'échelle entière,
      données JSON validées, `SaveSystem` sur localStorage, Vitest
- [x] 2. Réseau de mycélium : tracé à la souris ou au doigt sur une grille souple, épaisseurs,
      nœuds (réserve, relais, ruche), flux sucre/eau/signal, dépérissement, tests de simulation
- [x] 3. Ressources (sucre, eau, minéraux, mémoire), cycle de 4 saisons de 15 min, météo,
      interface par le décor
- [x] 4. Alliés (arbres, fourmis, vers, scarabées : confiance, personnalité, échanges, trahisons)
      et menaces (moisissures rivales, parasites, sécheresse, inondation, feu, gel), lisibles par l'animation
- [x] 5. Fructification d'automne et mini-jeu rythmique (portée des spores), arbre de compétences
      (Racines, Chimie, Spores) payé en mémoire, sorties de champignons avec particules et lueur
- [x] 6. Campagne de 8 forêts aux règles spéciales (JSON), génération procédurale depuis une graine,
      mode infini, écran de sélection, sauvegarde de la progression
- [ ] 7. Souvenirs : séquences scriptées en JSON (caméra, sprites, musique), 8 scènes sans dialogue
- [ ] 8. Vrai pixel art (palette limitée), parallaxe, particules, éclairage dynamique, animations,
      musique ambient évolutive et sons organiques en WebAudio
- [ ] 9. Équilibrage, tutoriel, options (volume, plein écran, accessibilité), tactile, performances,
      README, build de production
