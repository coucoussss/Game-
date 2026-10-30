# ⚡ Aura Clash

Jeu de combat 3D en **cel-shading**, style anime, pour Windows : 10 combattants originaux (6 de base, 4 à débloquer), 5 arènes,
combats 1 contre 1 ou 2 contre 2, IA, entraînement, et **multijoueur en réseau local** (le serveur est
dans le `.exe`). Les combattants sont des modèles 3D animés en style « chibi » (pack libre KayKit, CC0),
repeints en cel-shading aux couleurs de chacun ; les armes, effets, arènes, musique et bruitages sont générés par code.

> **Technologie : Electron + Three.js.** Choix justifié en une ligne : Electron embarque Node.js, donc le
> serveur LAN (WebSocket + découverte UDP) tient dans le même `.exe` que le jeu, et electron-builder
> produit un exécutable portable unique depuis un simple `npm run build`.

---

## 1. Générer le `.exe` (pas à pas, sous Windows)

1. Installe **Node.js 20 ou plus récent** (version LTS) : <https://nodejs.org>.
2. Copie le dossier `aura-clash` sur ton PC.
3. **Double-clique sur `build.bat`.** Il enchaîne :
   - `npm install` : installe les dépendances ;
   - `npm run build` : assemble le jeu puis crée l'exécutable ;
   - `npm run zip` : prépare l'archive à envoyer.
