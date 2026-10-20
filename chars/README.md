# 🪖 Front d'Acier

Combat de chars d'assaut en vue de dessus, en équipes de 5 contre 5 face à des IA. Le jeu tourne
entièrement dans le navigateur (HTML5 Canvas), sans aucune dépendance. Les sons sont synthétisés en
temps réel avec la Web Audio API.

## Lancer le jeu

Ouvrir `chars/index.html` dans un navigateur récent, au clavier et à la souris.

## Commandes

| Touche | Action |
|---|---|
| Z / S (AZERTY), W / S (QWERTY) ou ↑ / ↓ | Avancer / reculer |
| Q / D (AZERTY), A / D (QWERTY) ou ← / → | Faire pivoter la caisse |
| Souris | Viser (la tourelle tourne à sa propre vitesse) |
| Clic gauche / Espace | Tirer |
| 1 / 2 | Obus perforant / obus explosif (changer d'obus impose de recharger) |
| E | Fumigène (2 par vague) |
| M | Couper le son |
| Échap / P | Pause |
| Clic (une fois détruit) | Changer d'allié observé |

## Déroulement

- **5 champs de bataille**, débloqués un à un : Plaine de Koursk, Forêt des Ardennes, Ruines de
  Stalingrad, Désert d'El Alamein et Nuit de Bastogne (de nuit, avec une vision réduite).
- **3 vagues par niveau.** Chaque vague est un combat 5 contre 5 : toi et 4 alliés IA contre 5 chars
  ennemis. On ne réapparaît pas pendant une vague : si tu es détruit, tu observes tes alliés.
  La vague est gagnée quand tous les ennemis sont détruits. Si ton équipe est anéantie, tu la recommences.
- À chaque vague, les ennemis sont plus lourds et plus précis. Les alliés progressent aussi d'un niveau à l'autre.
- **4 chars** au choix : Lynx (léger), Panthère (moyen), Tigre (lourd) et Jagd (chasseur de chars,
  sans tourelle, avec un secteur de tir de ±12°).

## Réalisme

- **Les obus ont une vitesse finie** et laissent une traînée lumineuse : on les voit arriver. Un obus qui
  va te toucher est signalé par une trajectoire en pointillés rouges, avec son point d'impact. S'il vient
  de hors de l'écran, une flèche rouge l'indique au bord. Recule ou avance pour l'éviter. Un obus qui te
  frôle siffle.
- **Les tirs alliés blessent** : tes obus, ceux des alliés, les ricochets et le souffle des explosifs
  touchent tout le monde. La moindre erreur de tir peut toucher un allié, ce qui coûte des points.
- **Blindage directionnel** (avant, flancs, arrière) et angle d'impact : le blindage effectif vaut
  épaisseur / cos(angle). Au-delà de 70°, l'obus ricoche et peut toucher quelqu'un d'autre.
  La pénétration varie de ±15 %.
- **Dégâts de modules** : un tir dans les flancs peut casser une chenille (immobilisation), un tir dans
  l'arrière peut mettre le feu au moteur. Il arrive aussi qu'une soute à munitions explose.
- **Dispersion** : elle grandit quand le char roule, pivote ou tourne sa tourelle, puis se resserre à
  l'arrêt (c'est le cercle du réticule).
- **Repérage** : un ennemi n'est visible que si un char de ton équipe le voit. Les bâtiments, les arbres,
  la fumée et la nuit bloquent la vue. Les buissons camouflent, mais tirer te révèle.
- **Décor destructible** : les arbres sont abattus par les obus ou écrasés au passage, et les bâtiments
  s'effondrent en gravats franchissables. Les traces de chenilles et les cratères restent au sol.

## IA

Les chars IA cherchent leur chemin sur une grille (A\*). Ils restent à la distance qui convient à leur
classe, inclinent leur blindage face à l'ennemi, anticipent le mouvement de leur cible et esquivent les
obus. Ils évitent de tirer quand un allié est dans la ligne de tir (sauf les plus maladroits) et lancent
un fumigène pour se replier quand ils sont gravement touchés. Leur précision, leurs réflexes et leur
capacité à esquiver dépendent du niveau.

## Développement

Paramètres d'URL : `?level=3&wave=2&type=heavy` lance directement une vague. `?auto` confie ton char
à l'IA, `?god` rend ton char invulnérable, `?speed=8` accélère la simulation et `?debug` expose
`window.__fa`.
