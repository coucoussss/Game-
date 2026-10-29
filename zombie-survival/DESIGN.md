# Zombie Survival : document de développement

Version 0.1 (brouillon de travail)

## Sommaire

1. Vision du jeu
2. Boucle de jeu générale
3. Le plateau et le territoire
4. Les zombies
5. Les survivants
6. Les ressources
7. La nuit et les défenses
8. La journée et l'exploration
9. La civilisation et ses paliers
10. Les factions
11. Le moral et la confiance
12. Les événements
13. Progression et fin de partie
14. Interface et retours au joueur
15. Équilibrage : premières valeurs
16. Plan du prototype
17. Questions ouvertes

---

## 1. Vision du jeu

Titre de travail : Zombie Survival (à renommer)

**Résumé en une phrase** : un jeu de stratégie au tour par tour où le joueur bâtit une communauté
survivante autour d'un territoire qui grandit et rétrécit, en décidant chaque nuit quels secteurs
défendre et lesquels sacrifier.

**Pilier 1 : le dilemme permanent.** Il n'existe pas de choix sans perte. Défendre un secteur coûte
des ressources, l'abandonner coûte du territoire, de la population ou du moral. Le joueur doit
toujours accepter une part de sacrifice.

**Pilier 2 : les zombies sont lisibles.** Les zombies ne sont pas aléatoires. Ils suivent le bruit,
la lumière et l'odeur. Le joueur gagne en maîtrise en comprenant leurs déplacements et non en
accumulant de la puissance de feu.

**Pilier 3 : la communauté comme personnage.** Les survivants ont des noms, des traits, des
compétences et un moral. La colonie change d'identité au fil des décisions.

**Public visé** : joueurs de stratégie légère, fans de jeux de gestion post-apocalyptiques
(*This War of Mine* pour le ton, *Frostpunk* pour les choix difficiles, *Into the Breach* pour la
lisibilité).

**Ton** : sobre, humain, pas de gore gratuit. Les pertes doivent peser sans être grotesques.
L'humour est possible mais discret.

**Durée visée d'une partie** : 30 à 60 minutes pour une campagne courte, à partir d'une dizaine de
jours in-game.

## 2. Boucle de jeu générale

Une partie se découpe en **jours**. Chaque jour suit le même cycle :

| Phase | Contenu |
|---|---|
| a) Matin | Bilan de la nuit précédente, rapport des survivants, événements éventuels. |
| b) Journée | Le joueur agit (explorer, fouiller, construire, échanger, réorganiser les survivants). Chaque action consomme des points d'action (PA). |
| c) Préparation | Le joueur assigne les défenses pour la nuit, décide quels secteurs tenir et lesquels abandonner. |
| d) Nuit | Les zombies arrivent par vagues. Résolution automatique selon les défenses et les règles de déplacement. Le joueur observe, sans contrôle direct. |
| e) Bilan | Pertes, gains, moral, consommation de nourriture. |

Le cycle se répète jusqu'à la victoire ou la défaite.

**Points d'action**
- 4 PA par jour au départ.
- Chaque survivant ajoute 1 PA s'il n'est pas blessé.
- Les bâtiments d'infrastructure peuvent en ajouter (voir section 9).

## 3. Le plateau et le territoire

### 3.1 Grille

Le monde est une grille de cases carrées. Le prototype commence sur une grille 5 × 5. La version
complète visera 9 × 9 à 12 × 12, avec des zones spéciales.

Types de cases :
- **Vide** : rien de particulier, traversable.
- **Lieu à fouiller** : supermarché, hôpital, station-service, école, caserne, ferme, etc. Chaque
  type a un profil de ressources.
- **Secteur habité** : case occupée par un campement ou un groupe.
- **Mur / barricade** : construite par le joueur ou naturelle.
- **Obstacle** : voiture, décombres, rivière (franchissable à coût).

### 3.2 Territoire

Le territoire est l'ensemble des cases contrôlées par la colonie. Chaque case contrôlée peut être :
- **Protégée** : défendue activement, avec des défenses.
- **Ouverte** : contrôlée mais non défendue, risque élevé.
- **En friche** : contrôlée sur le papier mais non entretenue.

### 3.3 Frontière

