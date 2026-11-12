# Sans Filet

## Vision

Jeu de braquage à la **première personne**. On commence **sans rien** : pas d'arme, pas d'équipe, pas
d'argent. Chaque coup se prépare : repérage, renseignement, matériel trouvé ou acheté, choix de l'heure.
Les braquages montent en puissance (supérette → bijouterie → banque → …). Ton réaliste.

Boucle : repérage → préparation → exécution → fuite → blanchiment.

## Stack

- **TypeScript** (strict) + **Vite** + **Three.js** (version épinglée).
- Tests : **Vitest**, environnement `node`.
- Modèles 3D en `.glb` dans `public/models/`, chargés par `GLTFLoader`.

## Commandes

```bash
npm install
npm run dev      # serveur de dev
npm run build    # typecheck + build
npm test         # tests
```

Après chaque étape, `npm run build` et `npm test` doivent passer.

## Architecture

- `src/data/` : contenu en JSON (`items.json`, `level.json`, `rules.json`), types, validation (`index.ts`).
- `src/systems/` : logique pure, sans Three.js, testée.
  - `World` : état complet d'une partie ; `step(dt, input)` avance d'un pas (secondes réelles).
  - `Clock` (temps de jeu, `timeScale` s de jeu par s réelle), `Inventory` (objets, argent propre/sale),
    `Notebook` (carnet de repérage : on apprend en regardant), `Clerk` (emploi du temps de l'employé),
    `Police` (appel → trajet → fouille → départ), `geometry` (collisions, lignes de vue).
- `src/render/` : Three.js et DOM. `Game` (boucle à pas fixe 1/60 s), `LevelView`, `ActorView`,
  `Viewmodel` (objet en main, gilet glb), `Hud`, `Input`, `Sfx`.

## Règles du prototype (supérette)

- Départ dans la planque, 0 $. 40 $ dans un manteau, un pied-de-biche dans la benne de la ruelle.
- **Le Fourgue** (ruelle, 18 h – 5 h) vend le matériel contre de l'argent propre, et blanchit l'argent sale (25 %).
- **Témoins** (employé, passant) : la suspicion monte selon ce qui est visible (arme, cagoule, gilet,
  zone réservée) ; un crime vu déclenche un appel après un court délai. La nuit et accroupi, on est moins visible.
- **Caméra** (si le courant passe) : un crime filmé = **alerte silencieuse**, jamais affichée au joueur.
- **Boîte à fusibles** (coupe-fil) : coupe caméra, alarme de porte et lumières.
- **Porte arrière** : forcée au pied-de-biche (bruyant), ou ouverte par l'employé pendant sa pause cigarette.
- **Menace** (clic maintenu, arme pointée sur l'employé) : il lève les mains, puis appelle dès qu'il peut.
- **Police** : délai réduit par la chaleur. Pris sur place = garde à vue, matériel et butin confisqués.
- **Identification** : vu à visage découvert pendant un crime → recherché ; l'employé te reconnaîtra.
- Le bilan s'affiche quand on rentre à la planque une fois la police repartie.
- `?debug` expose `window.__heist`.

## Conventions

Identiques à celles de `mold-and-majesty` : code en anglais, commentaires et textes en français,
pas de `any`, logique séparée du rendu, contenu en JSON validé, tests à côté du code, petits commits
à l'impératif en français.
