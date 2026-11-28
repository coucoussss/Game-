import itemsJson from './items.json';
import propsJson from './props.json';
import rulesJson from './rules.json';
import townJson from './town.json';
import type {
  BuildingDef,
  DoorDef,
  GameData,
  ItemDef,
  ItemId,
  LevelDef,
  OpeningDef,
  PropKind,
  Rect,
  RulesDef,
  TownDef,
  Vec2,
  WallDef,
} from './types';

/** Épaisseur des murs et cloisons. */
export const WALL_THICKNESS = 0.2;

function fail(message: string): never {
  throw new Error(`Données invalides : ${message}`);
}

function inside(rect: Rect, p: Vec2): boolean {
  return p[0] >= rect.min[0] && p[0] <= rect.max[0] && p[1] >= rect.min[1] && p[1] <= rect.max[1];
}

function checkRect(rect: Rect, label: string): void {
  if (rect.min[0] >= rect.max[0] || rect.min[1] >= rect.max[1]) fail(`rectangle vide ou inversé (${label})`);
}

/** Emprise au sol d'un meuble, selon sa rotation en quarts de tour. */
export function propRect(pos: Vec2, kind: PropKind, rot = 0): Rect {
  const w = rot % 2 === 0 ? kind.w : kind.d;
  const d = rot % 2 === 0 ? kind.d : kind.w;
  return { min: [pos[0] - w / 2, pos[1] - d / 2], max: [pos[0] + w / 2, pos[1] + d / 2] };
}

/**
 * Découpe une bande de mur selon ses ouvertures. `alongX` : la bande court le long de x, entre `from` et
 * `to`, et occupe [lo, hi] sur l'autre axe.
 */
function cutStrip(
  b: BuildingDef,
  alongX: boolean,
  from: number,
  to: number,
  lo: number,
  hi: number,
  openings: readonly OpeningDef[],
  walls: WallDef[],
  doors: DoorDef[],
): void {
  const rect = (a: number, c: number): Rect => (alongX ? { min: [a, lo], max: [c, hi] } : { min: [lo, a], max: [hi, c] });
  const solid = (a: number, c: number, glass: boolean): void => {
    if (c - a < 1e-6) return;
    walls.push({ rect: rect(a, c), height: b.height, blocksSight: !glass, glass, owner: b.id });
  };
  let cursor = from;
  for (const o of [...openings].sort((p, q) => p.from - q.from)) {
    if (o.from < cursor - 1e-6 || o.to > to + 1e-6 || o.from >= o.to) fail(`ouverture mal placée dans « ${b.id} »`);
    solid(cursor, o.from, false);
    if (o.door) doors.push({ id: o.door.id, role: o.door.role, rect: rect(o.from, o.to), site: b.site ?? null, alongX });
    else if (o.window) solid(o.from, o.to, true);
    cursor = o.to;
  }
  solid(cursor, to, false);
}

/** Développe les bâtiments et le mobilier en murs, vitrines et portes. */
export function expandTown(town: TownDef, propKinds: ReadonlyMap<string, PropKind>): LevelDef {
  const walls: WallDef[] = [];
  const doors: DoorDef[] = [];
  const t = WALL_THICKNESS;
  for (const b of town.buildings) {
    checkRect(b.rect, b.id);
    const [x0, z0] = b.rect.min;
    const [x1, z1] = b.rect.max;
    if (b.solid) {
      walls.push({ rect: b.rect, height: b.height, blocksSight: true, glass: false, owner: b.id });
      continue;
    }
    const o = b.openings ?? {};
    cutStrip(b, true, x0, x1, z1 - t, z1, o.s ?? [], walls, doors);
    cutStrip(b, true, x0, x1, z0, z0 + t, o.n ?? [], walls, doors);
    cutStrip(b, false, z0, z1, x0, x0 + t, o.w ?? [], walls, doors);
    cutStrip(b, false, z0, z1, x1 - t, x1, o.e ?? [], walls, doors);
    for (const p of b.partitions ?? []) {
      cutStrip(b, p.axis === 'x', p.from, p.to, p.at - t / 2, p.at + t / 2, p.openings, walls, doors);
    }
  }
  for (const p of town.props) {
    const kind = propKinds.get(p.type);
    if (!kind) fail(`meuble inconnu « ${p.type} »`);
    if (!kind.solid) continue;
    walls.push({ rect: propRect(p.pos, kind, p.rot), height: kind.h, blocksSight: kind.blocksSight, glass: false, owner: `prop:${p.type}` });
  }
  return { ...town, walls, doors };
}

