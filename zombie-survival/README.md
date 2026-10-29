# 🧟 Zombie Survival (prototype)

Jeu de stratégie au tour par tour : une communauté de survivants tient un territoire qui grandit et
rétrécit, et décide chaque nuit quels secteurs défendre et lesquels sacrifier.

- Document de design complet : [`DESIGN.md`](DESIGN.md)
- Prototype jouable : ouvrir [`index.html`](index.html) dans un navigateur (un seul fichier, sans dépendance).

## Ce que contient le prototype (section 16 du design)

- Grille 5 × 5 avec brouillard de guerre (on devine seulement « bâtiment ? » ou « obstacle ? »).
- Trois survivants au départ, avec compétence, trait, santé (0 à 3) et moral (0 à 10).
- Trois types de zombies, tous prévisibles :
  - **rôdeur** (●) : suit le bruit (3 cases) et la lumière (2 cases) ;
  - **odorant** (▲) : suit l'odeur (2 cases : réserves du camp, cadavres) ;
  - **aveugle** (■) : marche tout droit et tourne quand il bute.
- Trois défenses : barricade, piège, alarme. Plus le feu de camp, qui rassure mais attire.
- Cycle jour / nuit complet : actions en PA, affectation des gardes, nuit en trois étapes animées
  (déplacements, attaques, bilan), consommation de nourriture.
- Fouille de six types de lieux, exploration avec rencontres, cases perdues qui accumulent des zombies.
- Huit événements du matin (dilemmes, météo, vague de bruit), dont un à conséquence différée.
- Journal des décisions, prévision **exacte** de la nuit à venir, bilan détaillé.
- Deux façons de gagner : tenir 12 nuits, ou contrôler 15 cases à l'aube.

## Choix faits pour le prototype

Le design laisse plusieurs valeurs ouvertes. Celles retenues ici, à rediscuter :

| Sujet | Design | Prototype | Pourquoi |
|---|---|---|---|
| Ressources de départ | 40 / 20 / 15 | 30 nourriture, 14 matériaux, 10 munitions | Garder une pression dès les premiers jours. |
| PA | 4 + 1 par survivant valide | 2 + 1 par survivant valide (santé ≥ 2) | 7 PA rendaient la grille 5 × 5 triviale. |
| Hordes | 2 à 4 par nuit | 1 à 3 par nuit, au plus 3 + nuit/3 sur la carte | Les hordes repoussées restent : sans plafond, la carte saturait. |
| Attaque | « solidité » | attaque = taille × force ; défense = barricade + gardes | Une comparaison lisible en un coup d'œil. |
| Sans source perçue | non précisé | la horde va vers la case du territoire la plus proche | Reste déterministe, donc lisible. |
| Projecteur | défense | remplacé par le feu de camp (lumière au camp) | Garde le dilemme « voir ou être vu » dans le périmètre à 3 défenses. |
| Nuit | tour par tour ou temps réel ? | tour par tour, avec un replay en 3 étapes | Question ouverte n° 1 du design. |

La prévision affiche le résultat exact de la nuit si rien ne change. C'est le pilier « les zombies
sont lisibles » poussé au maximum : à tester, et à atténuer si le jeu devient un simple calcul.

## Équilibrage

```bash
node tools/simulate.js        # 300 parties par stratégie automatique
```

La logique est extraite de `index.html` : on teste exactement ce que joue le navigateur.
Résultats actuels (joueurs automatiques naïfs) :

| Stratégie | Victoires | Nuits tenues (médiane) |
|---|---|---|
| Ne rien faire | 0 % | 7 |
| Défense pure (« tortue ») | 54 % | 12 |
| Défense qui abandonne les cases intenables | 54 % | 12 |
| Expansion | 59 % | 9 |

Deux stratégies différentes gagnent, et l'inaction perd toujours : deux des critères de réussite du
prototype. Les deux autres (comprendre ses pertes, vouloir rejouer) demandent des tests avec de vrais joueurs.

## Développement

`?seed=42` dans l'URL fixe la carte et les tirages.
