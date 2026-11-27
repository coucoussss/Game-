# Passation — Sans Filet

Document destiné à une nouvelle session (humaine ou IA) qui reprend le projet. À lire en entier avant
de toucher au code. Complète `CLAUDE.md` (conventions et architecture) : en cas de doute, `CLAUDE.md` fait foi.

## 1. En deux phrases

Jeu de braquage à la première personne, dans le navigateur (TypeScript + Vite + Three.js 0.180). On part
de rien avec 15 000 $ de dette ; on repère, on s'équipe, on monte en puissance (coffres de voiture →
supérette → bijouterie → banque) et on rembourse le Fourgue pour gagner.

## 2. Où sont les choses

| Quoi | Où |
|---|---|
| Dépôt GitHub | `coucoussss/Game-` |
| Branche de travail | `claude/ecstatic-heisenberg-fxrt5y` (tout est poussé, aucune PR ouverte) |
| Projet | dossier `heist/` du dépôt. **Ne pas toucher** `mold-and-majesty/` ni `index.html`, `game.js`, `audio.js` à la racine (autres projets). |
| Version jouable publiée | https://claude.ai/artifact/KBCT4pZbBPSGdBxpmGgyNw (privée, propriétaire : l'utilisateur) |
| Modèle 3D fourni par l'utilisateur | `public/models/plate-carrier.glb` (gilet porte-plaques, ~29 k triangles, sans squelette) |
| Langue | Code et identifiants en anglais ; commentaires, textes du jeu, commits en **français** (impératif). |

L'utilisateur parle français, veut des résultats « ultra détaillés », et a annoncé qu'il fournirait
d'autres fichiers 3D (personnages, armes, décors). Il n'en a pas encore envoyé d'autres que le gilet.

## 3. Démarrer

```bash
cd heist
npm install
npm run dev        # http://localhost:5173
npm test           # 74 tests Vitest (environnement node), doivent passer
npm run build      # tsc --noEmit + vite build → dist/
```

Paramètres d'adresse (développement) :
- `?debug` → `window.__heist` (objet `Game` : `.world`, `.hud`, `.input`, `.frame(dt)`…)
- `?play` saute l'écran titre · `?hour=23` règle l'heure · `?give=all` donne tout · `?seed=4`
- `?portrait` ou `#portrait` → **studio de portraits** des personnages (`window.__portrait`)

## 4. Architecture (résumé ; détails dans CLAUDE.md)

```
heist/
├── src/data/        JSON validés : town.json (ville, généré par tools/gen_town.py), items.json,
│                    props.json (gabarits de meubles), rules.json (équilibrage), types.ts, index.ts
├── src/systems/     Logique pure, testée, sans Three.js
│   ├── World.ts     ★ état complet ; step(dt, input) ; armes, témoins, police, incidents, économie,
│   │                  dette, sauvegarde (snapshot/restore, SAVE_VERSION = 2)
│   ├── Npc.ts       corps + perception ; StaffBrain (horaires, pauses, rondes) ; PedestrianBrain
│   ├── NavGrid.ts   A* sur grille 0,5 m (poursuites)
│   ├── Police.ts    appel → trajet → fouille → départ
│   ├── Site.ts      état d'une cible (courant, alarme, perceuse…), Rng à graine
│   └── Inventory, Notebook, Clock, geometry
├── src/render/      Three.js + DOM + WebAudio
│   ├── Game.ts      boucle à pas fixe 1/60 s, événements → effets/son/HUD, sauvegarde localStorage
│   ├── CityView.ts  décor figé (fusionné par matériau via bake), ciel (Sky)
│   ├── LevelView.ts soleil/lune + ombres, réserve de 10 lumières, portes, caméras, coffres, chambre forte
│   ├── ActorView.ts personnages (Human) + voiture de police ; regard et niveau de détail
│   ├── Viewmodel.ts bras FPS + objet tenu ; chargement du gilet (VEST_URLS : .glb puis .glb.txt base64)
│   ├── Hud.ts, Input.ts (mode de secours sans pointer lock), Sfx.ts, Effects.ts, Portrait.ts
│   ├── build.ts / textures.ts   matériaux, géométries partagées, textures procédurales
│   └── models/      human.ts ★ (personnages), rig.ts (skinning), charMaterials.ts, items.ts, props.ts
└── tools/           gen_town.py (régénère town.json) ; screenshots/ (scripts Playwright)
```

Principes à respecter :
1. **Logique ≠ rendu.** Toute règle de jeu va dans `systems/` avec un test. Le rendu ne fait que lire.
2. **Contenu en JSON** validé dans `data/index.ts` ; toute nouvelle règle de cohérence → `buildGameData` + test.
3. `town.json` est **généré** : modifier `tools/gen_town.py` puis `python3 tools/gen_town.py src/data/town.json`.
4. Les couleurs `THREE.Color` sont **linéaires** : repasser en sRGB avant de peindre un canvas (bug corrigé, ne pas réintroduire).
5. Après chaque étape : `npm run build` + `npm test`, puis un commit ciblé en français.

## 5. État du jeu (ce qui marche)