/** Indexe et valide les données brutes. Toute incohérence lève une erreur explicite. */
export function buildGameData(
  items: readonly ItemDef[],
  propKinds: Readonly<Record<string, PropKind>>,
  town: TownDef,
  rules: RulesDef,
): GameData {
  const byId = new Map<ItemId, ItemDef>();
  for (const item of items) {
    if (byId.has(item.id)) fail(`objet en double « ${item.id} »`);
    if (item.price < 0) fail(`prix négatif pour « ${item.id} »`);
    if (item.suspicion < 0 || item.suspicion > 1) fail(`suspicion hors de [0, 1] pour « ${item.id} »`);
    if (item.speedFactor <= 0 || item.speedFactor > 1) fail(`facteur de vitesse invalide pour « ${item.id} »`);
    byId.set(item.id, item);
  }
  const kinds = new Map(Object.entries(propKinds));
  const level = expandTown(town, kinds);

  checkRect(level.bounds, 'limites');
  if (!inside(level.hideout, level.spawn)) fail('le joueur doit commencer dans sa planque');

  const unique = (label: string, ids: readonly string[]): Set<string> => {
    const set = new Set<string>();
    for (const id of ids) {
      if (set.has(id)) fail(`${label} en double « ${id} »`);
      set.add(id);
    }
    return set;
  };
  const siteIds = unique('site', level.sites.map((s) => s.id));
  const doorIds = unique('porte', level.doors.map((d) => d.id));
  const staffIds = unique('employé', level.staff.map((s) => s.id));
  const intelIds = unique('renseignement', level.intel.map((i) => i.id));
  unique('interactif', level.interactables.map((i) => i.id));
  unique('caméra', level.cameras.map((c) => c.id));
  unique('passant', level.pedestrians.map((p) => p.id));

  for (const s of level.sites) {
    if (s.open >= s.close) fail(`« ${s.id} » ferme avant d'ouvrir`);
    if (!level.interactables.some((i) => i.kind === 'fuse-box' && i.site === s.id)) fail(`« ${s.id} » n'a pas de boîtier électrique`);
    if (!level.doors.some((d) => d.site === s.id && d.role === 'front')) fail(`« ${s.id} » n'a pas de porte d'entrée`);
  }
  for (const it of level.interactables) {
    if (!inside(level.bounds, it.pos)) fail(`« ${it.id} » est hors des limites`);
    if (it.site !== undefined && !siteIds.has(it.site)) fail(`« ${it.id} » désigne un site inconnu`);
    if (it.kind === 'pickup' && (it.item === undefined || !byId.has(it.item))) fail(`« ${it.id} » ne contient aucun objet connu`);
    if (it.kind === 'cash' && (it.amount === undefined || it.amount <= 0)) fail(`« ${it.id} » ne contient pas d'argent`);
    if ((it.kind === 'door' || it.kind === 'vault-drill') && (it.door === undefined || !doorIds.has(it.door))) fail(`« ${it.id} » ne désigne aucune porte`);
    if (it.kind === 'container') {
      const c = it.container;
      if (!c) fail(`« ${it.id} » n'a pas de description de contenant`);
      if (c.amount[0] > c.amount[1] || c.amount[0] < 0) fail(`butin incohérent pour « ${it.id} »`);
      if (c.behind !== undefined && !doorIds.has(c.behind)) fail(`« ${it.id} » est derrière une porte inconnue`);
    }
    if ((it.kind === 'register' || it.kind === 'fuse-box') && it.site === undefined) fail(`« ${it.id} » doit appartenir à un site`);
    if (it.needsStaff !== undefined && !staffIds.has(it.needsStaff)) fail(`« ${it.id} » dépend d'un employé inconnu`);
  }
  if (!level.interactables.some((i) => i.kind === 'fence')) fail('il manque le Fourgue');
  for (const c of level.cameras) if (!siteIds.has(c.site)) fail(`la caméra « ${c.id} » désigne un site inconnu`);
  for (const i of level.intel) {
    if (i.trigger === 'look' && i.range <= 0) fail(`le renseignement « ${i.id} » n'a pas de portée`);
    if (i.site !== 'town' && !siteIds.has(i.site)) fail(`le renseignement « ${i.id} » désigne un site inconnu`);
  }
  for (const s of level.staff) {
    if (!siteIds.has(s.site)) fail(`« ${s.id} » travaille dans un site inconnu`);
    if (s.arrive.length < 2) fail(`« ${s.id} » n'a pas de trajet d'arrivée`);
    for (const ref of [s.pause?.intel, s.leaveIntel, s.seenIntel]) {
      if (ref !== undefined && !intelIds.has(ref)) fail(`« ${s.id} » renvoie à un renseignement inconnu « ${ref} »`);
    }
    if (s.pause?.door !== undefined && !doorIds.has(s.pause.door)) fail(`« ${s.id} » tient une porte inconnue`);
  }
  for (const required of ['fence']) if (!intelIds.has(required)) fail(`il manque le renseignement « ${required} »`);

  if (rules.launderFee < 0 || rules.launderFee >= 1) fail('la commission de blanchiment doit être dans [0, 1[');
  if (rules.timeScale <= 0) fail("l'échelle de temps doit être positive");
  if (rules.policeMinEta <= 0 || rules.policeMinEta > rules.policeEta) fail('délais de police incohérents');
  if (rules.debt <= 0) fail('la dette doit être positive');

  return { items: byId, propKinds: kinds, level, rules };
}

let cached: GameData | null = null;

export function loadGameData(): GameData {
  cached ??= buildGameData(
    itemsJson as unknown as readonly ItemDef[],
    propsJson as Record<string, PropKind>,
    townJson as unknown as TownDef,
    rulesJson as RulesDef,
  );
  return cached;
}
