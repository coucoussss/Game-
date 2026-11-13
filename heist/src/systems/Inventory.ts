import type { ItemDef, ItemId } from '../data/types';

/**
 * Ce que le joueur possède, tient en main et porte sur lui, plus son argent.
 * L'argent sale (butin) doit être blanchi avant de pouvoir être dépensé.
 */
export class Inventory {
  readonly items: ItemId[] = [];
  held: ItemId | null = null;
  readonly worn = new Set<ItemId>();
  cash: number;
  dirty = 0;
  /** Total d'argent blanchi depuis le début : il débloque le matériel du Fourgue. */
  laundered = 0;
  /** Balles dans le chargeur, et en réserve. */
  mag = 0;
  ammo = 0;
  /** Points de blindage restants dans les plaques du gilet. */
  armor = 0;

  constructor(
    private readonly defs: ReadonlyMap<ItemId, ItemDef>,
    cash = 0,
  ) {
    this.cash = cash;
  }

  has(id: ItemId): boolean {
    return this.items.includes(id);
  }

  def(id: ItemId): ItemDef {
    const def = this.defs.get(id);
    if (!def) throw new Error(`Objet inconnu : ${id}`);
    return def;
  }

  add(id: ItemId): boolean {
    if (this.has(id)) return false;
    this.items.push(id);
    return true;
  }

  /** Objets qu'on peut prendre en main ou enfiler (tout sauf l'équipement passif). */
  holdable(): ItemId[] {
    return this.items.filter((id) => this.def(id).kind !== 'gear');
  }

  /** Sélectionne l'objet de l'emplacement `slot` (à partir de 0) ; le même emplacement le range. */
  select(slot: number): void {
    const id = this.holdable()[slot];
    if (id === undefined) return;
    this.held = this.held === id ? null : id;
  }

  /** Enfile ou retire un objet portable. Renvoie vrai s'il est désormais porté. */
  toggleWear(id: ItemId): boolean {
    if (!this.has(id) || this.def(id).kind !== 'wearable') return false;
    if (this.worn.has(id)) {
      this.worn.delete(id);
      return false;
    }
    this.worn.add(id);
    if (this.held === id) this.held = null;
    return true;
  }

  /** Suspicion inspirée par l'apparence : le maximum entre l'objet tenu et ce qui est porté. */
  visibleSuspicion(): number {
    let s = 0;
    if (this.held !== null && this.def(this.held).kind !== 'wearable') s = Math.max(s, this.def(this.held).suspicion);
    for (const id of this.worn) s = Math.max(s, this.def(id).suspicion);
    return s;
  }

  speedFactor(): number {
    let f = 1;
    for (const id of this.worn) f *= this.def(id).speedFactor;
    if (this.held !== null && !this.worn.has(this.held)) f *= this.def(this.held).speedFactor;
    return f;
  }

  masked(): boolean {
    return this.worn.has('ski-mask');
  }

  /** Portée d'intimidation de l'objet tenu (0 si rien de menaçant). */
  threatRange(): number {
    return this.held === null ? 0 : this.def(this.held).threatRange;
  }

  /** Le Fourgue ne propose un objet qu'à ceux qui ont déjà fait leurs preuves. */
  unlocked(id: ItemId): boolean {
    return this.laundered >= this.def(id).unlock;
  }

  /** Blindage effectif : les plaques ne servent que si le gilet est porté. */
  activeArmor(): number {
    return this.worn.has('plate-carrier') ? this.armor : 0;
  }

  /** Recharge le pistolet depuis la réserve. Renvoie vrai si des balles ont été chargées. */
  reload(magazine: number): boolean {
    const need = Math.min(magazine - this.mag, this.ammo);
    if (need <= 0) return false;
    this.mag += need;
    this.ammo -= need;
    return true;
  }

  buy(id: ItemId): 'ok' | 'owned' | 'poor' | 'locked' {
    if (this.has(id)) return 'owned';
    if (!this.unlocked(id)) return 'locked';
    const price = this.def(id).price;
    if (this.cash < price) return 'poor';
    this.cash -= price;
    this.add(id);
    return 'ok';
  }

  /** Blanchit tout l'argent sale, moins la commission. Renvoie la somme propre obtenue. */
  launder(fee: number): number {
    const clean = Math.floor(this.dirty * (1 - fee));
    this.cash += clean;
    this.laundered += clean;
    this.dirty = 0;
    return clean;
  }

  /** Saisie lors d'une arrestation : butin et matériel illégal confisqués. */
  confiscate(): ItemId[] {
    const lost = [...this.items];
    this.items.length = 0;
    this.worn.clear();
    this.held = null;
    this.dirty = 0;
    this.mag = 0;
    this.ammo = 0;
    this.armor = 0;
    return lost;
  }
}