4. Résultat, dans `release\` :
   - `AuraClash-1.0.0-portable.exe` : **le jeu, en un seul fichier** (aucune installation, aucune dépendance) ;
   - `AuraClash-1.0.0-windows.zip` : le `.exe` + `LISEZMOI.txt` + `firewall.bat`, prêt à partager.

En ligne de commande, c'est équivalent à :

```bat
npm install && npm run build
npm run zip
```

**Envoi par email ou par lien.** Le `.exe` pèse environ 80 Mo. C'est trop pour une pièce jointe classique :
dépose le `.zip` sur un service de partage (Google Drive, OneDrive, WeTransfer…) et envoie le lien.
L'exécutable n'est pas signé. Au premier lancement, Windows SmartScreen peut afficher « Windows a protégé
votre ordinateur » : clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

### Autres commandes

| Commande | Effet |
|---|---|
| `npm start` | Lance le jeu avec Electron, sans créer de `.exe` (développement). |
| `npm run web` | Sert le jeu sur <http://localhost:8080> : on peut jouer dans un navigateur, mais sans pouvoir héberger de partie LAN. |
| `npm test` | Teste le serveur LAN, puis fait jouer 30 matchs complets entre IA (1v1 et 2v2) et une session d'entraînement. |
| `npm run html` | Crée `release/AuraClash.html` : tout le jeu dans un seul fichier HTML (≈ 750 Ko), qui s'ouvre d'un double-clic dans Chrome ou Edge, sans installation ni droits administrateur. On peut y rejoindre une partie LAN, mais pas en créer une. |
| `npm run dist` | `build`, puis `zip`. |

Le `.exe` Windows peut aussi être construit depuis Linux ou macOS. Il faut alors Wine, ou bien
`npm run build:nowine` : le `.exe` produit fonctionne de la même façon, mais sans icône ni métadonnées.

---

## 2. Jouer

### Modes
- **Mode Histoire — *La Légende de l'Éclipse*** : 8 chapitres mis en scène (personnages en 3D,
  plans de caméra, dialogues, effets), chacun suivi d'un combat. Certains chapitres se jouent en 2v2
  avec un allié, le dernier oppose le héros à un boss renforcé. Récompenses : Ryō, et le déblocage
  de Raiden (chap. 3), Garo (chap. 5), Hana (chap. 6) et Yami (chap. 8). On peut rejouer un chapitre.
- **Récits des combattants** : un chapitre par personnage, joué avec lui, ouvert dès qu'il est possédé.
  Le chapitre 8 de l'histoire se termine par un **choix** qui mène à l'une des deux fins.
- **Mode Vagues** : 30 niveaux de 3 à 10 vagues de fléaux, de démons et de monstres, de plus en plus
  forts (voir plus bas). Un boss tous les 5 niveaux, bénédictions entre les vagues, et **mode Infini**
  après le niveau 30.
- **Tutoriel** : 13 étapes guidées, des déplacements à la parade parfaite (+300 Ryō la première fois).
- **Versus contre l'IA**, en 3 niveaux (facile, normal, difficile), et **Versus local** à deux joueurs.
- **2 contre 2** : toi + une IA contre deux IA, deux joueurs ensemble, ou J1 + IA contre J2 + IA.
- **Réseau local (LAN)** : de 2 à 4 joueurs, en 1v1 ou en 2v2. L'IA prend les places libres.
- Ces modes (versus, 2 contre 2, réseau local, entraînement) sont regroupés dans **Combat libre**.
- **Entraînement** : mannequin configurable (immobile, garde, saut, combat), énergie infinie,
  dégâts du dernier combo, liste des coups.
- Chaque combat se joue en **2 manches gagnantes** (best of 3), avec un minuteur réglable (60, 99 ou 150 s).

### Commandes par défaut (modifiables dans Options > Commandes)

| Action | Joueur 1 (clavier) | Joueur 2 (clavier) | Manette Xbox / PlayStation |
|---|---|---|---|
| Se déplacer | Z Q S D (AZERTY) ou W A S D (QWERTY) | Flèches | Stick gauche / croix |
| Sauter | Espace | Pavé 0 | A / ✕ |
| Attaque légère (enchaînement) | J | Pavé 1 | X / ▢ |
| Attaque lourde | K | Pavé 2 | Y / △ |
| Attaque à distance | L | Pavé 3 | B / ◯ |
| Spécial (barre d'énergie) | I | Pavé 5 | RB / R1 |
| Ultime (énergie pleine) | O | Pavé 6 | RT / R2 |
| Garde (maintenir) | U | Pavé 4 | LT / L2 |
| Esquive | Maj gauche | Pavé . | LB / L1 |
| Charger l'énergie (maintenir) | H | Pavé + | L3 / R3 |
| Pause | Échap | Pavé Entrée | Start |

Les touches sont lues par leur **position physique** : la disposition est la même en AZERTY et en QWERTY.
Seul face à l'IA, tous les claviers et toutes les manettes contrôlent ton personnage. À deux, le joueur 1
utilise la première manette branchée, le joueur 2 la seconde. F11 bascule en plein écran.

### Mécaniques
- **Vie, énergie et garde.** Frapper, encaisser ou charger remplit l'énergie. Le spécial coûte 35 à 50 points,
  l'ultime en coûte 100. La garde bloque les coups portés de face, mais sa jauge s'use : à zéro, la garde
  est brisée et le personnage reste étourdi.
- **Combos.** Les attaques légères s'enchaînent (3 ou 4 coups). En fin d'animation, un coup normal peut
  être annulé par un autre coup normal, un spécial ou un ultime. Les dégâts diminuent avec la longueur du combo.
- **Temps de recharge.** Chaque attaque a un temps de recharge proportionnel à sa puissance :
  0,45 s pour l'enchaînement léger, 1 à 2 s pour les attaques lourdes et à distance, 2 à 3,5 s pour les
  spéciaux et 6 à 7,6 s pour les ultimes (0,4 s + 0,02 s par point de dégâts potentiels).
- **Barre des attaques.** En bas de l'écran, une barre par joueur local affiche chaque attaque, la touche ou le
  bouton qui la déclenche (clavier, manette ou tactile), la recharge restante et le manque d'énergie.
- **Esquive.** Elle rend invulnérable un court instant. Celle du ninja est une téléportation : sans
  direction, il réapparaît dans le dos de l'adversaire.
- **Ultimes.** Une cinématique se lance : zoom de caméra, bandes noires, lignes de vitesse, nom du coup.
  À l'impact, un flash et une onomatopée manga apparaissent.
- **K.O.** La dernière frappe passe au ralenti, avec la caméra sur la victime.
- **Parade parfaite.** Lever la garde au tout dernier moment avant un coup l'annule : ralenti, l'attaquant
  vacille, et le coup suivant est une **riposte** (+50 % de dégâts).
- **Poursuite aérienne.** Après un coup qui envoie l'adversaire en l'air, Saut te téléporte à sa hauteur ;
  enchaîne en l'air, puis **Lourd en l'air** : la frappe plongeante le rabat au sol.
- **Aura.** Elle flambe autour du combattant selon son énergie, et chacun a la sienne (flamme, ombre,
  lames, givre, esprits, foudre, pétales, pierre, sang). En charge : sol fissuré, éclairs, débris qui
  lévitent ; au maximum : colonne de lumière et yeux qui brillent. Deux auras embrasées face à face s'entrechoquent.
- **Arènes interactives.** Falaises : piliers destructibles. Temple : lanternes qui explosent. Glacier : sol
  glissant et stalagmites. Toits : zones électrifiées annoncées au sol. Volcan : la lave déborde du bord par vagues.
- **Replays.** Après un combat local, « Revoir le combat » le rejoue (ralenti ×¼ à accéléré ×2, pause).

### Les combattants

| Personnage | Style | Spécial | Ultime |
|---|---|---|---|
| **Kael Arashi**, guerrier à aura | Rafales de ki, uppercut de ki | Transformation (+30 % de dégâts, +20 % de vitesse, cheveux dorés), puis Super sphère de ki | Rayon Dévastateur |
| **Shin Kagerō**, ninja de l'ombre | Shurikens en éventail, esquive-téléportation | Clones de l'ombre | Danse des Mille Ombres |
| **Ren Tsukishiro**, sabreur | Enchaînement de 4 coups, trancheur d'air | Tempête de lames | Lame Céleste |
| **Lyra Vel**, mage de glace et de feu | Boule de feu et éclat de glace en alternance, pic de glace | Tempête élémentaire (zones) | Météore Primordial |
| **Goro Tetsuda**, pugiliste martial | Jabs rapides, charge du taureau (encaisse les coups légers) | Onde de choc au sol | Cent Poings du Dragon |
| **Sora Mikage**, invocatrice | Orbe spirituel à tête chercheuse | Renards-esprits alliés | Dragon Céleste |

**À débloquer dans la boutique :**

| Personnage | Style | Spécial | Ultime | Prix |
|---|---|---|---|---|
| **Raiden Kurogane**, lancier du tonnerre | Lance à longue portée, éclair rapide | Tempête de foudre | Jugement du Tonnerre | 1200 Ryō |
| **Hana Kazemiya**, danseuse du vent | Éventails, lames de vent en éventail | Tornade | Typhon Céleste | 1200 Ryō |
| **Garo le Colosse**, géant de pierre | Poings de roche, rocher lancé, encaisse les coups légers | Séisme | Éruption Titanesque | 1800 Ryō |
| **Yami Kurosaki**, épéiste démoniaque | Lame maudite, orbe à tête chercheuse | Frappe d'ombre | Éclipse Infernale | 2500 Ryō |
| **Akane Hinomura**, prêtresse du soleil | Naginata de feu, braises | Colonnes du soleil | Soleil Levant | 1500 Ryō |
| **Jin Takeda**, moine de fer | Paumes, ondes spirituelles | Cloche de fer | Cloche du Nirvana | 2000 Ryō |

**Techniques alternatives.** Chaque combattant a un second spécial (600 Ryō) et un second ultime avec sa
propre cinématique (1200 Ryō), à débloquer puis à choisir (A ou B) dans **Améliorations**. On y achète aussi
deux **tenues** (ombre, céleste : 400 Ryō chacune) qui changent les couleurs et l'aura.

### Boutique et Ryō
La monnaie du jeu est le **Ryō**. On démarre avec 500 Ryō. Chaque match rapporte : victoire +300,
match nul +180, défaite +120, plus 40 par manche gagnée et 50 de bonus en réseau local. La **Boutique**
(menu principal) montre chaque personnage en 3D avec sa liste de coups. Un personnage acheté est
jouable dans tous les modes. Les personnages verrouillés restent des adversaires possibles pour l'IA.
Le solde et les achats sont enregistrés sur la machine (ou dans le navigateur pour la version web).

### Mode Vagues
On choisit un niveau (débloqué en réussissant le précédent) et un de ses combattants, puis on repousse
les vagues une à une, avec une seule barre de vie. Entre deux vagues, on récupère 35 % de sa vie, un peu
d'énergie et ses temps de recharge ; chaque ennemi abattu rend aussi 5 % de vie (15 % pour un boss).

| Rang | Créatures | Pouvoirs |
|---|---|---|
| Fléau mineur | Larve du Fléau, Goule affamée, Diablotin | faibles, utilisés rarement |
| Démon (dès le niveau 4) | Oni rouge, Démon-lame, Sorcière maudite | séismes, ruées d'ombre, foudre, orbes chercheurs |
| Monstre (dès le niveau 11) | Golem d'ombre, Bête hurlante, Chevalier déchu | piliers de roche, tornades, orages, ultimes |
| Boss (niveaux 5, 10, 15, 20, 25, 30) | Roi des Goules, Shōgun Oni, Impératrice du Fléau, Seigneur Dragon Noir, Titan des Abysses, Roi Fléau | géants, pouvoirs dévastateurs, ultime cinématique |

Chaque niveau a plus de vagues que le précédent, des ennemis plus nombreux, plus résistants et plus
agressifs. À partir du niveau 16, les anciens boss reviennent en élites. Deux ennemis au plus
attaquent en même temps (un seul s'il s'agit d'un démon ou d'un monstre) ; les autres tournent autour et
harcèlent à distance. Le **Bestiaire** décrit chaque créature. Récompense : 100 + 30 × niveau Ryō
(+250 pour un boss), 30 % en rejouant un niveau réussi, 25 Ryō par vague repoussée en cas d'échec.

### Mode Vagues : bénédictions, boss, mode Infini, difficulté
- Après chaque vague, on choisit une **bénédiction** parmi trois (dégâts, vie, vol de vie, explosions,
  bouclier, parade facilitée…) ; elles se cumulent jusqu'à la fin du niveau.
- À la moitié de sa vie, chaque boss entre dans sa **seconde phase** : cinématique, changement d'arène,
  transformation, pouvoir plus dangereux et musique propre.
- **Difficulté** : facile, normale ou cauchemar (vie et dégâts des ennemis, récompenses × 0,7 / × 1 / × 1,6).
- **Mode Infini** (ouvert après le niveau 30) : vagues sans fin, un boss toutes les 10 vagues, tableau des records.

### Musique de combat
Les combats ont un **thème épique** composé pour le jeu (taiko, cordes, cuivres, chœur ; `src/assets/battle-epic.mp3`,
joué en boucle). Les boss gardent leur propre thème. Options > Son > Musique de combat permet de revenir à la
musique de chaque arène.

### Mode Classé
Une échelle de rangs contre l'IA, hors ligne : Bronze, Argent, Or, Platine, Diamant, Maître (3 divisions chacun)
et Légende de l'Aura. Chaque victoire rapporte des Points d'Aura (+20, plus des bonus : manche parfaite,
finish à l'ultime, parades, combo, séries, conditions spéciales) ; une défaite en retire 15 sans jamais faire
descendre de division. 100 points font passer à la division suivante ; la division I pleine ouvre un combat
de promotion (boss pour devenir Maître puis Légende). La première victoire du jour compte double.
- **Récompenses** : Ryō, titres (Combattant, Maître d'armes, Sensei, Légende de l'Aura) et auras exclusives
  (dorée, cristal, flammes noires, arc-en-ciel), à équiper dans l'écran Classé.
- **Conditions spéciales** : au rang Maître, chaque combat en a une (deux en Légende) : adversaire chargé ou
  éveillé, arène de lave, sans améliorations, manches de 45 s.
- **Saisons** : une par mois ; à la fin, un badge selon le meilleur rang atteint et le rang redescend d'un cran.
- **Classement mondial estimé** (le jeu n'a pas de serveur) et **statistiques** : par personnage, records,
  20 derniers combats, courbe de progression.
- **Profil** : pseudo, avatar, niveau de joueur (XP gagnée dans tous les modes), vitrine de 3 succès,
  statistiques, collection et carte de profil à télécharger.

### Défis, galerie, options
- **Défis** : 16 objectifs (victoires, parades, combos, boss, vagues, collection…), chacun récompensé en Ryō.
- **Galerie** : tous les modèles en 3D (les créatures une fois rencontrées), avec poses, expressions,
  aura et ultime, rotation et zoom.
- **Options** : qualité graphique **automatique** (vise 60 images par seconde), commandes tactiles
  réglables (boutons déplaçables, taille, sensibilité, joystick fixe ou flottant) et **code de sauvegarde**
  pour transférer sa progression entre le PC et l'iPad.

### Améliorations
Le menu **Améliorations** permet de renforcer chaque personnage possédé sur 5 axes, de 5 niveaux chacun :

| Axe | Effet par niveau |
|---|---|
| Force | +6 % de dégâts sur toutes les attaques |
| Endurance | +7 % de points de vie |
| Vitesse | +4 % de vitesse de déplacement |
| Ki | +12 % de gain d'énergie (ulti plus fréquent) |
| Maîtrise | −7 % de temps de recharge des attaques |

Coût d'un niveau : 200, 350, 550, 800 puis 1100 Ryō. Les améliorations s'appliquent dans les modes
solo et en local. En réseau local, tout le monde combat à armes égales.

Arènes : Plateau des Falaises, Temple du Crépuscule, Toits de Néo-Kyoto, Glacier Éternel, Cœur du Volcan.

---

## 3. Multijoueur en réseau local

1. Tous les joueurs doivent être sur le **même réseau** : même box, même Wi-Fi, ou même câble.
2. L'hôte ouvre **Réseau local (LAN) > Créer une partie**. Son adresse IP locale s'affiche en grand
   (par exemple `192.168.1.20`).
3. Les autres ouvrent **Réseau local (LAN) > Rejoindre une partie**. La partie apparaît d'elle-même dans
   la liste (découverte automatique). Sinon, ils saisissent l'adresse IP de l'hôte et cliquent sur **Se connecter**.
4. Dans le salon, chacun choisit son personnage et se déclare prêt. L'hôte choisit le mode (1v1 ou 2v2),
   l'arène et le niveau de l'IA, peut changer un joueur d'équipe, puis lance le combat.

### Pare-feu Windows
La première fois qu'on crée ou qu'on rejoint une partie, Windows peut afficher **« Le Pare-feu Windows
a bloqué certaines fonctionnalités de cette application »**. Coche **Réseaux privés**, puis clique sur
**Autoriser l'accès**.

Si la partie reste introuvable ou que la connexion échoue :
- vérifie que le réseau est en profil **Privé** (Paramètres > Réseau et Internet > Propriétés du réseau) ;
- chez l'hôte, fais un clic droit sur **`firewall.bat`**, puis **Exécuter en tant qu'administrateur**. Le script
  ouvre les ports **TCP 41234-41243** (la partie) et **UDP 41235** (la découverte). `firewall.bat /retirer`
  supprime ces règles ;
- test rapide : depuis le PC d'un invité, ouvre `http://IP-DE-L-HÔTE:41234` dans un navigateur. La page
  doit afficher « Aura Clash — serveur LAN actif » ;
