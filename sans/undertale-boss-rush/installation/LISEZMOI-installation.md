# Installer le boss rush Sans (v4) sur le PC

## Appliquer la v4 à TON projet VraisFanGames (recommandé)
1. Ferme GameMaker.
2. Mets `appliquer-au-projet.ps1` et `VraisFanGames-v4.zip` dans le même dossier.
3. Clic droit sur `appliquer-au-projet.ps1` > « Exécuter avec PowerShell ».
4. Ouvre `VraisFanGames.yyp`, F5.

Le script sauvegarde d'abord `scr_game.gml`, `datafiles\` et `VraisFanGames.yyp` dans
`GameMaker-Projets\sauvegarde-avant-v4-<date>\`, puis remplace le moteur et les données,
et ajoute les nouveaux sprites aux « Included Files ». Pour revenir en arrière, recopie la sauvegarde.

## Méthode rapide (aucune commande)
1. Télécharge `VraisFanGames-v4.zip`.
2. Décompresse-le dans `Documents\GameMaker-Projets\`.
3. Double-clique sur `VraisFanGames-v4\VraisFanGames.yyp`, puis F5 dans GameMaker.

Ton projet d'origine `VraisFanGames` n'est pas modifié : c'est un nouveau projet à côté.

## Méthode automatique
Mets `installer.ps1` (et `VraisFanGames-v4.zip` si tu l'as) dans le même dossier,
puis clic droit sur `installer.ps1` > « Exécuter avec PowerShell ».
Le script crée `GameMaker-Projets\VraisFanGames-v4`, renomme une ancienne copie au lieu de l'écraser,
et ouvre le projet. Sans le zip à côté, il le télécharge depuis GitHub
(ça ne marche que si le dépôt coucoussss/Game- est public).

## Avec une session Claude Code locale
Démarre une session locale dans `Documents\GameMaker-Projets` et donne-lui :

> Lance `installation/installer.ps1` de la branche claude/undertale-boss-rush-repo-xmbjhs
> (dépôt https://github.com/coucoussss/Game-, dossier sans/undertale-boss-rush),
> ou récupère cette branche et copie `sans/undertale-boss-rush` dans `GameMaker-Projets\VraisFanGames-v4`.
> Ouvre ensuite VraisFanGames.yyp dans GameMaker, compile pour Windows et dis-moi s'il y a des erreurs.
