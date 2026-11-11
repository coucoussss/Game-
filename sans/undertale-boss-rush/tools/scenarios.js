// Scénarios de test : chaque combat, chaque phase de départ, entrées aléatoires ; puis menus.
exports.run = function (H, which) {
  const { R, frame, K, G, files, rand } = H;
  const log = s => console.log(s);
  let frames = 0;
  const dirs = [K.up, K.down, K.left, K.right];
  function fuzz(n, opts = {}) {
    let dir = [];
    for (let i = 0; i < n; i++) {
      if (i % 14 === 0) dir = rand() < .25 ? [] : [dirs[Math.floor(rand() * 4)]].concat(rand() < .3 ? [dirs[Math.floor(rand() * 4)]] : []);
      const pr = [];
      if (i % 3 === 0 && !opts.noOk) pr.push(K.ok);
      if (opts.menuRand && R('scene == "fight" && fight.state == "menu"') && i % 3 === 0) R('fight.menuSel = ' + (rand() < (opts.atkP || .7) ? 0 : Math.floor(rand() * 4)));
      if (opts.god) R('if (scene == "fight") { P.hp = P.max; P.kr = 0; }');
      frame(pr, dir); frames++;
      if (opts.until && R(opts.until)) return i;
    }
    return n;
  }
  function boot() { R('game_create()'); frame(); }
  const nb = () => R('array_length(bosses)');
  function fightAll(god) {
    boot();
    for (let i = 0; i < nb(); i++) {
      const nph = R(`array_length(rushOpts(bosses[${i}]))`);
      for (let ph = 0; ph < nph; ph++) {
        R(`rushStart(${i}, ${ph})`);
        const name = R(`nm(bosses[${i}])`);
        const seen = new Set(); let turns = 0, lastTurn = -1;
        const n = fuzz(god ? 120000 : 40000, { god, menuRand: true, atkP: god ? .85 : .7, until: 'scene != "fight"' });
        log(`${god ? 'GOD ' : 'MORTEL '} ${name} phase ${ph + 1}: fin=${R('scene')} après ${n} images, tours=${R('fight.turn')}, pv boss=${R('fight.hp')}`);
        if (god && R('scene') === 'fight') { log('  !! combat non terminé (état ' + R('fight.state') + ')'); process.exitCode = 3; }
        // sortir de l'écran de fin
        for (let k = 0; k < 900 && R('scene') !== 'select' && R('scene') !== 'title'; k++) frame(k % 5 === 0 ? [K.back] : (k % 7 === 0 ? [K.ok] : []));
      }
    }
  }
  try {
    if (which === 'all' || which === 'god') fightAll(true);
    if (which === 'all' || which === 'mortal') fightAll(false);
    if ((which === 'all' || which === 'menus') && exports.menus) exports.menus(H, fuzz, boot, log);
    log('OK - ' + frames + ' images simulées, ' + H.drawCalls.n + ' appels de dessin');
  } catch (e) {
    log('ERREUR: ' + e.message);
    log(e.stack.split('\n').slice(1, 8).join('\n'));
    try { log('contexte: scene=' + R('scene') + ' boss=' + R('is_undefined(fight) ? "-" : nm(fight.b)') + ' état=' + R('is_undefined(fight) ? "-" : fight.state') + ' tour=' + R('is_undefined(fight) ? 0 : fight.turn')); } catch (e2) {}
    process.exit(1);
  }
};