La frontière est l'ensemble des cases du territoire adjacentes à une case non contrôlée. Elle est
le coût central de la défense :
- Chaque segment de frontière protégée coûte des matériaux par nuit.
- Chaque segment de frontière ouverte augmente le risque d'intrusion.
- Un territoire compact a une frontière courte, donc moins coûteuse.

Exemple : un carré 2 × 2 a une frontière de 8 segments. Un rectangle 1 × 4 en a 10. Un territoire
en forme de croix en a beaucoup plus.

### 3.4 Extension

Pour agrandir le territoire, le joueur :
- explore une case voisine (une action de journée) ;
- ou absorbe un campement voisin (condition : moral suffisant, ou accord négocié) ;
- ou reconquiert une case perdue (coût élevé, risque de zombies encore présents).

### 3.5 Rétrécissement

Le joueur peut abandonner volontairement une case :
- Coût immédiat : perte des bâtiments sur la case, moral réduit.
- Gain : frontière réduite, défense moins coûteuse.
- La case abandonnée reste sur la carte. Les zombies s'y accumulent et peuvent se déplacer ensuite.

### 3.6 Cases abandonnées et zombies bloqués

Une case abandonnée accumule des zombies à chaque nuit sans présence. Après un certain seuil, ils se
« dispersent » et deviennent une menace mobile. Un retour sur la case devient donc de plus en plus
risqué. Seuil de base : 3 nuits.

## 4. Les zombies

### 4.1 Principe

Les zombies sont des unités collectives plus que des individus. Ils se déplacent en hordes. Chaque
horde a une taille, un type et une cible.

### 4.2 Types de zombies (prototype : 3 types)

- **Roameur** : le plus commun. Se déplace vers le bruit. Faible en défense, une seule attaque par nuit.
- **Odorant** : suit les odeurs (nourriture, cadavres, feu de camp). Sa trajectoire est plus
  prévisible mais il pénètre les défenses faibles. Moins rapide.
- **Aveugle** : ne suit ni le bruit ni l'odeur. Il avance tout droit et bute contre les obstacles.
  Très résistant, mais facile à détourner s'il rencontre une barricade qu'il contourne mal.

Types à ajouter plus tard :
- **Brute** : massive, ignore une défense sur deux.
- **Coureur** : rapide, arrive avant les autres, mais fragile.
- **Infecté silencieux** : ne fait pas de bruit, mais se déclenche au contact.

### 4.3 Déplacement (règle centrale)

À chaque nuit, chaque horde se déplace d'un nombre de cases égal à son mouvement (1 à 2 cases selon
le type). Le choix de direction dépend de la source de perception la plus forte :

| Source | Origine | Portée |
|---|---|---|
| Bruit | sources émises par le joueur (tirs, construction, alarmes, feux) | 3 cases |
| Lumière | feux et lampes allumés la nuit | 2 cases |
| Odeur | nourriture stockée, cadavres | 2 cases |

Si plusieurs sources sont en portée, la plus forte attire la horde. En cas d'égalité, la horde se divise.

### 4.4 Détournement

Le joueur peut créer une source de bruit ailleurs pour attirer une horde loin de ses défenses. Le
coût est une dépense de munitions ou d'un objet bruyant (klaxon, générateur). La horde se dirige
vers la nouvelle source si elle est plus forte que l'ancienne.

### 4.5 Résolution de l'attaque

Quand une horde atteint une case du territoire :
- Si la case est **protégée** : la défense résiste selon sa solidité. Chaque point de dégât qui
  dépasse la solidité détruit la défense.
- Si la case est **ouverte** : la horde entre. Elle inflige des pertes aux survivants présents et
  aux bâtiments.
- Si la case est **en friche** : elle est envahie et devient abandonnée.

### 4.6 Lisibilité

Le joueur doit toujours voir :
- les hordes sur la carte, avec leur type et leur taille ;
- leur direction probable (flèche pointillée) ;
- la source qui les attire (icône de bruit, lumière, odeur).

Une horde mal comprise est une défaite par manque d'information, pas par malchance. C'est un
principe clé.

## 5. Les survivants

### 5.1 Attributs

