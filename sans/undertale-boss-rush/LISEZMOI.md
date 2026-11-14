# Les vrais fan games : boss rush Sans

Fan game non officiel et non commercial. Projet GameMaker (LTS 2026) : ouvrir `VraisFanGames.yyp`, puis F5.

## Contenu
- 14 adversaires (`datafiles/data.json`), moteur dans `scripts/scr_game/scr_game.gml`.
- Menu : Boss rush, Marathon, Records, Options, Crédits.
- En combat : `P` (ou Échap pendant une attaque) met en pause.
- Sauvegarde : `save.json` (options et records) dans le dossier de sauvegarde du jeu.

## Ce qui est vérifié
- Le projet se charge et se compile dans GameMaker LTS 2026 (cible Linux).
- `--autotest` dans le runner GameMaker : les 31 combats vont au bout, sans plantage (version du 11 nov.).
- `tools/harness.js` (moteur exécuté sous Node) : tous les combats, modes mortel et invincible.
- `tools/test-menus.js` : titre, records, options, crédits, pause, marathon, sauvegarde.

## Ce qui n'est pas vérifié
- Les nouveaux menus, la pause et le marathon n'ont pas été joués au clavier dans GameMaker (seulement compilés, et testés sous Node).
- Le son n'a jamais été écouté. Aucun export Windows n'a été produit depuis ce projet.
- Fidélité des attaques : seuls Dust, Dusttrust et Ink ont un relevé vidéo (`releves/`). Leurs vitesses et durées sont estimées.
  Les autres adversaires n'ont pas été comparés à leur fan game d'origine.
- Aucun nouveau sprite n'a été dessiné : les personnages « dessinés » d'Ink sont des silhouettes.

## Outils
- `tools/harness.js <gml> <datafiles> god|mortal` : banc d'essai.
- `tools/render.js` puis `tools/render-page.js` : images du moteur sans GameMaker (rendu approché).
- `tools/ipv6shim.c` : permet de lancer l'IDE GameMaker sur une machine Linux sans IPv6.