- un antivirus doté de son propre pare-feu peut aussi bloquer le jeu : autorise l'application.

### Fonctionnement technique
- **Hôte autoritaire.** Le `.exe` de l'hôte démarre un serveur WebSocket (`electron/lanServer.js`). Ce
  serveur gère le salon, attribue les identifiants et relaie les messages. La fenêtre de l'hôte fait tourner
  la simulation et envoie **30 instantanés par seconde** : positions, états, PV, énergie, projectiles et événements.
- **Découverte.** L'hôte diffuse une balise UDP chaque seconde (`electron/discovery.js`).
- **Synchronisation.** Les invités envoient leurs entrées 60 fois par seconde. Les appuis brefs sont
  cumulés entre deux envois, donc aucun coup n'est perdu.
- **Compensation de latence.** Les autres combattants sont affichés avec un léger retard et interpolés entre
  deux instantanés, environ latence/2 + 50 ms, ce qui reste fluide malgré la gigue. Ton propre personnage
  est **prédit localement** : il bouge tout de suite, puis se recale en douceur sur la position de l'hôte.
  Les sons et les effets sont rejoués au bon moment. La latence s'affiche sous le minuteur.
- Si un invité se déconnecte en plein combat, l'IA reprend son personnage. Si l'hôte quitte la partie,
  les invités reviennent au menu.

