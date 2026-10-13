import { FOOD, SONAR, SUB, TIERS, UPGRADES, type UpgradeId } from '../core/config';
import { upgradeCost } from '../core/economy';
import type { Sim } from '../core/sim';
import { SHOP_SPECIES, type Species } from '../core/species';
import { fmt } from './hud';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`E_DOM_MISSING: #${id}`);
  return el;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Side-view silhouette drawn from the species' real body proportions and palette. */
function fishSvg(sp: Species): string {
  const ry = 13 * (sp.shape.height / 0.45);
  const sail = sp.shape.sail * 30;
  const dorsal = sp.shape.dorsal * 26;
  const tail = sp.shape.tailSize * 40;
  const id = `g-${sp.id}`;
  const stripe = sp.pattern === 'bands'
    ? `<rect x="40" y="${24 - ry}" width="5" height="${ry * 2}" fill="${sp.palette.accent}"/><rect x="26" y="${24 - ry}" width="5" height="${ry * 2}" fill="${sp.palette.accent}"/>`
    : sp.pattern === 'neon'
      ? `<rect x="22" y="22" width="28" height="3" rx="1.5" fill="${sp.palette.accent}"/>`
      : '';
  return `<svg viewBox="0 0 76 48" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sp.palette.body}"/><stop offset="1" stop-color="${sp.palette.belly}"/></linearGradient></defs>
    <path d="M22 24 L${22 - tail * 0.7} ${24 - tail * 0.6} L${22 - tail * 0.45} 24 L${22 - tail * 0.7} ${24 + tail * 0.6} Z" fill="${sp.palette.accent}" opacity="0.85"/>
    <path d="M30 ${24 - ry * 0.8} Q40 ${24 - ry - dorsal - sail} 52 ${24 - ry * 0.7} Z" fill="${sp.palette.accent}" opacity="0.8"/>
    ${sail ? `<path d="M32 ${24 + ry * 0.8} Q42 ${24 + ry + sail} 52 ${24 + ry * 0.7} Z" fill="${sp.palette.accent}" opacity="0.8"/>` : ''}
    <ellipse cx="42" cy="24" rx="24" ry="${ry}" fill="url(#${id})"/>
    ${stripe}
    <circle cx="57" cy="${24 - ry * 0.25}" r="2.4" fill="#04141c"/>
  </svg>`;
}

const UPGRADE_ICON: Record<UpgradeId, string> = {
  propeller: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 3-7s2 4-3 7M14 12c4 0 7 1 7 3s-4 2-7-3M12 14c0 4-1 7-3 7s-2-4 3-7M10 12c-4 0-7-1-7-3s4-2 7 3"/></svg>',
  hopper: '<svg viewBox="0 0 24 24"><path d="M4 5h16l-5 8v6l-6 2v-8z"/><circle cx="9" cy="8" r=".6"/><circle cx="13" cy="7.5" r=".6"/></svg>',
  magnet: '<svg viewBox="0 0 24 24"><path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/><path d="M6 8h4M14 8h4"/></svg>',
  sonar: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>',
};

function upgradeEffect(id: UpgradeId, level: number): string {
  switch (id) {
    case 'propeller': return `Cruise thrust +${Math.round(SUB.thrustPerLevel * level * 100)}%`;
    case 'hopper': return `${FOOD.baseCapacity + FOOD.capacityPerLevel * level} pellets, refills ${(FOOD.baseRefill + FOOD.refillPerLevel * level).toFixed(1)}/s`;
    case 'magnet': return `Pulls coins from ${(SUB.baseMagnetRadius + SUB.magnetPerLevel * level).toFixed(1)} m`;
    case 'sonar': return `${Math.round(SONAR.range * (1 + 0.25 * level))} m range, ${(SONAR.cooldown * (1 - 0.18 * level)).toFixed(1)} s recharge`;
  }
}

