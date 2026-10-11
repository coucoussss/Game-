// Mode histoire : « La Légende de l'Éclipse ».
// Yami, un épéiste maudit, vole l'aura des grands combattants pour réveiller l'Éclipse Infernale.
// Kael, jeune guerrier à aura, part l'arrêter en libérant un à un les maîtres qu'il contrôle.
//
// Une réplique : { who: identifiant du personnage (ou null pour le narrateur), text,
//   pose: 'idle' | 'victory' | 'charge' | 'guard' | 'powerup' | 'attack' | 'hurt' | 'ko',
//   shot: 'close' | 'two' | 'wide' | 'low', fx: 'flash' | 'shake' | 'aura' | 'impact' | 'dark' }

export const STORY_TITLE = 'La Légende de l’Éclipse';

export const CHAPTERS = [
  {
    id: 'ch1', n: 1, title: 'Le réveil de l’aura', kanji: '覚', arena: 'cliffs',
    cast: ['kael', 'ren'],
    intro: [
      { who: null, text: 'Plateau des Falaises. Depuis des semaines, les grands maîtres disparaissent les uns après les autres…', shot: 'wide' },
      { who: 'kael', text: 'Encore un peu… Je sens mon aura qui monte. Cette fois, je vais la maîtriser !', pose: 'charge', shot: 'low', fx: 'aura' },
      { who: 'ren', text: 'Ton ki déborde comme un torrent sans digue, Kael. Un seul coup d’épée suffirait à te renverser.', pose: 'idle', shot: 'close' },
      { who: 'kael', text: 'Ren ! Tu tombes bien. Montre-moi ce que vaut ta fameuse lame.', pose: 'victory', shot: 'close' },
      { who: 'ren', text: 'Soit. Mais je ne retiendrai pas mes coups.', pose: 'guard', shot: 'two', fx: 'flash' },
    ],
    fight: { enemies: [{ charId: 'ren', level: 'easy' }] },
    outro: [
      { who: 'ren', text: '… Tu as progressé. Assez pour ce qui t’attend, peut-être.', pose: 'hurt', shot: 'close' },
      { who: 'kael', text: 'Ce qui m’attend ?', pose: 'idle', shot: 'close' },
      { who: 'ren', text: 'Un homme aux cheveux blancs vole l’aura des maîtres. Le temple du Crépuscule sera sa prochaine cible.', pose: 'idle', shot: 'two' },
      { who: 'kael', text: 'Alors j’y vais. Personne ne touchera à Sora.', pose: 'powerup', shot: 'low', fx: 'aura' },
    ],
    reward: { ryo: 200 },
  },
  {
    id: 'ch2', n: 2, title: 'L’ombre dans le temple', kanji: '影', arena: 'temple',
    cast: ['kael', 'kage', 'sora'],
    intro: [
      { who: null, text: 'Temple du Crépuscule. Les cerisiers perdent leurs pétales en plein été.', shot: 'wide' },
      { who: 'sora', text: 'Kael ! Les esprits du temple hurlent… Quelqu’un approche, quelqu’un de vide.', pose: 'guard', shot: 'close' },
      { who: 'kage', text: '…', pose: 'idle', shot: 'close', fx: 'dark' },
      { who: 'kael', text: 'Shin ? Qu’est-ce qui t’arrive ? Tes yeux… cette marque rouge !', pose: 'idle', shot: 'two' },
      { who: 'kage', text: 'Ordre du maître : éliminer le porteur d’aura.', pose: 'attack', shot: 'low', fx: 'shake' },
      { who: 'kael', text: 'Je vais te réveiller, même s’il faut te frapper fort !', pose: 'charge', shot: 'close', fx: 'aura' },
    ],
    fight: { enemies: [{ charId: 'kage', level: 'normal' }] },
    outro: [
      { who: 'kage', text: 'Kael… ? J’étais… dans le noir. Une voix me commandait.', pose: 'hurt', shot: 'close' },
      { who: 'sora', text: 'La marque s’efface. C’est un sceau de l’Éclipse : il vole l’aura et la volonté.', pose: 'idle', shot: 'close' },
      { who: 'kage', text: 'Il s’appelle Yami. Il rassemble les maîtres à Néo-Kyoto.', pose: 'idle', shot: 'two' },
      { who: 'kael', text: 'Alors c’est là-bas que je vais.', pose: 'victory', shot: 'low' },
    ],
    reward: { ryo: 250 },
  },
  {
    id: 'ch3', n: 3, title: 'Tonnerre sur Néo-Kyoto', kanji: '雷', arena: 'neon',
    cast: ['kael', 'raiden'],
    intro: [
      { who: null, text: 'Toits de Néo-Kyoto. La pluie crépite sur les néons.', shot: 'wide' },
      { who: 'raiden', text: 'Plus un pas, gamin. Le maître a dit que tu viendrais.', pose: 'guard', shot: 'close', fx: 'flash' },
      { who: 'kael', text: 'Raiden Kurogane… le lancier du tonnerre. Toi aussi, il t’a eu ?', pose: 'idle', shot: 'close' },
      { who: 'raiden', text: 'La foudre ne se demande pas qui elle frappe.', pose: 'charge', shot: 'low', fx: 'shake' },
    ],
    fight: { enemies: [{ charId: 'raiden', level: 'normal' }] },
    outro: [
      { who: 'raiden', text: 'Hah… Ça faisait longtemps qu’on ne m’avait pas battu. Merci de m’avoir sorti de ce cauchemar.', pose: 'hurt', shot: 'close' },
      { who: 'raiden', text: 'Prends ma lance comme alliée : désormais, je me bats à tes côtés.', pose: 'victory', shot: 'two', fx: 'flash' },
      { who: null, text: 'Raiden Kurogane rejoint ton équipe ! Il est jouable dans tous les modes.', shot: 'wide' },
    ],
    reward: { ryo: 300, unlock: 'raiden' },
  },
  {
    id: 'ch4', n: 4, title: 'La mage des glaces', kanji: '氷', arena: 'glacier',
    cast: ['kael', 'lyra'],
    intro: [
      { who: null, text: 'Glacier Éternel. Les aurores boréales ondulent au-dessus de la plaine gelée.', shot: 'wide' },
      { who: 'lyra', text: 'Tu portes une aura immense… Tu es l’homme aux cheveux blancs ?', pose: 'guard', shot: 'close' },
      { who: 'kael', text: 'Mes cheveux sont noirs, tu vois bien ! Je le traque, moi aussi !', pose: 'idle', shot: 'close' },
      { who: 'lyra', text: 'Les mots ne prouvent rien. Le feu et la glace, eux, ne mentent pas.', pose: 'charge', shot: 'low', fx: 'aura' },
    ],
    fight: { enemies: [{ charId: 'lyra', level: 'normal' }] },
    outro: [
      { who: 'lyra', text: 'Ton aura est chaude, franche. Pas celle d’un voleur. Pardonne-moi.', pose: 'idle', shot: 'close' },
      { who: 'lyra', text: 'Yami s’est réfugié dans le Cœur du Volcan. Deux colosses gardent l’entrée. Je viens avec toi.', pose: 'victory', shot: 'two' },
    ],
    reward: { ryo: 300 },
  },
  {
    id: 'ch5', n: 5, title: 'Le cœur du volcan', kanji: '炎', arena: 'volcano',
    cast: ['kael', 'goro', 'garo', 'lyra'],
    intro: [
      { who: null, text: 'Cœur du Volcan. La lave gronde sous l’îlot de basalte.', shot: 'wide', fx: 'shake' },
      { who: 'garo', text: 'GRRRAAH… Personne… ne passe.', pose: 'charge', shot: 'low', fx: 'shake' },
      { who: 'goro', text: 'Le maître nous a confié cette porte. Vos poings ne la franchiront pas !', pose: 'guard', shot: 'close' },
      { who: 'lyra', text: 'Deux contre deux, Kael. Je prends le colosse de pierre, tu prends le boxeur.', pose: 'idle', shot: 'close' },
      { who: 'kael', text: 'Ça me va. On y va, Lyra !', pose: 'powerup', shot: 'low', fx: 'aura' },
    ],
    fight: { allies: [{ charId: 'lyra', level: 'normal' }], enemies: [{ charId: 'goro', level: 'normal' }, { charId: 'garo', level: 'normal' }] },
    outro: [
      { who: 'goro', text: 'Mes poings… sont libres. Merci, petit.', pose: 'hurt', shot: 'close' },
      { who: 'garo', text: '… Garo… se souvient. Garo… se bat… avec toi.', pose: 'victory', shot: 'close', fx: 'shake' },
      { who: null, text: 'Garo le Colosse rejoint ton équipe ! Il est jouable dans tous les modes.', shot: 'wide' },
    ],
    reward: { ryo: 400, unlock: 'garo' },
  },
  {
    id: 'ch6', n: 6, title: 'La danse du vent', kanji: '風', arena: 'temple',
    cast: ['kael', 'hana'],
    intro: [
      { who: null, text: 'De retour au temple, au crépuscule. Une silhouette danse entre les portiques.', shot: 'wide' },
      { who: 'hana', text: 'Tu as libéré ses pions un par un… Le maître est très, très fâché.', pose: 'idle', shot: 'close' },
      { who: 'kael', text: 'Hana Kazemiya… La danseuse du vent. Tu le sers de ton plein gré ?', pose: 'guard', shot: 'close' },
      { who: 'hana', text: 'Le vent va où on le pousse. Laisse-moi t’emporter !', pose: 'attack', shot: 'low', fx: 'flash' },
    ],
    fight: { enemies: [{ charId: 'hana', level: 'hard' }] },
    outro: [
      { who: 'hana', text: 'Ce sceau me brûlait le cœur. Tu l’as brisé… Je te dois une danse.', pose: 'hurt', shot: 'close' },
      { who: 'hana', text: 'Yami t’attend sur les toits de Néo-Kyoto. Ce soir, il veut ton aura.', pose: 'idle', shot: 'two' },
      { who: null, text: 'Hana Kazemiya rejoint ton équipe ! Elle est jouable dans tous les modes.', shot: 'wide' },
    ],
    reward: { ryo: 400, unlock: 'hana' },
  },
  {
    id: 'ch7', n: 7, title: 'Le démon aux cheveux blancs', kanji: '魔', arena: 'neon',
    cast: ['kael', 'yami'],
    intro: [
      { who: null, text: 'Minuit sur Néo-Kyoto. Les néons s’éteignent un à un.', shot: 'wide', fx: 'dark' },
      { who: 'yami', text: 'Enfin. Le porteur de la plus belle aura de ce monde vient se livrer lui-même.', pose: 'idle', shot: 'close', fx: 'dark' },
      { who: 'kael', text: 'Yami ! Pourquoi voler les auras ? Qu’est-ce que tu cherches ?', pose: 'guard', shot: 'close' },
      { who: 'yami', text: 'L’Éclipse Infernale. Une nuit éternelle où seul mon sabre brillera.', pose: 'powerup', shot: 'low', fx: 'aura' },
      { who: 'kael', text: 'Jamais. Je vais te faire rendre chaque aura que tu as prise !', pose: 'charge', shot: 'low', fx: 'aura' },
    ],
    fight: { enemies: [{ charId: 'yami', level: 'hard', mods: { hp: 1.2 } }] },
    outro: [
      { who: 'yami', text: 'Intéressant… Tu m’as blessé. Mais il est trop tard : l’Éclipse se lève déjà.', pose: 'hurt', shot: 'close', fx: 'dark' },
      { who: 'yami', text: 'Rejoins-moi au Cœur du Volcan, si tu l’oses.', pose: 'idle', shot: 'low', fx: 'flash' },
      { who: 'kael', text: 'J’y serai.', pose: 'powerup', shot: 'close', fx: 'aura' },
    ],
    reward: { ryo: 500 },
  },
  {
    id: 'ch8', n: 8, title: 'L’Éclipse', kanji: '蝕', arena: 'volcano',
    cast: ['kael', 'yami', 'ren', 'sora'],
    intro: [
      { who: null, text: 'Le ciel du volcan devient noir. Le soleil disparaît derrière une lune rouge.', shot: 'wide', fx: 'dark' },
      { who: 'yami', text: 'Regarde, Kael. Toutes les auras volées, réunies en moi. Je suis l’Éclipse.', pose: 'powerup', shot: 'low', fx: 'aura' },
      { who: 'ren', text: 'Kael ! Nous te prêtons nos forces. Prends-les !', pose: 'charge', shot: 'close', fx: 'aura' },
      { who: 'sora', text: 'Les esprits de tous les maîtres sont avec toi !', pose: 'charge', shot: 'close', fx: 'flash' },
      { who: 'kael', text: 'Je sens… toutes vos auras. C’est la fin, Yami !', pose: 'powerup', shot: 'low', fx: 'impact' },
    ],
    fight: { boss: true, playerMods: { energy: 1.5 }, enemies: [{ charId: 'yami', level: 'hard', mods: { hp: 1.8, dmg: 1.2 } }] },
    outro: [
      { who: 'yami', text: 'Impossible… Ma lumière noire… se disperse…', pose: 'ko', shot: 'close', fx: 'flash' },
      { who: null, text: 'Les auras volées s’envolent comme des lucioles et retrouvent leurs maîtres. Le soleil revient.', shot: 'wide' },
      { who: 'yami', text: 'Ce sabre… m’avait dévoré bien avant que je ne dévore les autres. Merci… de l’avoir brisé.', pose: 'hurt', shot: 'close' },
      { who: 'kael', text: 'Alors relève-toi, et bats-toi avec nous. Pour de vrai, cette fois.', pose: 'victory', shot: 'two' },
      { who: null, text: 'Yami Kurosaki rejoint ton équipe ! Merci d’avoir joué à « La Légende de l’Éclipse ».', shot: 'wide', fx: 'flash' },
    ],
    reward: { ryo: 1000, unlock: 'yami' },
  },
];
