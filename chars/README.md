# 🪖 Front d'Acier

Combat de chars d'assaut en vue de dessus, en équipes de 5 contre 5 face à des IA. Le jeu tourne
entièrement dans le navigateur (HTML5 Canvas et WebGL), sans aucune dépendance. Les chars sont
modélisés en 3D par le code et les sons sont synthétisés en temps réel (Web Audio API).

![Vitrine 3D](captures/1-menu-3d.png)

## Lancer le jeu

Ouvrir `chars/index.html` dans un navigateur récent, au clavier et à la souris.

## Commandes

| Touche | Action |
|---|---|
| Z / S (AZERTY), W / S (QWERTY) ou ↑ / ↓ | Avancer / reculer |
| Q / D (AZERTY), A / D (QWERTY) ou ← / → | Faire pivoter la caisse |
| Souris | Viser (la tourelle tourne à sa propre vitesse) |
| Clic gauche / Espace | Tirer |
| 1 à 5 | Obus AP, APHE, APCR, HEAT, HE (changer d'obus impose de recharger) |
| E | Fumigène (2 par vague) |
| H | Activer ou couper la caméra d'impact |
| M | Couper le son |
| Échap / P | Pause |
| Clic (une fois détruit) | Changer d'allié observé |

## Déroulement

- **5 champs de bataille**, débloqués un à un : Plaine de Koursk, Forêt des Ardennes, Ruines de
  Stalingrad, Désert d'El Alamein et Nuit de Bastogne (de nuit, avec une vision réduite).
- **3 vagues par niveau.** Chaque vague est un combat 5 contre 5 : toi et 4 alliés IA contre 5 chars
  ennemis. On ne réapparaît pas pendant une vague : si tu es détruit, tu observes tes alliés.
- **4 chars**, inspirés de chars réels : Lynx (Luchs), Panthère (Panther), Tigre (Tiger I) et
  Jagd (Jagdpanther, sans tourelle, avec un secteur de tir de ±12°).

## Chars en 3D

Les modèles sont construits par le code (`models.js`) et rendus par un petit moteur WebGL
(`gl3d.js`) : plaques de blindage inclinées, galets entrelacés, chenilles, jupes, frein de bouche,
tourelleau, échappements. Le camouflage trois tons, la boue, les salissures et les éclats de
peinture sont procéduraux. Dans le menu, la vitrine tourne autour du char choisi (à la souris ou au
doigt). Le bouton **Rayons X** montre l'intérieur, chaque module étant nommé :

- l'équipage : des tankistes assis à leur poste, en tenue noire avec calot et casque radio, le pilote
  aux leviers, le tireur aux volants de pointage, le chargeur un obus dans les bras, le chef à ses jumelles ;
- le moteur V12, avec ses bancs de cylindres, ses collecteurs et son volant moteur ;
- la transmission, avec ses freins de direction ;
- les réservoirs ;
- les soutes, avec les obus rangés un par un (douille en laiton, projectile perforant ou explosif) ;
- la culasse, avec ses freins de recul et son volant de pointage. En jeu, les chars vus de dessus sont rendus à partir des mêmes modèles.

## Obus et physique

Chaque char tire des munitions historiques, avec leur masse, leur calibre et leur vitesse initiale réels
(par exemple 7,5 cm PzGr. 39/42 : 6,8 kg à 925 m/s, ou 8,8 cm PzGr. 40/43 : 7,3 kg à 1 130 m/s). Toute la
balistique est dans `ballistics.js`.

| Obus | Effet |
|---|---|
| AP, perforant | Obus plein |
| APHE, perforant explosif (APCBC-HE) | Fusée retardée de 1,3 ms (si le blindage fait au moins 15 mm) : la charge détone dans le char |
| APCR, sous-calibré | Noyau en carbure de tungstène, très rapide et très perforant ; perd vite sa vitesse, ricoche plus facilement, peu d'éclats |
| HEAT, charge creuse | Jet de cuivre à environ 6 500 m/s ; perforation indépendante de la distance, perturbée par les jupes |
| HE, explosif | Faible perforation, mais détonation, onde de choc et éclats d'enveloppe |

Les lois et les modèles utilisés :

- **Traînée de l'air** : v(x) = v0·exp(−ρ·Cd·A·x / 2m). La vitesse des obus diminue avec la distance,
  en jeu comme dans les calculs.
- **Perforation** (formule de de Marre) : P ∝ v^1,43 · m^0,71 / d^1,07, calée sur les valeurs historiques
  (environ 180 mm à 100 m pour le canon du Panther, 160 mm pour celui du Tiger).
- **Obliquité** :
  - normalisation des obus coiffés (environ 5°) ;
  - épaisseur effective T / cos(θ)^n, avec n qui dépend du rapport épaisseur/calibre ;
  - ricochet probabiliste au-delà de l'angle critique ;
  - un calibre plus de trois fois supérieur au blindage ne ricoche pas (surcalibrage).
- **Après perforation** :
  - vitesse résiduelle selon Lambert-Jonas, √(V² − Vlim²) ;
  - sur une plaque mince, arrachement d'un bouchon d'acier (conservation de la quantité de mouvement) ;
  - cône d'éclats d'autant plus large que l'obus perce de justesse, avec des masses selon la loi de Mott ;
  - écaillage de la face interne même sans perforation quand il s'en faut de peu.
- **Trajet dans le char** : le noyau traverse les modules et ralentit dans chacun (épaisseur d'acier
  équivalente). Il peut ressortir de l'autre côté, ricocher sur la paroi ou s'y loger. Chaque éclat est
  suivi en 3D : son énergie (½mv²) fixe les blessures, il traverse ou s'arrête dans les modules et ricoche
  sur les parois quand l'angle est rasant.
- **Charge explosive** :
  - surpression confinée selon Kinney-Graham ;
  - rayon de l'onde de choc selon Sedov-Taylor ;
  - éclats d'enveloppe projetés à la vitesse de Gurney.
- **Charges propulsives** touchées : elles s'enflamment et peuvent faire exploser les munitions (plus
  probable si les soutes sont pleines). Le carburant touché peut aussi s'enflammer.