Chaque survivant possède :
- Nom et portrait (silhouette simple, pas de visage détaillé au début).
- Âge (adulte, ancien, enfant plus tard).
- Santé : de 0 à 3. À 0, le survivant est mort.
- Moral : de 0 à 10. Influence la productivité et les décisions.
- Compétence principale : une parmi plusieurs (voir 5.2).
- Trait : un parmi plusieurs (voir 5.3).
- Affectation : la tâche qu'il effectue (aucune, défense, fouille, réparation, soin, cuisine, éclaireur).

### 5.2 Compétences

- **Bricolage** : répare plus vite les défenses.
- **Médecine** : soigne et réduit les pertes lors des attaques.
- **Éclaireur** : repère les hordes avant la nuit (information).
- **Combat** : meilleure défense active, moins de pertes en nuit.
- **Négociation** : améliore les troc et les accords avec les groupes.
- **Cuisine** : réduit la consommation de nourriture.

### 5.3 Traits

- **Bricoleur** : bonus à la réparation, malus au moral si inactif.
- **Paranoïaque** : repère les hordes mais refuse de sortir la nuit.
- **Généreux** : partage ses rations, moral collectif en hausse, mais consomme plus.
- **Méfiant** : refuse les troc risqués, réduit les pertes de confiance.
- **Têtu** : refuse les abandons de secteur, moral baisse si l'on abandonne.
- **Idéaliste** : meilleur moral si la colonie soigne ses membres, mais plus sensible aux pertes.

### 5.4 Recrutement

Des survivants rejoignent la colonie de trois façons :
- Rencontre lors d'une fouille ou d'une exploration.
- Accueil d'un groupe ou d'une faction (voir section 10).
- Naissance (plus tard, pour la version complète).

### 5.5 Mort et deuil

La mort d'un survivant :
- Réduit la population et les PA disponibles.
- Fait baisser le moral collectif selon la proximité du défunt (amis, famille, compagnons de patrouille).
- Peut ouvrir un événement de deuil : une veillée, un rituel, ou une décision de l'ignorer. Ces
  choix influencent l'identité de la colonie (section 10).

Principe : la mort doit peser, mais jamais être arbitraire. Un survivant meurt parce qu'il était
exposé, pas parce que le hasard l'a décidé seul.

## 6. Les ressources

### 6.1 Ressources de base

- **Nourriture** : consommée chaque jour, 1 unité par survivant. Un manque entraîne une baisse de
  santé puis de moral.
- **Matériaux** : répare et construit les défenses et les bâtiments.
- **Munitions** : utilisées pour tenir les secteurs la nuit et pour détourner les hordes (bruit).

### 6.2 Ressources secondaires (version complète)

- **Médicaments** : soignent les blessés, réduisent les pertes.
- **Carburant** : nécessaire pour les véhicules et les générateurs.
- **Savoir** : obtenu par les notes, journaux et enregistrements, débloque des améliorations.
- **Confiance** : valeur sociale, obtenue par les accords et l'entraide. Utilisée pour absorber des factions.

### 6.3 Sources

Chaque ressource vient de trois sources principales.

**a) Fouille** : visite d'un lieu lors de la journée. Chaque lieu a un profil :

| Lieu | Profil |
|---|---|
| Supermarché | nourriture élevée, matériaux faibles |
| Hôpital | médicaments élevés, munitions rares |
| Station-service | carburant élevé, matériaux moyens |
| Caserne | munitions élevées, risque élevé |
| École | savoir moyen, matériaux faibles |
| Ferme | nourriture élevée, lente à piller |

Règles de fouille :
- Chaque fouille consomme 1 PA et du temps.
- Un lieu pillé rapporte moins (−25 % par visite précédente).
- Un lieu pillé attire les zombies errants (bruit).

**b) Secteurs perdus** : un secteur tombé laisse derrière lui des ressources. Il faut y retourner,
mais des zombies bloqués peuvent encore s'y trouver.

**c) Échanges** : des groupes de passage proposent des troc. Le prix dépend de la confiance et du
moral de la colonie.

### 6.4 Stockage

Les ressources sont stockées dans les bâtiments. Chaque bâtiment a une capacité. Au-delà, la
ressource se perd (pourriture, vol). Un entrepôt augmente la capacité. Un bâtiment de stockage peut
être attaqué par la faim, les rongeurs ou les pillards.

