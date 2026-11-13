import type { PlayerInput } from '../systems/World';

const MAX_PITCH = 1.45;

/**
 * Clavier et souris. Les touches sont lues par position physique (`event.code`) : ZQSD sur un clavier
 * AZERTY et WASD sur un QWERTY tombent sur les mêmes touches.
 */
export class Input {
  facing = -Math.PI / 2;
  pitch = 0;
  sensitivity = 0.0022;
  /** Multiplicateur de sensibilité (réduit pendant la visée). */
  zoom = 1;
  private readonly keys = new Set<string>();
  private left = false;
  private right = false;
  private slot: number | null = null;
  private wheel = 0;
  private readonly once = new Set<string>();

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.once.add(e.code);
      this.keys.add(e.code);
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit?.[1]) this.slot = Number(digit[1]) - 1;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.left = this.right = false;
    });
    element.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.left = true;
      if (e.button === 2) this.right = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    element.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = this.sensitivity * this.zoom;
      this.facing += e.movementX * s;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - e.movementY * s));
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  lock(): void {
    try {
      const r = this.element.requestPointerLock?.() as unknown;
      if (r instanceof Promise) r.catch(() => undefined);
    } catch {
      // Navigateur sans verrouillage du pointeur : on joue quand même.
    }
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** Vrai une seule fois par appui sur la touche. */
  consume(code: string): boolean {
    const hit = this.once.has(code);
    this.once.delete(code);
    return hit;
  }

  /** Défilement de la molette depuis la dernière lecture (pour changer d'objet). */
  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** Oublie les appuis en attente (à l'ouverture d'un menu, par exemple). */
  flush(): void {
    this.once.clear();
    this.slot = null;
    this.left = this.right = false;
    this.wheel = 0;
  }

  read(): PlayerInput {
    const k = (c: string) => this.keys.has(c);
    const forward = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    const strafe = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    const slot = this.slot;
    this.slot = null;
    return {
      forward,
      strafe,
      facing: this.facing,
      pitch: this.pitch,
      sprint: k('ShiftLeft') || k('ShiftRight'),
      crouch: k('KeyC') || k('ControlLeft'),
      interact: k('KeyE') || k('KeyF'),
      fire: this.left && this.locked,
      aim: this.right && this.locked,
      reload: k('KeyR'),
      slot,
    };
  }
}
