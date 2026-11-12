import itemsJson from './items.json';
import levelJson from './level.json';
import rulesJson from './rules.json';
import type { GameData, ItemDef, ItemId, LevelDef, Rect, RulesDef, Vec2 } from './types';

function fail(message: string): never {
  throw new Error(`Données invalides : ${message}`);
}

function inside(rect: Rect, p: Vec2): boolean {
  return p[0] >= rect.min[0] && p[0] <= rect.max[0] && p[1] >= rect.min[1] && p[1] <= rect.max[1];
}

function checkRect(rect: Rect, label: string): void {
  if (rect.min[0] >= rect.max[0] || rect.min[1] >= rect.max[1]) fail(`rectangle vide ou inversé (${label})`);
}

/** Indexe et valide les données brutes. Toute incohérence lève une erreur explicite. */
export function buildGameData(items: readonly ItemDef[], level: LevelDef, rules: RulesDef): GameData {
  const byId = new Map<ItemId, ItemDef>();
  for (const item of items) {
    if (byId.has(item.id)) fail(`objet en double « ${item.id} »`);
    if (item.price < 0) fail(`prix négatif pour « ${item.id} »`);
    if (item.suspicion < 0 || item.suspicion > 1) fail(`suspicion hors de [0, 1] pour « ${item.id} »`);
    if (item.speedFactor <= 0 || item.speedFactor > 1) fail(`facteur de vitesse invalide pour « ${item.id} »`);
    byId.set(item.id, item);
  }

  checkRect(level.bounds, 'limites');
  if (!inside(level.bounds, level.spawn)) fail('le point de départ est hors des limites');
  if (!inside(level.hideout, level.spawn)) fail('le joueur doit commencer dans sa planque');
  level.walls.forEach((w, i) => checkRect(w.rect, `mur ${i}`));

  const ids = new Set<string>();
  const doorIds = new Set(level.doors.map((d) => d.id));
  for (const it of level.interactables) {
    if (ids.has(it.id)) fail(`interactif en double « ${it.id} »`);
    ids.add(it.id);
    if (!inside(level.bounds, it.pos)) fail(`« ${it.id} » est hors des limites`);
    if (it.kind === 'pickup' && (it.item === undefined || !byId.has(it.item))) fail(`« ${it.id} » ne contient aucun objet connu`);
    if (it.kind === 'cash' && (it.amount === undefined || it.amount <= 0)) fail(`« ${it.id} » ne contient pas d'argent`);
    if (it.kind === 'door' && (it.door === undefined || !doorIds.has(it.door))) fail(`« ${it.id} » ne désigne aucune porte`);
  }
  for (const kind of ['register', 'safe', 'fuse-box', 'fence'] as const) {
    if (!level.interactables.some((it) => it.kind === kind)) fail(`il manque un interactif de type « ${kind} »`);
  }

  const intelIds = new Set<string>();
  for (const intel of level.intel) {
    if (intelIds.has(intel.id)) fail(`renseignement en double « ${intel.id} »`);
    intelIds.add(intel.id);
    if (intel.trigger === 'look' && intel.range <= 0) fail(`le renseignement « ${intel.id} » n'a pas de portée`);
  }
  for (const required of ['clerk-break', 'clerk-closing', 'fence']) {
    if (!intelIds.has(required)) fail(`il manque le renseignement « ${required} »`);
  }

  if (rules.storeOpen >= rules.storeClose) fail("la boutique ferme avant d'ouvrir");
  if (rules.launderFee < 0 || rules.launderFee >= 1) fail('la commission de blanchiment doit être dans [0, 1[');
  if (rules.timeScale <= 0) fail("l'échelle de temps doit être positive");
  if (rules.policeMinEta <= 0 || rules.policeMinEta > rules.policeEta) fail('délais de police incohérents');

  return { items: byId, level, rules };
}

export function loadGameData(): GameData {
  return buildGameData(itemsJson as unknown as readonly ItemDef[], levelJson as unknown as LevelDef, rulesJson as RulesDef);
}