### 6.5 Équilibre

Principe : aucune ressource ne doit être abondante partout. Le joueur doit toujours choisir ce qu'il
manque le plus.

## 7. La nuit et les défenses

### 7.1 Préparation

Avant la nuit, le joueur :
- assigne un ou plusieurs survivants par secteur protégé ;
- choisit les défenses à activer (barricades, pièges, projecteurs, alarmes) ;
- décide quels secteurs il tient et lesquels il abandonne.

### 7.2 Défenses (prototype)

| Défense | Effet | Coût |
|---|---|---|
| Barricade | solidité 2, résiste aux roameurs | 2 matériaux |
| Piège | solidité 1, tue une partie de la horde | 1 matériau |
| Projecteur | éclaire la case, attire la lumière (et les odeurs-hordes ?) | 1 munition par nuit |
| Alarme | crée une source de bruit, attire les hordes ailleurs | 1 munition |

Note de design : certaines défenses ont des effets contradictoires. Le projecteur protège en
repérant les hordes, mais il les attire aussi. C'est un dilemme voulu.

### 7.3 Déroulement de la nuit

La nuit se résout en trois étapes :
1. Déplacement des hordes (selon les règles de la section 4).
2. Attaques sur les cases atteintes.
3. Consommation des défenses et bilan.

Le joueur ne contrôle pas la nuit, mais il peut voir chaque étape (replay rapide). L'objectif est
que l'échec soit compréhensible.

### 7.4 Vagues spéciales

Certaines nuits sont des vagues particulières :
- **Vague de bruit** : une grande horde est attirée par un événement (incendie, explosion).
- **Vague de faim** : les odeurs dominent, les zombies odorants sont plus nombreux.
- **Nuit sans lune** : la lumière est réduite, les projecteurs deviennent plus importants.

## 8. La journée et l'exploration

### 8.1 Actions disponibles

Chaque action coûte des PA :
- **Explorer** une case voisine (1 PA) : révèle le contenu.
- **Fouiller** un lieu (1 PA) : obtient des ressources.
- **Construire** ou **réparer** (1 à 3 PA selon la défense).
- **Assigner** un survivant (0 PA, mais effet immédiat).
- **Échanger** avec un groupe (1 PA).
- **Abandonner** une case (1 PA, mais conséquences).
- **Soigner** un survivant (1 PA, nécessite médicaments).
- **Parler** à un survivant (1 PA, améliore le moral ou révèle un événement).

### 8.2 Brouillard de guerre

Les cases non explorées sont cachées. Le joueur ne voit que leur type probable, et la carte se
révèle à mesure. Cela renforce le sentiment d'exploration.

### 8.3 Risque d'exploration

Une exploration peut rencontrer :
- rien (la majorité des cas) ;
- des ressources ;
- un survivant à recruter ;
- une horde errante (combat ou fuite) ;
- un groupe hostile (négociation ou affrontement) ;
- un événement narratif.

### 8.4 Fuite

Le joueur peut fuir une rencontre dangereuse. La fuite coûte des ressources ou du moral, mais
permet de conserver les survivants.

## 9. La civilisation et ses paliers

### 9.1 Paliers

La colonie évolue selon des paliers. Chaque palier débloque des institutions et des bâtiments :

| Palier | Seuil | Débloque | Gouvernance |
|---|---|---|---|
| Campement (départ) | 1 à 4 survivants | tente, feu, réserve | décisions prises par le joueur seul |
| Village | 8 survivants, 6 cases contrôlées | conseil, infirmerie, atelier | conseil consultatif (le joueur peut le consulter) |
| Bourg | 15 survivants, 12 cases contrôlées | entrepôt fortifié, école, marché | conseil décisionnel (certaines décisions votées) |
| Cité | 25 survivants, 20 cases contrôlées | institutions avancées (justice, défense organisée) | systèmes complexes, factions internes |

### 9.2 Institutions

- **Conseil** : améliore la qualité des décisions (moins de mauvais tirages sur les événements).
  Coût : 1 nourriture par jour.