/** The dock: buy residents and sub parts. Re-renders from sim state; never mutates it directly. */
export class Shop {
  readonly root = $('shop');
  private readonly fishList = $('shop-fish');
  private readonly subList = $('shop-sub');
  private readonly purse = $('shop-coins');
  private readonly tabFish = $('tab-fish');
  private readonly tabSub = $('tab-sub');
  private lastKey = '';

  constructor(
    private readonly onBuyFish: (id: string) => void,
    private readonly onBuyUpgrade: (id: UpgradeId) => void,
    onClose: () => void,
  ) {
    $('btn-shop-close').addEventListener('click', onClose);
    this.tabFish.addEventListener('click', () => this.tab('fish'));
    this.tabSub.addEventListener('click', () => this.tab('sub'));
    this.fishList.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-fish]');
      if (b && !b.disabled) this.onBuyFish(b.dataset.fish!);
    });
    this.subList.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-upgrade]');
      if (b && !b.disabled) this.onBuyUpgrade(b.dataset.upgrade as UpgradeId);
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(sim: Sim): void {
    this.root.hidden = false;
    this.lastKey = '';
    this.render(sim);
    (this.tabFish.getAttribute('aria-selected') === 'true' ? this.fishList : this.subList).querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  close(): void {
    this.root.hidden = true;
  }

  private tab(which: 'fish' | 'sub'): void {
    const fish = which === 'fish';
    this.tabFish.setAttribute('aria-selected', String(fish));
    this.tabSub.setAttribute('aria-selected', String(!fish));
    this.fishList.hidden = !fish;
    this.subList.hidden = fish;
  }

  /** Cheap to call every frame: only rebuilds when something visible changed. */
  render(sim: Sim): void {
    if (!this.isOpen) return;
    const key = `${Math.floor(sim.coins)}|${sim.tier}|${sim.fish.length}|${Object.values(sim.upgrades).join(',')}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.purse.textContent = fmt(sim.coins);

    this.fishList.innerHTML = SHOP_SPECIES.map((sp) => {
      const locked = sp.tier > sim.tier;
      const price = sim.priceOf(sp.id);
      const owned = sim.ownedCount(sp.id);
      const short = price - sim.coins;
      const label = locked ? `Unlocks at ${TIERS[sp.tier].name}` : short > 0 ? `Need ${fmt(short)} more` : `Buy · ${fmt(price)}`;
      return `<article class="item${locked ? ' locked' : ''}">
        ${fishSvg(sp)}
        <div><h3>${esc(sp.name)}</h3><p>${esc(sp.blurb)}</p>
        <div class="meta">${owned} in reef · pays ~${sp.coinValue}c each ${sp.coinInterval}s</div></div>
        <button class="buy" type="button" data-fish="${sp.id}" ${locked || short > 0 ? 'disabled' : ''}>${label}</button>
      </article>`;
    }).join('');

    this.subList.innerHTML = (Object.keys(UPGRADES) as UpgradeId[]).map((id) => {
      const u = UPGRADES[id];
      const level = sim.upgrades[id];
      const cost = upgradeCost(id, level);
      const short = cost === null ? 0 : cost - sim.coins;
      const label = cost === null ? 'Maxed out' : short > 0 ? `Need ${fmt(short)} more` : `Upgrade · ${fmt(cost)}`;
      const pips = Array.from({ length: u.maxLevel }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      const now = upgradeEffect(id, level);
      const next = cost === null ? '' : ` → ${upgradeEffect(id, level + 1)}`;
      return `<article class="item">
        <div class="upgrade-icon">${UPGRADE_ICON[id]}</div>
        <div><h3>${u.label}</h3><p>${now}${next}</p><div class="pips">${pips}</div></div>
        <button class="buy" type="button" data-upgrade="${id}" ${cost === null || short > 0 ? 'disabled' : ''}>${label}</button>
      </article>`;
    }).join('');
  }
}