---

## 4. Structure du projet

```
aura-clash/
├── package.json          dépendances, scripts npm, configuration electron-builder (cible « portable »)
├── build.bat             construction en un double-clic : install → .exe → .zip
├── firewall.bat          règles du pare-feu Windows (en administrateur)
├── LISEZMOI.txt          guide joueur, inclus dans le .zip
├── electron/             processus principal (Node.js)
│   ├── main.js           fenêtre, IPC, cycle de vie
│   ├── preload.js        pont sécurisé (contextIsolation) exposé à la page : window.auraNative
│   ├── lanServer.js      serveur LAN : salon + relais WebSocket + ping
│   ├── discovery.js      découverte des parties par diffusion UDP
│   └── netUtils.js       adresses IP locales, adresses de diffusion, ports
├── src/                  le jeu (assemblé par esbuild dans dist/game.js)
│   ├── main.js           point d'entrée : boucle, décor des menus, lancement des combats
│   ├── battle.js         déroulement d'un combat : local, hôte ou invité
│   ├── game/             LOGIQUE PURE (sans Three.js, testable sous Node)
│   │   ├── constants.js  pas de simulation, boutons, types de coups
│   │   ├── characters.js les 12 personnages : stats, apparence, coups (données)
│   │   ├── techniques.js spéciaux et ultimes alternatifs, tenues
│   │   ├── hazards.js    règles des arènes interactives
│   │   ├── fighter.js    états, physique, exécution des coups, esquive, garde
│   │   ├── match.js      manches, vagues, coups, projectiles, rayons, zones, invocations, K.O.
│   │   ├── monsters.js   bestiaire du mode Vagues (15 créatures, même format que les combattants)
│   │   ├── waves.js      composition des 30 niveaux, progression de la difficulté, récompenses
│   │   └── ai.js         IA (3 niveaux) et mannequin d'entraînement
│   ├── render/           affichage Three.js
│   │   ├── toon.js       matériaux cel-shading, contours, bruit GLSL
│   │   ├── model.js      modèles dessinés par code (monstres, repli), armes, équipement des skins
│   │   ├── riggedModel.js combattants animés : chargement, reciblage, animations calées sur les coups, couleurs
│   │   ├── aura.js       aura de combat (flammes, éclairs, débris, colonne de lumière)
│   │   ├── hazardView.js affichage des obstacles, de la lave et des zones électriques
│   │   ├── fx.js         particules GPU, ondes de choc, éclairs, rayons, flammes
│   │   ├── arenas.js     les 5 arènes
│   │   ├── camera.js     caméra dynamique, cinématiques, tremblements
│   │   ├── stage.js      moteur de rendu, bloom, ombres
│   │   └── view.js       relie l'état du match aux modèles, aux effets, au son et au HUD
│   ├── net/session.js    client WebSocket, instantanés, interpolation, prédiction
│   ├── replay.js         lecture des replays
│   ├── story/            mode histoire : chapitres, récits des combattants, mise en scène 3D
│   ├── core/             réglages et profil (Ryō, achats, améliorations, histoire), entrées, audio
│   ├── ui/               menus, HUD, calque manga, portraits, écran VS, tutoriel
│   ├── assets/models/    modèles optimisés (.glb) et réglages (config.json, anims/clips.json)
│   ├── index.html
│   └── style.css
└── scripts/              bundle (esbuild), icône, zip, serveur web de test, tests
```

