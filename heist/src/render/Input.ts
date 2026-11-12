import type { PlayerInput } from '../systems/World';

const SENSITIVITY = 0.0022;
const MAX_PITCH = 1.45;

/**
 * Clavier et souris. Les touches sont lues par position physique (`event.code`) : ZQSD sur un clavier
 * AZERTY et WASD sur un QWERTY tombent sur les mêmes touches.
 */
export class Input {
  facing = -Math.PI / 2;
  pitch = 0;
  private readonly keys = new Set<string>();
  private mouseDown = false;
  private slot: number | null = null;
  private readonly once = new Set<string>();

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.once.add(e.code);
      this.keys.add(e.code);
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit?.[1]) this.slot = Number(digit[1]) - 1;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    element.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.facing += e.movementX * SENSITIVITY;
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - e.movementY * SENSITIVITY));
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  lock(): void {
    void this.element.requestPointerLock?.();
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

  /** Oublie les appuis en attente (à l'ouverture d'un menu, par exemple). */
  flush(): void {
    this.once.clear();
    this.slot = null;
    this.mouseDown = false;
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
      interact: k('KeyE'),
      use: this.mouseDown && this.locked,
      slot,
    };
  }
}
