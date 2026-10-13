import { COIN, ECONOMY, FISH, TIERS, UPGRADES, type UpgradeId } from './config';
import { getSpecies, type Species } from './species';

export type Upgrades = Record<UpgradeId, number>;

export const emptyUpgrades = (): Upgrades => ({ propeller: 0, hopper: 0, magnet: 0, sonar: 0 });

export function speciesPrice(species: Species, owned: number): number {
  return Math.round(species.price * Math.pow(ECONOMY.speciesPriceGrowth, owned));
}

/** Cost of the next level, or null when maxed. */
export function upgradeCost(id: UpgradeId, level: number): number | null {
  const u = UPGRADES[id];
  if (level >= u.maxLevel) return null;
  return Math.round(u.baseCost * Math.pow(u.growth, level));
}

export interface ResidentLike {
  species: string;
  growth: number;
}

export function reefValue(fish: readonly ResidentLike[]): number {
  let total = 0;
  for (const f of fish) total += getSpecies(f.species).reefValue * (0.5 + 0.5 * f.growth);
  return Math.round(total);
}

export function tierIndex(value: number): number {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (value >= TIERS[i].min) idx = i;
  return idx;
}

/** 0..1 progress from the current tier to the next (1 at the final tier). */
export function tierProgress(value: number): number {
  const i = tierIndex(value);
  if (i >= TIERS.length - 1) return 1;
  const lo = TIERS[i].min;
  const hi = TIERS[i + 1].min;
  return Math.min(1, (value - lo) / (hi - lo));
}

export function coinTier(value: number): number {
  let t = 0;
  for (let i = 0; i < COIN.tiers.length; i++) if (value >= COIN.tiers[i].min) t = i;
  return t;
}

/** Coin a fish drops: scales with how grown it is. */
export function coinValueFor(species: Species, growth: number): number {
  return Math.max(1, Math.round(species.coinValue * (0.6 + 0.8 * growth)));
}

export function scaleForGrowth(growth: number): number {
  return FISH.minScale + (FISH.maxScale - FISH.minScale) * growth;
}