- **Infirmerie** : réduit les pertes de santé. Coût : médicaments.
- **Atelier** : répare plus vite. Coût : matériaux et temps.
- **Entrepôt** : augmente la capacité de stockage.
- **École** : permet de transmettre les compétences (plus tard).
- **Marché** : facilite les échanges, améliore les prix.
- **Justice** : gère les conflits internes, sanctionne ou pardonne.

### 9.3 Entretien

Chaque institution a un coût d'entretien quotidien. Plus la colonie grandit, plus il faut produire
pour tenir. Un bourg mal nourri peut régresser de palier.

### 9.4 Régression

Si la colonie tombe sous le seuil d'un palier pendant plusieurs jours, elle régresse. Les
institutions de ce palier sont suspendues.

## 10. Les factions

### 10.1 Principe

Les factions sont des groupes de survivants qui existent sur la carte. Le joueur peut les
rencontrer, négocier avec eux, les absorber ou les combattre.

### 10.2 Types de factions (prototype : 3)

- **Le groupe militaire** : défense forte, moral qui baisse si la colonie est pacifiste. Apporte
  munitions et protection.
- **Les soignants** : infirmerie améliorée, moral en hausse. Apportent médicaments et confiance,
  mais demandent une part de nourriture.
- **Les marchands** : meilleurs échanges, mais réclament des contreparties et peuvent se retourner.

### 10.3 Absorption

Une faction absorbée :
- ajoute du territoire et des survivants ;
- apporte ses valeurs (militarisme, soin, commerce) ;
- modifie l'identité de la colonie.

Conditions d'absorption : confiance suffisante, accord négocié, ou soumission par la force (coût
élevé, moral en baisse).

### 10.4 Identité de la colonie

L'identité se construit sur les décisions. Par exemple :
- Une colonie militaire renforce ses défenses mais pèse sur le moral.
- Une colonie soignante a une meilleure santé mais des défenses plus faibles.
- Une colonie marchande prospère, mais peut se retrouver liée à des groupes instables.

L'identité débloque des événements et des fins différentes.

## 11. Le moral et la confiance

### 11.1 Moral individuel

Chaque survivant a un moral de 0 à 10.

Il baisse avec : la faim ; les pertes proches (amis, famille) ; les abandons de secteur ; la nuit
sous attaque.

Il monte avec : un repas partagé ; une victoire sur une horde ; un soin réussi ; une décision
respectée (sondage, conseil).

### 11.2 Moral collectif

