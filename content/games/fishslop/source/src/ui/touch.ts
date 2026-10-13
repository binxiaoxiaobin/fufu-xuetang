import type { Input } from '../input/input';

/** Virtual joystick + hold buttons for touch screens. Writes straight into Input.touch. */
export function bindTouch(input: Input, onPing: () => void): void {
  const stick = document.getElementById('stick');
  const knob = document.getElementById('stick-knob');
  if (!stick || !knob) return;
  let id = -1;
  let cx = 0;
  let cy = 0;
  const radius = 50;
  const move = (x: number, y: number) => {
    let dx = x - cx, dy = y - cy;
    const l = Math.hypot(dx, dy);
    if (l > radius) { dx *= radius / l; dy *= radius / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.touch.x = dx / radius;
    input.touch.y = -dy / radius;
    input.touch.boost = l > radius * 1.25 || input.touch.boost;
  };
  const end = () => {
    id = -1;
    knob.style.transform = '';
    input.touch.x = 0;
    input.touch.y = 0;
  };
  stick.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    id = e.pointerId;
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    try { stick.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    move(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e.clientX, e.clientY); });
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  document.querySelectorAll<HTMLButtonElement>('.tbtn').forEach((b) => {
    const hold = b.dataset.hold;
    const set = (on: boolean) => {
      b.classList.toggle('held', on);
      if (hold === 'feed') input.touch.feed = on;
      if (hold === 'boost') input.touch.boost = on;
      if (hold === 'rise') input.touch.rise = on ? 1 : 0;
      if (hold === 'dive') input.touch.rise = on ? -1 : 0;
    };
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      if (b.dataset.tap === 'sonar') onPing();
      else set(true);
    });
    b.addEventListener('pointerup', () => set(false));
    b.addEventListener('pointercancel', () => set(false));
  });
}
