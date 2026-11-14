// Test des écrans ajoutés : titre, records, options, crédits, pause, marathon, sauvegarde.
// usage : node test-menus.js <scr_game.gml> <dossier datafiles>
const H = require('./harness.js');
const { R, frame, K, files } = H;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ECHEC ') + m); if (!c) fails++; };
const press = k => { frame([k]); frame(); };
const run = n => { for (let i = 0; i < n; i++) frame(); };
R('game_create()'); frame();
ok(R('scene') === 'title', 'démarre sur le titre');
// records
press(K.down); press(K.down); press(K.ok); run(5);
ok(R('scene') === 'records', 'écran Records'); press(K.back);
// options : volume, secousses, sauvegarde
press(K.down); press(K.ok); run(5);
ok(R('scene') === 'options', 'écran Options');
press(K.left); press(K.left); ok(R('OPT.vol') === 8, 'volume baissé à 8');
press(K.down); press(K.ok); ok(R('OPT.shake') === false, 'secousses coupées');
ok(typeof files['save.json'] === 'string' && JSON.parse(files['save.json']).opt.vol === 8, 'options écrites dans save.json');
press(K.back);
// crédits
press(K.down); press(K.ok); run(900);
ok(R('scene') === 'credits', 'écran Crédits (900 images de défilement)'); press(K.ok);
ok(R('scene') === 'title', 'retour au titre');
// combat + pause
R('rushStart(0, 0)'); run(10);
frame([K.p]); ok(R('paused') === true, 'pause avec P');
const t0 = R('runT'); run(120); ok(R('runT') === t0, 'le chrono est figé en pause');
press(K.ok); ok(R('paused') === false && R('scene') === 'fight', 'Reprendre');
frame([K.p]); press(K.down); press(K.down); press(K.ok);
ok(R('scene') === 'select', 'Quitter le combat ramène au choix');
// victoire -> record
R('rushStart(0, 0)'); run(30); R('runT = 75; runHits = 3; doThen("finish_kill")'); run(5);
ok(R('scene') === 'win' && R('newRec') === true, 'victoire : nouveau record');
ok(JSON.parse(files['save.json']).rec.BLUEBERRY.wins === 1, 'record écrit dans save.json');
press(K.ok);
// marathon : 2 victoires puis défaite
R('startMarathon()'); run(10); ok(R('marathon') === true && R('fight.i') === 0, 'marathon lancé sur le 1er adversaire');
R('doThen("finish_kill")'); run(5); press(K.ok); run(5);
ok(R('scene') === 'fight' && R('fight.i') === 1, 'victoire : adversaire suivant');
R('doThen("finish_spare")'); run(5); press(K.ok); run(5);
ok(R('fight.i') === 2 && R('maraN') === 2, 'compteur du marathon = 2');
R('P.hp = 0; scene = "lose"'); run(150); press(K.ok); run(5);
ok(R('scene') === 'maraend' && R('marathon') === false, 'défaite : fin du marathon');
ok(JSON.parse(files['save.json']).rec._marathon.n === 2, 'record du marathon écrit');
press(K.ok); ok(R('scene') === 'title', 'retour au titre après le marathon');
// rechargement de la sauvegarde
R('game_create()'); frame();
ok(R('OPT.vol') === 8 && R('OPT.shake') === false && R('recOf("BLUEBERRY").wins') === 2, 'sauvegarde relue au démarrage');
press(K.down); press(K.down); press(K.ok); run(5); ok(R('scene') === 'records', 'Records avec données');
console.log(fails ? `${fails} échec(s)` : 'TOUT PASSE'); process.exit(fails ? 1 : 0);