Le moral collectif est la moyenne pondérée des moraux individuels. Il influence :
- la productivité (au-dessous de 4, malus d'action) ;
- la probabilité d'événements négatifs (désertion, dispute) ;
- la réussite des négociations.

### 11.3 Confiance

La confiance est une valeur externe, entre la colonie et les autres groupes. Elle monte avec les
échanges honnêtes et baisse avec les trahisons, les refus d'aide ou les abandons de groupes alliés.

## 12. Les événements

### 12.1 Types d'événements

- **Narratifs** : rencontre, dilemme moral, histoire d'un survivant.
- **Environnementaux** : pluie, froid, incendie, épidémie.
- **De faction** : une faction demande, propose, menace.
- **De personnage** : un survivant pose une question, demande une décision personnelle.

### 12.2 Dilemmes

Un dilemme présente deux ou trois choix, avec des conséquences visibles et parfois différées.

Exemple : « Un enfant s'est perdu dans le secteur nord. Une horde rôde entre vous et lui. »
- Choix A : envoyer deux survivants à risque (−1 santé possible, +moral si réussi).
- Choix B : sacrifier le secteur nord pour sécuriser le reste (−territoire, +frontière réduite).
- Choix C : tenter un détournement avec une alarme (coût munitions, résultat incertain).

### 12.3 Conséquences différées

Certains choix ne produisent leurs effets que plusieurs jours après. Le joueur doit pouvoir s'en
souvenir grâce à un journal des décisions.

## 13. Progression et fin de partie

### 13.1 Objectifs

Chaque partie a un objectif :
- **Survie** : tenir jusqu'à un certain jour (ex. jour 30).
- **Expansion** : atteindre un territoire cible (ex. 25 cases).
- **Communauté** : atteindre le palier Cité avec une identité donnée.
- **Enquête** (version complète) : découvrir la cause de l'épidémie.

### 13.2 Défaite

La partie se termine si :
- la colonie est réduite à 0 survivant ;
- la colonie régresse au palier campement pour plus de 5 jours ;
- le joueur abandonne son dernier secteur protégé.

### 13.3 Méta-progression (version complète)

Entre les parties, le joueur débloque : nouveaux types de survivants ; nouvelles défenses ; nouveaux
lieux de départ ; des fragments de l'histoire de l'épidémie.

## 14. Interface et retours au joueur

### 14.1 Écrans principaux

- **Carte** : grille avec territoire, hordes, lieux, survivants.
- **Colonie** : liste des survivants, moral, santé, affectation.
- **Ressources** : stock, consommation prévue, production.
- **Journal** : décisions récentes et conséquences à venir.

### 14.2 Retours clairs

Chaque action doit montrer son effet :
- un coût (en PA et en ressources) avant de valider ;
- une prévision (ex. « cette nuit, 6 roameurs depuis le nord ») ;
- un résumé après la nuit (« 2 barricades détruites, 1 survivant blessé, 3 zombies tués »).

### 14.3 Accessibilité

- Texte lisible, contraste suffisant.
- Possibilité de réduire les animations.
- Pas de dépendance à la couleur seule (formes et icônes en plus).

## 15. Équilibrage : premières valeurs

Valeurs de départ pour le prototype (à tester et ajuster).

**Joueur** : 3 survivants au départ ; 40 nourriture, 20 matériaux, 15 munitions ; 4 PA par jour.

**Consommation** : 1 nourriture par survivant et par jour ; barricade : 2 matériaux ; piège :
1 matériau ; alarme : 1 munition.

**Zombies**

| Type | Mouvement | Solidité d'attaque | Particularité |
|---|---|---|---|
| Roameur | 1 | 1 | |
| Odorant | 1 | 2 | sensible aux odeurs |
| Aveugle | 1 | 3 | aveugle au bruit |

**Hordes** : 2 à 4 hordes par nuit au départ ; une horde par jour supplémentaire après le jour 5.

Ces valeurs sont des hypothèses. Le prototype doit servir à les confirmer ou les corriger.

## 16. Plan du prototype

**Objectif** : valider la boucle « défendre ou sacrifier » avant tout contenu supplémentaire.

**Périmètre du prototype**
- Grille 5 × 5.
- 3 types de zombies (roameur, odorant, aveugle).
- 3 défenses (barricade, piège, alarme).
- 3 survivants.
- Une ressource unique à compter en plus de la nourriture et des matériaux (munitions).
- Un cycle jour / nuit complet, sans factions.
- Pas de sauvegarde, pas de son, pas d'art final.

**Technologie** : HTML, CSS et JavaScript simple, dans un seul fichier.

**Critères de réussite du prototype**
- Le joueur comprend pourquoi il perd une case.
- Au moins deux stratégies différentes gagnent.
- Une partie dure entre 10 et 15 minutes.
- Le joueur veut relancer une partie après la première défaite.

**Étapes**
1. Afficher la grille et le territoire.
2. Implémenter le déplacement des hordes selon le bruit et l'odeur.
3. Implémenter les défenses et la résolution des attaques.
4. Ajouter le cycle jour / nuit et la consommation.
5. Ajouter la fouille et l'exploration.
6. Ajouter le bilan de nuit et le journal.
7. Tester et équilibrer.

## 17. Questions ouvertes

- Le jeu doit-il être en tour par tour pur, ou avec un temps réel pendant la nuit ?
- Le projecteur doit-il attirer les zombies, ou seulement les révéler ? (choix actuel : les deux,
  pour créer le dilemme)
- Les factions doivent-elles être visibles dès le départ, ou découvertes au fil de l'exploration ?
- Faut-il un système de sauvegarde dès le prototype ?
- Quelle est la place du narratif : textes courts, dialogues, ou événements purement mécaniques ?
- Le nom de la colonie doit-il être choisi par le joueur ?
- Faut-il une version 2D pixel art ou une version vectorielle simple pour le prototype ?
- La fin doit-elle être unique, ou dépendre de l'identité de la colonie ?
