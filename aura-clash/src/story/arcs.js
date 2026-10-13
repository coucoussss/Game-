// Récits des combattants : un chapitre par personnage, joué avec lui (le héros n'est plus Kael).
// Ouverts dès que le personnage est possédé. Même format que chapters.js, plus `hero`.

export const ARCS = [
  {
    id: 'arc-kael', hero: 'kael', title: 'Le poids de l’aura', kanji: '気', arena: 'cliffs',
    cast: ['kael', 'goro'],
    intro: [
      { who: null, text: 'Bien avant l’Éclipse, un garçon s’entraînait seul face au vent des falaises.', shot: 'wide' },
      { who: 'goro', text: 'Ton aura est immense, gamin. Mais une aura qu’on ne contrôle pas brûle d’abord son porteur.', pose: 'guard', shot: 'close' },
      { who: 'kael', text: 'Alors apprends-moi, maître Goro !', pose: 'charge', shot: 'low', fx: 'aura' },
      { who: 'goro', text: 'On n’apprend qu’en se battant. Viens !', pose: 'attack', shot: 'two', fx: 'flash' },
    ],
    fight: { enemies: [{ charId: 'goro', level: 'normal' }] },
    outro: [
      { who: 'goro', text: 'Tu as retenu ta puissance au dernier moment. C’est ça, la maîtrise.', pose: 'hurt', shot: 'close' },
      { who: 'kael', text: 'Je crois que j’ai compris. L’aura, ce n’est pas une explosion… c’est une promesse.', pose: 'victory', shot: 'low', fx: 'aura' },
    ],
    reward: { ryo: 300 },
  },
  {
    id: 'arc-kage', hero: 'kage', title: 'Le clan sans nom', kanji: '忍', arena: 'neon',
    cast: ['kage', 'demon-lame'],
    intro: [
      { who: null, text: 'Néo-Kyoto, sous la pluie. Shin traque l’assassin qui a décimé son clan.', shot: 'wide', fx: 'dark' },
      { who: 'kage', text: 'Ce sabre… c’est celui de mon maître. Comment l’as-tu obtenu ?', pose: 'guard', shot: 'close' },
      { who: 'demon-lame', text: 'Ton maître me l’a offert… avec son âme.', pose: 'attack', shot: 'low', fx: 'shake' },
      { who: 'kage', text: 'Alors je viens les reprendre. Les deux.', pose: 'charge', shot: 'close', fx: 'aura' },
    ],
    fight: { enemies: [{ charId: 'demon-lame', level: 'normal', mods: { hp: 1.6 } }] },
    outro: [
      { who: null, text: 'Le démon se dissout en cendres. Le sabre tombe sur le toit mouillé.', shot: 'wide', vanish: { who: 'demon-lame', style: 'ash' } },
      { who: 'kage', text: 'Repose en paix, maître. Ton ombre veillera encore sur cette ville.', pose: 'idle', shot: 'close' },
    ],
    reward: { ryo: 300 },
  },
  {
    id: 'arc-ren', hero: 'ren', title: 'La lame et la lune', kanji: '月', arena: 'temple',
    cast: ['ren', 'yami'],
    intro: [
      { who: null, text: 'Il y a dix ans, deux élèves du même dojo s’affrontaient sous la pleine lune.', shot: 'wide' },
      { who: 'yami', text: 'Ren… ton sabre est trop honnête. Il ne coupera jamais ce qui compte.', pose: 'idle', shot: 'close', fx: 'dark' },
      { who: 'ren', text: 'Et le tien a soif, Yami. Je le sens d’ici. Lâche-le !', pose: 'guard', shot: 'close' },
      { who: 'yami', text: 'Prends-le-moi, si tu en es capable.', pose: 'attack', shot: 'two', fx: 'flash' },
    ],
    fight: { enemies: [{ charId: 'yami', level: 'normal' }] },
    outro: [
      { who: 'ren', text: 'Je n’ai pas pu te sauver ce soir-là. Mais un jour, je briserai cette lame.', pose: 'hurt', shot: 'close' },
      { who: null, text: 'Ce jour viendra, bien des années plus tard, au Cœur du Volcan.', shot: 'wide' },
    ],
    reward: { ryo: 300 },
  },
  {
    id: 'arc-lyra', hero: 'lyra', title: 'Glace et braise', kanji: '炎', arena: 'glacier',
    cast: ['lyra', 'sorciere'],
    intro: [
      { who: null, text: 'Glacier Éternel. Une sorcière vole la chaleur des villages pour nourrir sa malédiction.', shot: 'wide' },
      { who: 'sorciere', text: 'Une mage qui porte la glace et le feu… Ton cœur doit être si tiède.', pose: 'powerup', shot: 'close', fx: 'dark' },
      { who: 'lyra', text: 'Mon cœur brûle assez pour faire fondre ta malédiction. Rends la chaleur aux villages !', pose: 'charge', shot: 'low', fx: 'aura' },
    ],
    fight: { enemies: [{ charId: 'sorciere', level: 'normal', mods: { hp: 1.7 } }] },
    outro: [
      { who: null, text: 'La glace se fend. Une vague de chaleur dévale la montagne vers les villages.', shot: 'wide', fx: 'flash' },
      { who: 'lyra', text: 'Le froid et le feu ne sont pas ennemis. Il suffit de savoir les tenir dans la même main.', pose: 'victory', shot: 'close' },
    ],
    reward: { ryo: 300 },
  },
  {
    id: 'arc-goro', hero: 'goro', title: 'Le dernier tournoi', kanji: '拳', arena: 'volcano',
    cast: ['goro', 'garo'],
    intro: [
      { who: null, text: 'Cœur du Volcan. Le tournoi des poings légendaires, celui qu’on ne dispute qu’une fois par vie.', shot: 'wide' },
      { who: 'garo', text: 'Goro. Il y a trente ans, tu m’as battu ici. J’ai attendu ce jour.', pose: 'powerup', shot: 'low', fx: 'shake' },
      { who: 'goro', text: 'Et moi, j’ai attendu un adversaire digne de ce nom. Montre-moi la montagne !', pose: 'charge', shot: 'close', fx: 'aura' },
    ],
    fight: { enemies: [{ charId: 'garo', level: 'hard' }] },
    outro: [
      { who: 'garo', text: 'Encore toi… Tes poings sont toujours aussi lourds, vieux frère.', pose: 'hurt', shot: 'close' },
      { who: 'goro', text: 'Dans trente ans, on recommence. Promis ?', pose: 'victory', shot: 'two' },
    ],
    reward: { ryo: 300 },
  },
  {
    id: 'arc-sora', hero: 'sora', title: 'Les esprits égarés', kanji: '霊', arena: 'temple',
    cast: ['sora', 'goule'],
    intro: [
      { who: null, text: 'La nuit, des goules errent autour du temple. Les esprits des morts ne trouvent plus le repos.', shot: 'wide', fx: 'dark' },
      { who: 'sora', text: 'Ce ne sont pas des monstres… ce sont des âmes perdues. Je vais les guider.', pose: 'charge', shot: 'close', fx: 'aura' },
      { who: 'goule', text: 'Faim… faim…', pose: 'attack', shot: 'low', fx: 'shake' },
    ],
    fight: { enemies: [{ charId: 'goule', level: 'normal', mods: { hp: 1.5 } }, { charId: 'goule', level: 'easy' }] },
    outro: [
      { who: null, text: 'Des lucioles s’élèvent des corps immobiles et disparaissent dans le ciel.', shot: 'wide', vanish: { who: 'goule', style: 'fireflies' } },
      { who: 'sora', text: 'Allez en paix. Les renards du temple vous montreront le chemin.', pose: 'victory', shot: 'close' },
    ],
    reward: { ryo: 300 },
  },
  {
    id: 'arc-raiden', hero: 'raiden', title: 'Le serment du tonnerre', kanji: '雷', arena: 'cliffs',
    cast: ['raiden', 'chevalier'],
    intro: [
      { who: null, text: 'Un chevalier tombé au combat revient hanter le plateau où il a prêté serment.', shot: 'wide', fx: 'dark' },
      { who: 'chevalier', text: 'Raiden… nous avions juré de protéger ces terres. Tu m’as laissé mourir.', pose: 'idle', shot: 'close' },
      { who: 'raiden', text: 'Je suis arrivé trop tard. Laisse-moi tenir mon serment maintenant : je vais te libérer.', pose: 'guard', shot: 'close', fx: 'flash' },
    ],
    fight: { enemies: [{ charId: 'chevalier', level: 'normal' }] },
    outro: [
      { who: 'chevalier', text: 'Ta foudre… est toujours aussi pure. Merci, frère d’armes.', pose: 'ko', shot: 'close', fx: 'flash' },
      { who: 'raiden', text: 'Repose-toi. Je protégerai ces terres pour nous deux.', pose: 'victory', shot: 'low', fx: 'aura' },
    ],
    reward: { ryo: 300 },
  },
  {
    id: 'arc-hana', hero: 'hana', title: 'La danse interdite', kanji: '舞', arena: 'temple',
    cast: ['hana', 'imperatrice'],
    intro: [
      { who: null, text: 'Une danse ancienne peut réveiller la reine des malédictions. Quelqu’un l’a dansée.', shot: 'wide', fx: 'dark' },
      { who: 'imperatrice', text: 'Une danseuse ? Parfait. Danse pour moi jusqu’à ce que tes pieds saignent.', pose: 'powerup', shot: 'low', fx: 'aura' },
      { who: 'hana', text: 'Je danse pour le vent, pas pour toi. Et le vent va te renvoyer dans ton tombeau !', pose: 'charge', shot: 'close', fx: 'aura' },
    ],
    fight: { boss: true, enemies: [{ charId: 'imperatrice', level: 'normal', mods: { hp: 0.8 } }] },
    outro: [
      { who: null, text: 'La reine se dissout dans un tourbillon de pétales.', shot: 'wide', vanish: { who: 'imperatrice', style: 'petals' } },
      { who: 'hana', text: 'Cette danse, je l’ai finie à ma façon. Elle ne réveillera plus jamais personne.', pose: 'victory', shot: 'close' },
    ],
    reward: { ryo: 400 },
  },
  {
    id: 'arc-garo', hero: 'garo', title: 'La montagne qui marche', kanji: '岩', arena: 'glacier',
    cast: ['garo', 'golem'],
    intro: [
      { who: null, text: 'Un golem d’ombre écrase les villages de montagne. On dit qu’il est fait de la même pierre que Garo.', shot: 'wide' },
      { who: 'golem', text: '…', pose: 'idle', shot: 'low', fx: 'shake' },
      { who: 'garo', text: 'Tu es né de la même roche que moi. Mais une montagne ne détruit pas ceux qu’elle abrite !', pose: 'powerup', shot: 'close', fx: 'aura' },
    ],
    fight: { enemies: [{ charId: 'golem', level: 'normal', mods: { hp: 1.3 } }] },
    outro: [
      { who: null, text: 'Le golem s’effondre en un tas de pierres paisibles.', shot: 'wide', vanish: { who: 'golem', style: 'stone' } },
      { who: 'garo', text: 'Dors, petit frère. Je bâtirai un abri avec tes pierres.', pose: 'idle', shot: 'close' },
    ],
    reward: { ryo: 300 },
  },
  {
    id: 'arc-yami', hero: 'yami', title: 'Briser la lame', kanji: '魔', arena: 'volcano',
    cast: ['yami', 'roi-fleau'],
    intro: [
      { who: null, text: 'Après l’Éclipse, Yami part seul trouver la source du mal qui habitait son sabre.', shot: 'wide', fx: 'dark' },
      { who: 'roi-fleau', text: 'Mon serviteur revient. Tu as échoué, Yami. Rends-moi ton âme.', pose: 'powerup', shot: 'low', fx: 'aura' },
      { who: 'yami', text: 'Je ne suis plus ton serviteur. Cette fois, c’est moi qui viens dévorer quelque chose.', pose: 'charge', shot: 'close', fx: 'aura' },
    ],
    fight: { boss: true, enemies: [{ charId: 'roi-fleau', level: 'normal', mods: { hp: 0.6, dmg: 0.8 } }] },
    outro: [
      { who: 'roi-fleau', text: 'Cette… lumière… dans ta lame…', pose: 'ko', shot: 'close', fx: 'flash' },
      { who: 'yami', text: 'C’est celle que Kael m’a rendue. Disparais.', pose: 'victory', shot: 'low', fx: 'impact' },
    ],
    reward: { ryo: 500 },
  },
  {
    id: 'arc-akane', hero: 'akane', title: 'L’aube du temple', kanji: '陽', arena: 'temple',
    cast: ['akane', 'shogun-oni'],
    intro: [
      { who: null, text: 'Le shōgun des démons assiège le temple du Soleil. Akane est la dernière gardienne.', shot: 'wide', fx: 'dark' },
      { who: 'shogun-oni', text: 'Une prêtresse seule contre mon armée ? Rends-toi, et le temple sera épargné.', pose: 'idle', shot: 'low' },
      { who: 'akane', text: 'Le soleil ne se rend jamais. Il se lève, chaque matin. Comme moi.', pose: 'charge', shot: 'close', fx: 'aura' },
    ],
    fight: { boss: true, enemies: [{ charId: 'shogun-oni', level: 'normal', mods: { hp: 0.75 } }] },
    outro: [
      { who: null, text: 'L’aube se lève sur le temple. L’armée des démons fond comme la neige.', shot: 'wide', vanish: { who: 'shogun-oni', style: 'light' } },
      { who: 'akane', text: 'Tant qu’une flamme brûle ici, aucune nuit ne durera.', pose: 'victory', shot: 'close' },
    ],
    reward: { ryo: 400 },
  },
  {
    id: 'arc-jin', hero: 'jin', title: 'Le vœu de fer', kanji: '鉄', arena: 'cliffs',
    cast: ['jin', 'oni'],
    intro: [
      { who: null, text: 'Jin a fait vœu de ne plus jamais frapper le premier. Un oni met ce vœu à l’épreuve.', shot: 'wide' },
      { who: 'oni', text: 'Frappe-moi, moine ! Ou je réduis ton monastère en poussière !', pose: 'attack', shot: 'low', fx: 'shake' },
      { who: 'jin', text: 'Je ne frapperai pas le premier. Mais je ne reculerai pas non plus.', pose: 'guard', shot: 'close', fx: 'aura' },
    ],
    fight: { enemies: [{ charId: 'oni', level: 'normal', mods: { hp: 1.6 } }] },
    outro: [
      { who: 'oni', text: 'Tu… n’as fait que rendre mes coups. Et pourtant je suis à terre.', pose: 'hurt', shot: 'close' },
      { who: 'jin', text: 'La cloche ne sonne que lorsqu’on la frappe. Va en paix, et ne reviens pas.', pose: 'victory', shot: 'two' },
    ],
    reward: { ryo: 300 },
  },
];
