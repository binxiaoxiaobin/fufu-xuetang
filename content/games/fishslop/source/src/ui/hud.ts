import { FISH, SONAR, TIERS } from '../core/config';
import { tierProgress } from '../core/economy';
import type { Sim } from '../core/sim';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`E_DOM_MISSING: #${id}`);
  return el as T;
};

export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

/** Heads-up display: purse, reef tier, gauges, toasts, floating coin labels and the sonar scope. */
export class Hud {
  readonly root = $('hud');
  private readonly coins = $<HTMLOutputElement>('coins');
  private readonly tierName = $('tier-name');
  private readonly tierBar = $('tier-bar');
  private readonly tierNext = $('tier-next');
  private readonly residents = $('residents');
  private readonly hopper = $('hopper');
  private readonly sonarBar = $('sonar-bar');
  private readonly sonarState = $('sonar-state');
  private readonly depth = $('depth');
  private readonly heading = $('heading');
  private readonly toasts = $('toasts');
  private readonly floaters = $('floaters');
  private readonly scope: Scope;
  private shownCoins = -1;
  private hopperCells = 0;
  private lastText = new Map<HTMLElement, string>();

  constructor() {
    this.scope = new Scope($<HTMLCanvasElement>('scope'));
  }

  private text(el: HTMLElement, value: string): void {
    if (this.lastText.get(el) === value) return;
    this.lastText.set(el, value);
    el.textContent = value;
  }

  update(sim: Sim): void {
    const c = Math.floor(sim.coins);
    if (c !== this.shownCoins) {
      if (this.shownCoins >= 0 && c > this.shownCoins) {
        this.coins.classList.remove('bump');
        void this.coins.offsetWidth; // restart the animation
        this.coins.classList.add('bump');
      }
      this.shownCoins = c;
      this.coins.value = fmt(c);
      this.coins.textContent = fmt(c);
    }
    const value = sim.reefValue;
    const tier = sim.tier;
    this.text(this.tierName, TIERS[tier].name);
    this.tierBar.style.width = `${(tierProgress(Math.max(value, TIERS[tier].min)) * 100).toFixed(1)}%`;
    const next = TIERS[tier + 1];
    this.text(this.tierNext, next ? `${fmt(Math.max(0, next.min - value))} reef value to ${next.name}` : 'Top tier reached');
    const hungry = sim.fish.filter((f) => f.hunger > FISH.starvingThreshold).length;
    this.text(this.residents, `${sim.fish.length} fish${hungry ? ` · ${hungry} hungry` : ''}`);

    const cap = sim.hopperCapacity;
    if (cap !== this.hopperCells) {
      this.hopperCells = cap;
      this.hopper.innerHTML = '<i></i>'.repeat(cap);
    }
    const cells = this.hopper.children;
    const full = Math.floor(sim.hopper);
    for (let i = 0; i < cells.length; i++) cells[i].classList.toggle('on', i < full);

    const cd = sim.sonarCooldown;
    const max = sim.sonarCooldownMax;
    this.sonarBar.style.width = `${((1 - cd / max) * 100).toFixed(1)}%`;
    this.text(this.sonarState, cd > 0 ? `Recharging ${cd.toFixed(1)} s` : 'Ready');
    this.sonarState.classList.toggle('cooling', cd > 0);

    this.text(this.depth, `${Math.max(0, Math.round(40 - sim.sub.pos.y))} m`);
    const deg = ((-sim.sub.heading * 180) / Math.PI + 360) % 360;
    this.text(this.heading, `${String(Math.round(deg) % 360).padStart(3, '0')}°`);
  }

  drawScope(sim: Sim, time: number): void {
    this.scope.draw(sim, time);
  }

  flashEmptyHopper(): void {
    this.hopper.classList.remove('empty');
    void this.hopper.offsetWidth;
    this.hopper.classList.add('empty');
    window.setTimeout(() => this.hopper.classList.remove('empty'), 1600);
  }

  toast(html: string, kind: '' | 'phosphor' | 'legend' = '', ms = 3400): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    this.toasts.prepend(el);
    while (this.toasts.children.length > 4) this.toasts.lastElementChild?.remove();
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 450);
    }, ms);
  }

  floater(text: string, x: number, y: number, pearl = false): void {
    if (this.floaters.children.length > 14) return;
    const el = document.createElement('div');
    el.className = `floater${pearl ? ' pearl' : ''}`;
    el.textContent = text;
    el.style.left = `${x + (Math.random() - 0.5) * 40}px`;
    el.style.top = `${y - 30}px`;
    this.floaters.append(el);
    window.setTimeout(() => el.remove(), 1350);
  }
}

/**
 * Phosphor sonar scope. Forward is up. Fish show within passive range;
 * anything the last ping touched glows brighter; the Veilfin only appears once pinged.
 */
