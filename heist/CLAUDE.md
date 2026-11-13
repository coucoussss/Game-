# Sans Filet

## Vision

Jeu de braquage à la **première personne**. On commence **sans rien** : pas d'arme, pas d'outil, pas
d'argent, et 15 000 $ de dette envers le Fourgue. Chaque coup se prépare : repérage, renseignement,
matériel trouvé ou acheté, choix de l'heure. Les coups montent en puissance : coffres de voiture →
supérette → bijouterie → banque. Rembourser la dette termine la partie. Ton réaliste.

Boucle : repérage → préparation → exécution → fuite → blanchiment → remboursement.

## Stack

- **TypeScript** (strict) + **Vite** + **Three.js** (version épinglée).
- Tests : **Vitest**, environnement `node` (aucun test ne dépend du navigateur).
- Tous les modèles sont **construits par code** (`src/render/models/`), sauf le gilet porte-plaques
  (`public/models/plate-carrier.glb`, chargé par `GLTFLoader`). Textures générées en canvas.

## Commandes

```bash
npm install
npm run dev      # serveur de dev
npm run build    # typecheck + build
npm test         # tests
```

Après chaque étape, `npm run build` et `npm test` doivent passer.

## Architecture

- `src/data/` : contenu JSON validé au chargement (`index.ts`).
  - `town.json` : la ville. Bâtiments (ouvertures, cloisons), mobilier, sites (horaires, zones réservées),
    interactifs, renseignements, caméras, employés et vigiles (horaires, trajets, pauses, rondes),
    passants, lampadaires, le Fourgue. **Généré** par `python3 tools/gen_town.py src/data/town.json` : on peut
    aussi l'éditer à la main.
  - `items.json` (matériel, prix, déblocage), `props.json` (gabarits des meubles), `rules.json` (réglages).
  - `expandTown` découpe les bâtiments en murs, vitrines (bloquent le passage, pas la vue) et portes.
- `src/systems/` : logique pure, sans Three.js, testée.
  - `World` : état complet ; `step(dt, input)` avance d'un pas (secondes réelles). Interactions, armes,
    témoins, vigiles, police à pied, incidents, économie, dette, sauvegarde (`snapshot` / `restore`).
  - `Npc` (corps, perception, `StaffBrain` emplois du temps, `PedestrianBrain`), `NavGrid` (A* sur grille
    de 0,5 m pour les poursuites), `Police` (appel → trajet → fouille → départ), `Site` (courant, alarme,
    perceuse, portes forcées), `Inventory`, `Notebook`, `Clock`, `geometry`.
- `src/render/` : Three.js, DOM, son.
  - `Game` : boucle à pas fixe 1/60 s, événements, sauvegarde (`localStorage`, clé `sans-filet/save`).
  - `CityView` (décor figé, fusionné par matériau avec `bake`), `LevelView` (ciel, soleil/lune et ombres,
    réserve de 10 lumières attribuées aux sources les plus proches, portes, caméras, boîtiers, coffres,
    vitrines, chambre forte, le Fourgue), `ActorView` (personnages, voiture de police), `Viewmodel`
    (bras et objet tenu), `Effects` (balles, éclats, étincelles), `Hud`, `Input`, `Sfx` (WebAudio pur).
  - `build.ts` : matériaux et géométries partagés, `bake`. `textures.ts` : matières procédurales
    (couleur + normales).

## Règles du jeu

- **Départ** : planque, 0 $. 40 $ dans un manteau, un pied-de-biche dans une benne de la ruelle.
- **Le Fourgue** (ruelle, 18 h – 5 h) : vend contre de l'argent propre, blanchit (25 %), encaisse la dette.
  Le matériel se débloque avec l'argent déjà blanchi (300 $ : crochets, sac, pistolet ; 1 500 $ : gilet,
  perceuse). Il vend aussi balles et plaques de rechange.
- **Poches** : 1 500 $ d'argent sale sans sac, 9 000 $ avec.
- **Témoins** : la suspicion monte selon ce qui est visible (arme, cagoule, gilet, zone réservée) ; un
  crime vu, un corps à terre ou un coup de feu déclenchent un appel. La nuit et accroupi, on est moins visible.
- **Caméras** : un crime filmé déclenche une **alerte silencieuse**, jamais affichée au joueur.
- **Boîtier électrique** (coupe-fil ; cadenassé à la bijouterie et à la banque) : coupe caméras, alarmes
  et lumières. **Portes extérieures** sous alarme ; **vitrines** à détecteur de bris (crocheter = silencieux).
- **Vigiles armés** : visés par surprise, ils se rendent ; sinon ils dégainent. Ils enquêtent sur les bruits.
  Pied-de-biche dans le dos = K.-O. ; pistolet = mort (chaleur, victimes au bilan).
- **Police** : délai réduit par la chaleur et le rang de la cible ; des agents descendent, fouillent, tirent
  sur un joueur armé, arrêtent un joueur désarmé. Renforts si un agent tombe.
- **Gilet** : les plaques absorbent 75 % des dégâts tant qu'il en reste.
- **Arrêté** = garde à vue, matériel et butin confisqués. **Abattu** = hôpital (un jour de plus, 30 % des économies).
- **Banque** : guichetiers menacés qui remettent leur caisse ; chambre forte à la perceuse thermique (40 s,
  capteur sismique) : palette de 9 000 $ et coffres individuels.
- Le bilan s'affiche en rentrant à la planque, une fois la police repartie. Sauvegarde au calme seulement.

## Développement

- `?debug` expose `window.__heist` ; `?play` saute l'écran titre ; `?hour=23` règle l'heure ;
  `?give=all` donne tout le matériel ; `?seed=4` fixe la graine.
- Le rendu logiciel des conteneurs (SwiftShader) met ~1,5 s par image : pour des captures, couper
  `requestAnimationFrame` et appeler `__heist.frame(dt)` à la main.

## Conventions

Identiques à celles de `mold-and-majesty` : code en anglais, commentaires et textes en français,
pas de `any`, logique séparée du rendu, contenu en JSON validé, tests à côté du code, petits commits
à l'impératif en français.
