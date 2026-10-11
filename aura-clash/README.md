# ⚡ Aura Clash

Jeu de combat 3D en **cel-shading**, style anime, pour Windows : 10 combattants originaux (6 de base, 4 à débloquer), 5 arènes,
combats 1 contre 1 ou 2 contre 2, IA, entraînement, et **multijoueur en réseau local** (le serveur est
dans le `.exe`). Tout est généré par code : modèles low-poly, animations, effets, musique et bruitages.
Aucun fichier sous licence, aucune ressource à télécharger.

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
- **Mode Vagues** : 30 niveaux de 3 à 10 vagues de fléaux, de démons et de monstres, de plus en plus
  forts (voir plus bas). Un boss tous les 5 niveaux.
- **Versus contre l'IA**, en 3 niveaux (facile, normal, difficile), et **Versus local** à deux joueurs.
- **2 contre 2** : toi + une IA contre deux IA, deux joueurs ensemble, ou J1 + IA contre J2 + IA.
- **Réseau local (LAN)** : de 2 à 4 joueurs, en 1v1 ou en 2v2. L'IA prend les places libres.
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
│   │   ├── characters.js les 10 personnages : stats, apparence, coups (données)
│   │   ├── fighter.js    états, physique, exécution des coups, esquive, garde
│   │   ├── match.js      manches, vagues, coups, projectiles, rayons, zones, invocations, K.O.
│   │   ├── monsters.js   bestiaire du mode Vagues (15 créatures, même format que les combattants)
│   │   ├── waves.js      composition des 30 niveaux, progression de la difficulté, récompenses
│   │   └── ai.js         IA (3 niveaux) et mannequin d'entraînement
│   ├── render/           affichage Three.js
│   │   ├── toon.js       matériaux cel-shading, contours, bruit GLSL
│   │   ├── model.js      modèles low-poly, poses, cheveux et vêtements à ressorts, aura
│   │   ├── fx.js         particules GPU, ondes de choc, éclairs, rayons, flammes
│   │   ├── arenas.js     les 5 arènes
│   │   ├── camera.js     caméra dynamique, cinématiques, tremblements
│   │   ├── stage.js      moteur de rendu, bloom, ombres
│   │   └── view.js       relie l'état du match aux modèles, aux effets, au son et au HUD
│   ├── net/session.js    client WebSocket, instantanés, interpolation, prédiction
│   ├── story/            mode histoire : chapitres (données) et mise en scène 3D des dialogues
│   ├── core/             réglages et profil (Ryō, achats, améliorations, histoire), entrées, audio
│   ├── ui/               menus, HUD, calque manga, portraits
│   ├── index.html
│   └── style.css
└── scripts/              bundle (esbuild), icône, zip, serveur web de test, tests
```

**Ajouter du contenu.** Un personnage ou un coup se définit dans `src/game/characters.js` : chronologie
d'actions (`hit`, `proj`, `beam`, `aoe`, `ring`, `summon`, `warp`…) et apparence (`look`). Une arène s'ajoute
dans `src/render/arenas.js`.

**Simulation.** Elle tourne à pas fixe (60 ticks par seconde), indépendamment de l'affichage, et sans
dépendance au rendu : c'est ce qui permet à l'hôte de l'exécuter pour tout le monde, et à `npm test` de
jouer des matchs complets sans fenêtre.

## 5. Licence et ressources

Code sous licence MIT. Aucune ressource externe : les modèles, textures, effets, musiques et sons sont
générés par le code au lancement. Three.js (MIT), Electron (MIT) et ws (MIT) sont les seules dépendances.
