# Mold & Majesty

*Un jeu de gestion en pixel art où tu es un réseau de mycélium qui rebâtit un royaume oublié, dans la coupe d'une forêt.*

Sous les racines, un ancien royaume de champignons s'est effondré. Il n'en reste qu'une graine dorée : ton cœur. Fais pousser tes filaments dans la terre, commerce avec les arbres et les bêtes, survis aux saisons et aux catastrophes, puis, chaque automne, lance tes spores le plus loin possible pour gagner la forêt suivante.

## Jouer

```bash
cd mold-and-majesty
npm install
npm run dev        # http://localhost:5173
```

Le jeu se joue au clavier et à la souris, ou au doigt sur tablette et téléphone. La progression est sauvegardée automatiquement dans le navigateur.

### Commandes

| Action | Souris / clavier | Tactile |
|---|---|---|
| Faire pousser un filament | glisser depuis un nœud | glisser depuis un nœud |
| Épaisseur fin / moyen / épais | 1 / 2 / 3 | barre d'outils |
| Réserve / relais / ruche (sur une jonction) | 4 / 5 / 6, puis clic | outil, puis toucher |
| Couper un filament (arrête une contagion) | 7, puis glisser | outil Coupe |
| Vue des flux (sucre, eau, minéraux, signal) | 8 | bouton Vue |
| Vitesse ×1 / ×4 / ×16 | 9 | bouton de vitesse |
| Faire défiler la forêt | ← → (ou Q/A, D), molette, clic droit glissé | glisser à deux doigts |
| Sporée (en automne) | F, ou le champignon en haut à droite | toucher le champignon |
| Arbre de compétences | K, ou les cernes en haut à gauche | toucher les cernes |
| Pause, options, retour au royaume | Échap | bouton ≡ |
| Chiffres de débogage | I | – |

## Ce qu'il y a dans le jeu

- **Un réseau vivant.** Sucre, eau, minéraux et signal circulent dans un graphe de filaments, d'un nœud à l'autre selon leur taux de remplissage. Un filament mal nourri pâlit puis meurt. Les filaments fins poussent vite et ne coûtent pas cher, mais restent fragiles ; les épais sont lents et chers, mais solides.
- **Quatre saisons de 15 minutes**, chacune avec ses règles :
  - le printemps étend : pousse rapide ;
  - l'été produit : les arbres échangent le plus ;
  - l'automne fructifie : c'est le moment de la sporée ;
  - l'hiver fait survivre : surface gelée, plus de sucre.
- **Aucune barre de ressources.** Tout se lit dans le décor : les feuilles jaunissent ou flétrissent, le sol se fissure, les cristaux rétrécissent, les filaments pâlissent, le cœur luit plus ou moins fort.
- **Des alliés à la personnalité définie en JSON** (arbres, fourmis, vers, scarabées). Leur confiance n'est jamais affichée : elle se lit dans leurs gestes. Ils échangent, rendent service… et peuvent trahir.
- **Des menaces** :
  - des moisissures rivales, qu'on combat par une guerre chimique alimentée par le signal ;
  - des parasites qui se propagent de nœud en nœud ;
  - sécheresses, inondations, incendies, gels tardifs.
- **La sporée d'automne** : un mini-jeu rythmique dont la justesse décide jusqu'où portent les spores.
- **L'arbre de compétences** (Racines, Chimie, Spores), payé avec la mémoire du réseau.
- **Une campagne de 8 forêts** (tempérée, marais, pinède brûlée, givre, jungle, ruines humaines, caverne, Arbre-Mère), chacune avec sa règle spéciale. Plus un **mode infini** fait de forêts générées à partir d'une graine.
- **8 souvenirs** : de courtes scènes sans dialogue qui racontent la chute de l'ancien royaume.
- **Une musique générative** qui grandit avec le réseau, et des sons organiques synthétisés (gouttes, craquements…).
- **Accessibilité** : volumes séparés, plein écran, mouvements réduits, contraste élevé, aide au rythme, tutoriel désactivable.

## Technique

- **TypeScript** (strict), **Vite**, **Phaser 3**. Pas de backend.
- Rendu en **384×216**, en pixel art, agrandi uniquement par des facteurs entiers.
- Tout le **pixel art est généré par code** à partir d'une palette limitée : sprites en cartes ASCII, décors dessinés.
- **Son en WebAudio pur** (aucun fichier audio).
- Police pixel **Tiny5** (licence SIL OFL 1.1), via `@fontsource/tiny5`.

```bash
npm run build      # vérification des types + build de production dans dist/
npm run preview    # sert le build de production
npm test           # tests Vitest
npm run check      # types + tests
```

Le dossier `dist/` est un site statique, à déposer sur n'importe quel hébergeur (`base: './'`).

### Architecture

```
src/
├── data/      contenu en JSON (forêts, saisons, alliés, menaces, compétences, souvenirs…)
│              et sa validation au chargement
├── entities/  données pures : réseau, alliés, moisissures
├── systems/   simulation pure et testée : flux, sol, saisons, alliés, menaces, climat,
│              rythme, compétences, génération procédurale, profil, séquences
├── scenes/    scènes et vues Phaser : affichage et entrées
├── art/       palette, sprites, décors, textures
├── audio/     moteur WebAudio et direction musicale
└── ui/        barre d'outils, couleurs, mise à l'échelle
```

La simulation (`systems/World.ts`) ne dépend pas de Phaser. Elle est déterministe pour une graine donnée, sérialisable (sauvegarde et reprise à l'identique) et couverte par les tests. Tout le contenu se règle dans `src/data/*.json`, sans toucher au code. Voir `CLAUDE.md` pour le détail des conventions et des systèmes.

### Paramètres de développement (URL)

`?forest=mist-marsh` (ou `endless-5`) · `?memory=the-fire` · `?seed=4` · `?tick=22000` · `?speed=60` · `?event=fire` · `?rival=black-rot` · `?parasite` · `?spores=12` · `?memory=20` · `?auto=3` · `?debug`