Le réticule affiche la distance et la pénétration de l'obus chargé à cette distance.

## Modèle de dégâts

- **Pas de points de vie.** Chaque char a des modules internes : équipage (pilote, radio, tireur, chef,
  chargeur), moteur, transmission, culasse, réservoirs, soutes à munitions.
- **Hauteur d'impact** : un obus touche le haut ou le bas de la caisse, la tourelle ou le masque du
  canon, ou bien passe au-dessus.
- **Blindage incliné en 3D**, avec des valeurs réelles approximatives (par exemple, l'avant du Panther
  fait 80 mm à 55°, soit environ 140 mm effectifs). Un obus qui ricoche peut toucher un autre char.
- **Après une perforation**, l'obus et ses éclats sont tracés en 3D à travers les modules.
  - Un équipier tué fait perdre son poste. Un camarade le remplace au bout de 5 s.
  - Un moteur ou une transmission détruits immobilisent le char. La culasse empêche de tirer.
  - Les chargeurs ralentissent le rechargement.
  - Les réservoirs peuvent prendre feu. Une soute peut exploser et arracher la tourelle.
  - L'équipage répare le moteur, la transmission, la culasse et les chenilles.
- Un char est détruit quand ses munitions explosent ou quand il lui reste moins de deux équipiers.
- **Les tirs alliés blessent** : tes obus, ceux des alliés, les ricochets et le souffle des explosifs
  touchent tout le monde.

## Caméra d'impact

Quand ton obus touche un char, le jeu passe au ralenti et une vue 3D aux rayons X reconstitue la
simulation, à son échelle de temps réelle. Le compteur affiche le temps en millisecondes et le facteur de
ralenti (de ×100 à ×1 500). Elle montre :

- l'approche de l'obus, filmée depuis l'arrière : rotation due aux rayures (plusieurs centaines de tours
  par seconde), ceinture de forcement, traceur, cône de Mach ;
- l'éclair d'impact et le trou dans la plaque, allongé selon l'angle, dont le bord refroidit du blanc au rouge ;
- le bouchon arraché, les éclats colorés selon leur température, le trajet du noyau et le jet de charge creuse ;
- la détonation de la charge, la sortie de l'obus de l'autre côté ;
- les modules qui changent de couleur à l'instant exact où ils sont touchés.

Le panneau donne les valeurs physiques : vitesse d'impact, énergie, plaque et angle, épaisseur effective,
pénétration, vitesse limite et résiduelle, masse de la charge, surpression, nombre et masse des éclats.
Le bilan s'affiche au fil des impacts. La touche H désactive la caméra.

![Caméra d'impact](captures/7-impact-detonation-aphe.png)

## Autres éléments de réalisme

- **Les obus ont une vitesse finie** et laissent une traînée lumineuse : on les voit arriver. Un obus qui
  va te toucher est signalé par une trajectoire en pointillés rouges, avec son point d'impact. S'il vient
  de hors de l'écran, une flèche rouge l'indique au bord. Un obus qui te frôle siffle.
- **Dispersion** : elle grandit quand le char roule, pivote ou tourne sa tourelle, puis se resserre à
  l'arrêt (c'est le cercle du réticule).
- **Repérage** : un ennemi n'est visible que si un char de ton équipe le voit. Les bâtiments, les arbres,
  la fumée et la nuit bloquent la vue. Les buissons camouflent, mais tirer te révèle.
- **Décor destructible** : les arbres sont abattus par les obus ou écrasés au passage, et les bâtiments
  s'effondrent en gravats franchissables.

## Interface

La mini-carte est en haut à droite et le fil des destructions en haut à gauche. Le journal des dégâts
subis est en bas à gauche. En bas au centre, le panneau du char montre l'état de l'équipage, des modules,
des obus et du rechargement.

![Combat](captures/3-combat-plaine.png)

## IA

Les chars IA cherchent leur chemin sur une grille (A\*). Ils restent à la distance qui convient à leur
classe et inclinent leur blindage face à l'ennemi. Ils choisissent leur obus selon le blindage de leur
cible, anticipent son mouvement et esquivent les obus. Ils évitent de tirer quand un allié est dans la
ligne de tir (sauf les plus maladroits). Gravement touchés, ils se replient sous un fumigène. Leur
précision, leurs réflexes et leur capacité à esquiver dépendent du niveau.

## Développement

Paramètres d'URL : `?level=3&wave=2&type=heavy` lance directement une vague. `?auto` confie ton char
à l'IA, `?god` rend ton char invulnérable, `?speed=8` accélère la simulation et `?debug` expose
`window.__fa`. Sans WebGL, le jeu se rabat sur un dessin vectoriel simple.