class Scope {
  private readonly ctx: CanvasRenderingContext2D;
  private size: number;
  private readonly dpr: number;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = canvas.clientWidth || 220;
    this.size = css;
    canvas.width = css * this.dpr;
    canvas.height = css * this.dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('E_CANVAS_2D_UNAVAILABLE');
    this.ctx = ctx;
  }

  draw(sim: Sim, time: number): void {
    const css = this.canvas.clientWidth;
    if (css && Math.abs(css - this.size) > 1) {
      this.size = css;
      this.canvas.width = css * this.dpr;
      this.canvas.height = css * this.dpr;
    }
    const ctx = this.ctx;
    const s = this.size;
    const r = s / 2 - 6;
    const cx = s / 2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);

    // Grid.
    ctx.strokeStyle = 'rgba(156,255,176,0.16)';
    ctx.lineWidth = 1;
    for (const k of [1 / 3, 2 / 3, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cx, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - r, cx); ctx.lineTo(cx + r, cx);
    ctx.moveTo(cx, cx - r); ctx.lineTo(cx, cx + r);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(156,255,176,0.35)';
    for (let a = 0; a < 36; a++) {
      const ang = (a / 36) * Math.PI * 2;
      const inner = a % 3 === 0 ? r - 8 : r - 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * inner, cx + Math.sin(ang) * inner);
      ctx.lineTo(cx + Math.cos(ang) * r, cx + Math.sin(ang) * r);
      ctx.stroke();
    }

    // Rotating sweep with afterglow wedge.
    const sweep = (time * Math.PI) % (Math.PI * 2);
    const grad = ctx.createConicGradient ? ctx.createConicGradient(sweep - Math.PI * 0.5, cx, cx) : null;
    if (grad) {
      grad.addColorStop(0, 'rgba(156,255,176,0)');
      grad.addColorStop(0.9, 'rgba(156,255,176,0)');
      grad.addColorStop(1, 'rgba(156,255,176,0.22)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cx, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(156,255,176,0.7)';
    ctx.beginPath();
    ctx.moveTo(cx, cx);
    ctx.lineTo(cx + Math.cos(sweep - Math.PI / 2) * r, cx + Math.sin(sweep - Math.PI / 2) * r);
    ctx.stroke();

    const h = sim.sub.heading;
    const fx = -Math.sin(h), fz = -Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h);
    const range = SONAR.passiveRange * 1.6;
    const scale = r / range;
    const toScope = (x: number, z: number) => {
      const dx = x - sim.sub.pos.x, dz = z - sim.sub.pos.z;
      return { x: cx + (dx * rx + dz * rz) * scale, y: cx - (dx * fx + dz * fz) * scale, d: Math.hypot(dx, dz) };
    };
    const clampEdge = (p: { x: number; y: number }) => {
      const dx = p.x - cx, dy = p.y - cx;
      const l = Math.hypot(dx, dy);
      if (l <= r - 4) return p;
      return { x: cx + (dx / l) * (r - 4), y: cx + (dy / l) * (r - 4) };
    };

    // Sonar pulse rings.
    for (const p of sim.pulses) {
      const pr = p.radius * scale;
      if (pr > r) continue;
      const o = toScope(p.origin.x, p.origin.z);
      ctx.strokeStyle = `rgba(156,255,176,${(1 - p.radius / p.range) * 0.9})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(o.x, o.y, pr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    // Coins.
    for (const c of sim.coinList) {
      const p = toScope(c.pos.x, c.pos.z);
      if (p.d > range && c.highlight <= 0) continue;
      const q = clampEdge(p);
      ctx.fillStyle = c.tier === 3 ? '#f7e9ff' : '#e0a93b';
      ctx.globalAlpha = c.highlight > 0 ? 1 : 0.75;
      ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
    }
    // Fish.
    for (const f of sim.fish) {
      const p = toScope(f.pos.x, f.pos.z);
      if (p.d > range && f.highlight <= 0) continue;
      if (p.d > range) continue;
      ctx.fillStyle = '#9cffb0';
      ctx.globalAlpha = f.highlight > 0 ? 1 : 0.45;
      ctx.beginPath();
      ctx.arc(p.x, p.y, f.highlight > 0 ? 2.6 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // The Veilfin, only once pinged — drawn at the rim with a bearing if out of range.
    const vf = sim.veilfin.fish;
    if (vf && vf.highlight > 0) {
      const q = clampEdge(toScope(vf.pos.x, vf.pos.z));
      const pulse = 4 + Math.sin(time * 8) * 1.5;
      ctx.strokeStyle = '#ff8fd0';
      ctx.fillStyle = 'rgba(255,143,208,0.35)';
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - pulse);
      ctx.lineTo(q.x + pulse, q.y);
      ctx.lineTo(q.x, q.y + pulse);
      ctx.lineTo(q.x - pulse, q.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // The sub.
    ctx.fillStyle = '#ff6b4a';
    ctx.beginPath();
    ctx.moveTo(cx, cx - 7);
    ctx.lineTo(cx + 5, cx + 5);
    ctx.lineTo(cx, cx + 2);
    ctx.lineTo(cx - 5, cx + 5);
    ctx.closePath();
    ctx.fill();
    // Glass glare.
    const glare = ctx.createLinearGradient(0, 0, s, s);
    glare.addColorStop(0, 'rgba(255,255,255,0.07)');
    glare.addColorStop(0.45, 'rgba(255,255,255,0)');
    ctx.fillStyle = glare;
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