**Ajouter du contenu.** Un personnage ou un coup se définit dans `src/game/characters.js` : chronologie
d'actions (`hit`, `proj`, `beam`, `aoe`, `ring`, `summon`, `warp`…) et apparence (`look`). Une arène s'ajoute
dans `src/render/arenas.js`.

**Modèles 3D.** `npm run fetch-kaykit` télécharge les personnages KayKit dans `models-src/`, puis
`npm run models` produit les `.glb` optimisés (textures WebP, compression meshopt) et `src/assets/models/index.js`.
Chaque combattant a un `config.json` (modèle source, pièces à retirer) ; `anims/clips.json` associe chaque
animation du jeu à un clip de la bibliothèque. On peut aussi déposer un personnage Mixamo (`<id>/<id>.fbx`)
et des animations (`anims/<nom>.fbx`) : le script les convertit, et le jeu recible les animations.
Sans modèle, un combattant garde son modèle dessiné par code.

**Simulation.** Elle tourne à pas fixe (60 ticks par seconde), indépendamment de l'affichage, et sans
dépendance au rendu : c'est ce qui permet à l'hôte de l'exécuter pour tout le monde, et à `npm test` de
jouer des matchs complets sans fenêtre.

## 5. Licence et ressources

Code sous licence MIT. Personnages et animations : *KayKit – Character Pack: Adventurers* de Kay Lousberg
(<https://kaylousberg.itch.io/kaykit-adventurers>), licence CC0. Les textures, effets, musiques et sons
sont générés par le code. Three.js (MIT), Electron (MIT) et ws (MIT) sont les dépendances du jeu.
