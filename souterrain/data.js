'use strict';
// ============================================================
//  data.js : objets, équipement, niveaux, état du joueur
// ============================================================
const ITEMS = {
  candy: { n: 'Bonbon', heal: 10, d: '* Un bonbon au goût indéfinissable.', use: '* Vous mangez le Bonbon de Monstre.\n* Ça a vaguement un goût de réglisse.', price: 0 },
  pie: { n: 'Tarte', heal: 999, d: '* Une part de tarte caramel-cannelle.', use: '* Vous mangez la Tarte caramel-cannelle.\n* Elle a le goût de la maison.' },
  donut: { n: 'Beignet Arai.', heal: 12, d: '* Un beignet cuisiné par des araignées.', use: '* Vous mangez le Beignet d\'Araignée.\n* Il croustille... un peu trop.', price: 7 },
  cider: { n: 'Cidre Arai.', heal: 24, d: '* Du cidre filé par des araignées.', use: '* Vous buvez le Cidre d\'Araignée.', price: 18 },
  bisicle: { n: 'Bisicle', heal: 11, next: 'unisicle', d: '* Une glace à deux bâtonnets.', use: '* Vous mangez une moitié du Bisicle.', price: 15 },
  unisicle: { n: 'Unisicle', heal: 11, d: '* Une glace à un seul bâtonnet.', use: '* Vous mangez l\'Unisicle.' },
  bun: { n: 'Lapin Cannel.', heal: 22, d: '* Une brioche en forme de lapin.', use: '* Vous mangez le Lapin Cannelle.', price: 25 },
  nicecream: { n: 'Glace Sympa', heal: 15, d: '* Une glace avec un compliment.', use: '* Vous déballez la Glace Sympa.\n* « Tu es super ! » dit l\'emballage.', price: 15 },
  hotdog: { n: 'Hot-chien', heal: 20, d: '* Une saucisse... dans un chien ?', use: '* Vous mangez le Hot-chien.\n* « Ouaf ! »', price: 30 },
  seatea: { n: 'Thé de mer', heal: 10, spd: true, d: '* Un thé d\'algues pétillant.', use: '* Vous buvez le Thé de mer.\n* Votre VITESSE augmente !', price: 18 },
  temflakes: { n: 'Flocons Tem', heal: 2, d: '* Des bouts de papier déchirés.', use: '* Vous mangez les Flocons Tem.\n* hOI !', price: 1 },
  glamburger: { n: 'Glamburger', heal: 27, d: '* Un hamburger pailleté.', use: '* Vous mangez le Glamburger.\n* Ça brille sur votre langue.', price: 120 },
  hero: { n: 'Héros Légend.', heal: 40, atk: 4, d: '* Un sandwich en forme de héros.', use: '* Vous mangez le Héros Légendaire.\n* Votre ATQ augmente de 4 !', price: 300 },
  steak: { n: 'Steak Facial', heal: 60, d: '* Un steak à l\'effigie d\'une star.', use: '* Vous mangez le Steak Facial.', price: 500 },
  noodles: { n: 'Nouilles', heal: 90, battleHeal: 4, d: '* Des nouilles instantanées.', use: '* Vous préparez les Nouilles.\n* Vous attendez qu\'elles cuisent.', price: 200 },
  snowman: { n: 'Morceau Neige', heal: 45, d: '* Un morceau de bonhomme de neige.', use: '* Vous mangez le Morceau de bonhomme de neige.', price: 0 },
  starfait: { n: 'Starfait', heal: 14, d: '* Un parfait étoilé.', use: '* Vous mangez le Starfait.', price: 60 },
  popato: { n: 'Chips Popato', heal: 13, d: '* Des chips de patate.', use: '* Vous mangez les Chips Popato.', price: 25 },
  junkfood: { n: 'Malbouffe', heal: 17, d: '* De la nourriture trouvée par terre.', use: '* Vous mangez la Malbouffe.', price: 0 },
  crabapple: { n: 'Pomme-Crabe', heal: 18, d: '* Une pomme qui ressemble à un crabe.', use: '* Vous croquez la Pomme-Crabe.', price: 25 },
  astrofood: { n: 'Astro-bouffe', heal: 21, d: '* De la nourriture pour astronaute.', use: '* Vous mangez l\'Astro-bouffe.', price: 80 },
  // Équipement
  stick: { n: 'Bâton', kind: 'weapon', at: 0, d: '* Son utilité est un mystère.' },
  toyknife: { n: 'Couteau jouet', kind: 'weapon', at: 3, d: '* En plastique. Plutôt rare.' },
  glove: { n: 'Gant coriace', kind: 'weapon', at: 5, d: '* Un gant en cuir usé.', price: 50 },
  ballet: { n: 'Chaussons', kind: 'weapon', at: 7, d: '* Des chaussons de danse usés.' },
  notebook: { n: 'Carnet déchiré', kind: 'weapon', at: 2, d: '* Il frappe en gros.' },
  pan: { n: 'Poêle brûlée', kind: 'weapon', at: 10, d: '* Une poêle cabossée.' },
  gun: { n: 'Pistolet vide', kind: 'weapon', at: 12, d: '* Un pistolet de cow-boy, sans balles.', price: 350 },
  dagger: { n: 'Dague usée', kind: 'weapon', at: 15, d: '* Parfait pour couper des plantes.' },
  realknife: { n: 'Vrai couteau', kind: 'weapon', at: 99, d: '* Te voilà enfin.' },
  bandage: { n: 'Bandage', kind: 'armor', df: 0, heal: 10, d: '* Il a déjà servi.' },
  ribbon: { n: 'Ruban délavé', kind: 'armor', df: 3, d: '* Pour être plus mignon.' },
  bandana: { n: 'Bandana', kind: 'armor', df: 7, d: '* Il a des abdos dessinés dessus.', price: 50 },
  tutu: { n: 'Vieux tutu', kind: 'armor', df: 10, d: '* Il a tout un vécu.' },
  glasses: { n: 'Lunettes', kind: 'armor', df: 6, d: '* Des lunettes rayées.' },
  apron: { n: 'Tablier taché', kind: 'armor', df: 11, d: '* Il sent la friture.' },
  hat: { n: 'Chapeau cowboy', kind: 'armor', df: 12, at: 5, d: '* Pour les vrais aventuriers.', price: 350 },
  locket: { n: 'Médaillon', kind: 'armor', df: 99, d: '* Tu peux le sentir battre.' },
};
const LV_EXP = [0, 10, 30, 70, 120, 200, 300, 500, 800, 1200, 1700, 2500, 3500, 5000, 7000, 10000, 15000, 25000, 50000, 99999];
const AREAS = { ruins: 'Ruines', snowdin: 'Snowdin', waterfall: 'Waterfall', hotland: 'Hotland', core: 'CORE', newhome: 'Nouvelle Maison', lab: 'Labo secret' };
// Nombre de monstres à vaincre pour « vider » une zone (route génocide)
const AREA_KILLS = { ruins: 8, snowdin: 8, waterfall: 8, hotland: 6, core: 6 };

