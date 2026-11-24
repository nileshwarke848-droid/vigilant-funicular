import type { WeaponId } from '../gfx/character';

export interface InputSnapshot {
  move: -1 | 0 | 1;
  jump: boolean;
  jumpPressed: boolean;
  down: boolean;
  weapon: WeaponId | null;
  pause: boolean;
  restart: boolean;
}

const KEYMAP = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['KeyW', 'Space', 'ArrowUp'],
  pause: ['Escape', 'KeyP'],
  restart: ['KeyR'],
  weapons: {
    1: ['Digit1', 'Numpad1'],
    2: ['Digit2', 'Numpad2'],
    3: ['Digit3', 'Numpad3'],
    4: ['Digit4', 'Numpad4'],
    5: ['Digit5', 'Numpad5'],
  } as Record<WeaponId, string[]>,
};

export class KeyboardInput {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private onDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private onBlur = () => {
    this.down.clear();
    this.pressed.clear();
  };

  attach(target: Window): void {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(target: Window): void {
    target.removeEventListener('keydown', this.onDown);
    target.removeEventListener('keyup', this.onUp);
    target.removeEventListener('blur', this.onBlur);
  }

  /** Call once per frame; consumes one-shot presses. */
  read(): InputSnapshot {
    const anyDown = (codes: string[]) => codes.some((c) => this.down.has(c));
    const anyPressed = (codes: string[]) => codes.some((c) => this.pressed.has(c));
    let move: -1 | 0 | 1 = 0;
    if (anyDown(KEYMAP.left)) move -= 1;
    if (anyDown(KEYMAP.right)) move += 1;
    let weapon: WeaponId | null = null;
    for (const w of [1, 2, 3, 4, 5] as WeaponId[]) {
      if (anyPressed(KEYMAP.weapons[w])) weapon = w;
    }
    const snap: InputSnapshot = {
      move: move as -1 | 0 | 1,
      jump: anyDown(KEYMAP.jump),
      jumpPressed: anyPressed(KEYMAP.jump),
      down: anyDown(KEYMAP.down),
      weapon,
      pause: anyPressed(KEYMAP.pause),
      restart: anyPressed(KEYMAP.restart),
    };
    this.pressed.clear();
    return snap;
  }
}
