import type { SimInput } from '../core/sim';

export type Action = 'shop' | 'pause' | 'night' | 'mute' | 'sonar';

/**
 * Keyboard, mouse and touch folded into one SimInput. Discrete actions
 * (shop, pause…) are dispatched to a handler; held controls are polled.
 */
export class Input {
  private readonly keys = new Set<string>();
  private sonarQueued = false;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private dragPointer = -1;
  enabled = false;
  /** Virtual stick / buttons written by the touch UI. */
  readonly touch = { x: 0, y: 0, rise: 0, feed: false, boost: false };

  constructor(
    surface: HTMLElement,
    private readonly onAction: (a: Action) => void,
    private readonly onOrbit: (dx: number, dy: number) => void,
    private readonly onZoom: (d: number) => void,
  ) {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', () => this.keys.clear());
    surface.addEventListener('pointerdown', this.pointerDown);
    window.addEventListener('pointermove', this.pointerMove);
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('pointercancel', this.pointerUp);
    surface.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.enabled) this.onZoom(e.deltaY);
    }, { passive: false });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return Boolean(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'));
  }

  private readonly keyDown = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    const k = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && this.enabled) e.preventDefault();
    if (e.repeat) {
      this.keys.add(k);
      return;
    }
    this.keys.add(k);
    switch (k) {
      case 'KeyB': this.onAction('shop'); break;
      case 'Escape': case 'KeyP': this.onAction('pause'); break;
      case 'KeyN': this.onAction('night'); break;
      case 'KeyM': this.onAction('mute'); break;
      case 'KeyF': case 'KeyR':
        if (this.enabled) this.sonarQueued = true;
        break;
    }
  };

  private readonly keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly pointerDown = (e: PointerEvent) => {
    if (!this.enabled || e.pointerType === 'touch' && this.dragPointer !== -1) return;
    this.dragging = true;
    this.dragPointer = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private readonly pointerMove = (e: PointerEvent) => {
    if (!this.dragging || e.pointerId !== this.dragPointer) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.onOrbit(dx, dy);
  };

  private readonly pointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.dragPointer) return;
    this.dragging = false;
    this.dragPointer = -1;
  };

  queueSonar(): void {
    this.sonarQueued = true;
  }

  clear(): void {
    this.keys.clear();
    this.sonarQueued = false;
    Object.assign(this.touch, { x: 0, y: 0, rise: 0, feed: false, boost: false });
  }

  poll(cameraYaw: number, arrowOrbit: (dx: number, dy: number) => void, dt: number): SimInput {
    const k = this.keys;
    const has = (...codes: string[]) => codes.some((c) => k.has(c));
    let x = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0) + this.touch.x;
    let y = (has('KeyW') ? 1 : 0) - (has('KeyS') ? 1 : 0) + this.touch.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const rise = Math.max(-1, Math.min(1, (has('KeyE') ? 1 : 0) - (has('KeyQ', 'KeyC', 'ControlLeft') ? 1 : 0) + this.touch.rise));
    // Arrow keys orbit the camera for keyboard-only players.
    const ax = (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0);
    const ay = (has('ArrowDown') ? 1 : 0) - (has('ArrowUp') ? 1 : 0);
    if (ax || ay) arrowOrbit(ax * 260 * dt, ay * 200 * dt);
    const sonar = this.sonarQueued;
    this.sonarQueued = false;
    if (!this.enabled) return { moveX: 0, moveY: 0, rise: 0, cameraYaw, boost: false, feed: false, sonar: false };
    return {
      moveX: x,
      moveY: y,
      rise,
      cameraYaw,
      boost: has('ShiftLeft', 'ShiftRight') || this.touch.boost,
      feed: has('Space') || this.touch.feed,
      sonar,
    };
  }
}