- **Ville** : rue, ruelle, planque, supérette, bijouterie, banque, blocs pleins, horizon ; cycle jour/nuit.
- **Progression** : matériel débloqué par l'argent blanchi (300 $ / 1 500 $) ; poches limitées (sac).
- **Systèmes** : carnet de repérage, témoins et suspicion, caméras = alerte silencieuse, boîtiers électriques
  (cadenassés aux cibles 2 et 3), vitrines à détecteur de bris, vigiles armés (rendent, dégainent,
  enquêtent), veilleur de nuit, police à pied (fouille, tir, arrestation, renforts), gilet à plaques,
  pistolet (chargeur, recul), pied-de-biche (K.-O.), perceuse de chambre forte, guichetiers menacés,
  garde à vue / hôpital, chaleur et identification, sauvegarde automatique au calme, victoire.
- **Personnages** (dernier gros chantier) : squelette ~55 os, peau déformable, visages sculptés, mains à
  phalanges, garde-robe par rôle, animations (marche, course, repos, regard, clignements, peur, téléphone,
  cigarette, visée, chute). ~45 k triangles chacun ; détails masqués au-delà de 16 m.

## 6. Ce qui n'a PAS été vérifié

- **Jamais joué en temps réel avec clavier/souris** : le conteneur n'a pas de GPU (rendu SwiftShader,
  ~1,5 s par image) et pas de pointer lock. Tout a été validé par tests + captures image par image.
- **Fluidité réelle** sur une vraie carte graphique : inconnue. ~700 k triangles de personnages au total +
  ombres. Si c'est lent : baisser la tessellation dans `human.ts` (`scalpBand`, `torsoGeo`, tête), la
  distance de détail (16 m dans `ActorView`), ou `POOL` dans `LevelView`.
- **Équilibrage** (prix, butins, délais de police) : fixé à l'estime, dans `rules.json` / `items.json` / `gen_town.py`.
- **Artefact publié** : testé localement avec les mêmes fichiers, pas dans le cadre claude.ai lui-même.

## 7. Défauts connus / pistes

1. Visée épaulée (clic droit) : les gants occupent beaucoup d'écran (`Viewmodel.ts`, `adsPos`, `tilt`).
2. Pas de commandes tactiles (jeu non jouable sur téléphone).
3. Pose « counter » de l'employé : bras peu avancés (`human.ts`, `idlePose`).
4. Cheveux bouclés : sphères, un peu « jouet » ; reflet en losange dans les yeux (clearcoat).
5. Coffres de voiture : le hayon ne s'ouvre pas visuellement ; les caisses n'ont pas de tiroir animé.
6. Pas de pluie/météo, pas de musique (seulement ambiance et bruitages).
7. Pas de coéquipiers ni de tableau de plan minuté (idées du brainstorm initial).

## 8. Prochaines étapes suggérées

1. **Intégrer les modèles 3D de l'utilisateur** dès qu'il les envoie : un `.glb` se charge via
   `loadModel()` (`Viewmodel.ts`) ; pour un personnage riggé, remplacer `Human` dans `ActorView` en gardant
   l'interface (`root`, `update(dt, x, z, facing, pose, speed)`, `gaze`, `setDetail`).
2. Faire tester par l'utilisateur et équilibrer à partir de ses retours.
3. Option graphismes (basse/moyenne/haute) dans la pause.
4. Coéquipiers + tableau de plan ; nouvelles cibles (fourgon blindé…).

## 9. Outils de vérification visuelle (Playwright, sans GPU)

Le navigateur Chromium et Playwright sont préinstallés dans les conteneurs Claude Code.
Le rendu logiciel est lent : les scripts **coupent `requestAnimationFrame`** et appellent `frame(dt)` à la main.

```bash
cd heist && npm run build && (npx vite preview --port 4173 &)
node tools/screenshots/game-shots.cjs tools/screenshots/example-views.json   # captures en jeu → shots/
node tools/screenshots/portrait-shots.cjs '[{"name":"face","view":"face","focus":0}]'
node tools/screenshots/load-time.cjs                                         # coût de construction
```
(Les scripts écrivent dans `./shots/` relatif au dossier courant ; créer le dossier avant.)
Vues du studio : `face`, `body`, `back`, `hands`, `lineup` ; `focus` = index dans la liste de
`Portrait.ts` (0 employé, 1 bijoutier, 2-3 guichetiers, 4 vigile, 5 veilleur, 6-7 policiers, 8 Fourgue, 9-14 passants).

## 10. Republier l'artefact

Les artefacts ne servent pas les `.glb` : on publie le gilet en base64 dans un `.txt`.
```bash
npm run build
base64 -w0 dist/models/plate-carrier.glb > <dossier>/models/plate-carrier.glb.txt
```
Page = contenu de `dist/index.html` **sans** doctype/html/head/body (titre + style + `#game` + `#hud` +
`<script type="module" src="assets/index-XXXX.js">`), fichiers joints : `assets/index-XXXX.js` et
`models/plate-carrier.glb.txt`. Pour mettre à jour la même adresse depuis une autre session : outil
Artifact avec `url: https://claude.ai/artifact/KBCT4pZbBPSGdBxpmGgyNw` (le lire d'abord avec `action: "read"`).

## 11. Contenu de l'archive de passation

- `Game-heist/` : le projet complet (sans `node_modules` ni `dist`) — lancer `npm install`.
- `repo.bundle` : l'historique git complet de la branche. Restauration :
  `git clone repo.bundle Game- && cd Game- && git checkout claude/ecstatic-heisenberg-fxrt5y`
- `captures/` : images de référence de l'état actuel (rue, intérieurs, personnages, police…).
- `HANDOFF.md` (ce fichier) et `CLAUDE.md` à la racine de l'archive.