let G = null;
function newG(name = 'CHARA') {
  G = {
    name, lv: 1, exp: 0, gold: 0, hp: 20, weapon: 'stick', armor: 'bandage', items: [],
    flags: {}, kills: 0, spares: 0, areaKills: {}, room: 'fall', x: 0, y: 0, dir: 'down',
    time: 0, deaths: 0, battleAtk: 0, speed: 150, ending: null,
  };
  G.hp = maxHP();
  return G;
}
const maxHP = () => G.lv >= 20 ? 99 : 16 + G.lv * 4;
const atkStat = () => 10 + 2 * (G.lv - 1);
const defStat = () => 10 + Math.floor((G.lv - 1) / 4);
const wAT = () => (ITEMS[G.weapon].at || 0) + (ITEMS[G.armor].at || 0);
const aDF = () => ITEMS[G.armor].df || 0;
function addExp(n) {
  G.exp += n;
  let up = false;
  while (G.lv < 20 && G.exp >= LV_EXP[G.lv]) { G.lv++; up = true; }
  if (up) G.hp = Math.min(maxHP(), G.hp + 4);
  return up;
}
function giveItem(id) { if (G.items.length >= 8) return false; G.items.push(id); return true; }
// Route actuelle
const isGenocide = () => !!G.flags.geno;
const isPacifist = () => G.kills === 0;
function areaCleared(a) { return (G.areaKills[a] || 0) >= (AREA_KILLS[a] || 99); }

// Sauvegarde
function saveGame() { G.saved = Date.now(); store.set('save', G); }
function loadGame() { const s = store.get('save', null); if (s) { G = s; return true; } return false; }
function hasSave() { return !!store.get('save', null); }
