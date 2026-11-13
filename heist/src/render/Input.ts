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
  /**
   * Mode de secours quand le navigateur refuse de capturer la souris (cadre intégré, téléphone) :
   * on regarde en glissant, un clic bref tire.
   */
  fallback = false;
  private drag = 0;
  private clickPulse = false;

  constructor(private readonly element: HTMLElement) {
    document.addEventListener('pointerlockerror', () => {
      this.fallback = true;
    });
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
      this.drag = 0;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        // En mode de secours, un clic sans glissement vaut un tir.
        if (this.fallback && !this.locked && this.drag < 6) this.clickPulse = true;
        this.left = false;
      }
      if (e.button === 2) this.right = false;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    element.addEventListener('wheel', (e) => {
      if (this.active) this.wheel += Math.sign(e.deltaY);
    });
    document.addEventListener('mousemove', (e) => {
      const dragging = this.fallback && !this.locked && (e.buttons & 3) !== 0 && e.target === this.element;
      if (!this.locked && !dragging) return;
      if (dragging) this.drag += Math.abs(e.movementX) + Math.abs(e.movementY);
      const s = this.sensitivity * this.zoom * (dragging ? 1.6 : 1);
      this.facing += e.movementX * s;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - e.movementY * s));
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  lock(): void {
    if (this.fallback) return;
    try {
      const r = this.element.requestPointerLock?.() as unknown;
      if (r instanceof Promise) r.catch(() => (this.fallback = true));
    } catch {
      this.fallback = true;
    }
    // Certains cadres ignorent la demande sans erreur : on bascule si rien ne s'est passé.
    setTimeout(() => {
      if (!this.locked && document.hasFocus()) this.fallback = true;
    }, 600);
  }

  /** La souris est utilisable pour jouer (capturée, ou en mode de secours). */
  get active(): boolean {
    return this.locked || this.fallback;
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

  private takeClick(): boolean {
    const c = this.clickPulse;
    this.clickPulse = false;
    return c;
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
      fire: (this.left && this.locked) || this.takeClick(),
      aim: this.right && this.active,
      reload: k('KeyR'),
      slot,
    };
  }
}
