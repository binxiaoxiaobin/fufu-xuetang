import { describe, expect, it } from 'vitest';
import { TIERS, UPGRADES } from '../../src/core/config';
import { coinTier, coinValueFor, reefValue, speciesPrice, tierIndex, tierProgress, upgradeCost } from '../../src/core/economy';
import { generateLayout } from '../../src/core/layout';
import { createNoise2D, createRng } from '../../src/core/noise';
import { createLocalStore, parseSave } from '../../src/core/save';
import { SpatialHash } from '../../src/core/spatial';
import { getSpecies, SPECIES } from '../../src/core/species';
import { Terrain } from '../../src/core/terrain';

describe('economy', () => {
  it('prices climb with each owned fish', () => {
    const s = getSpecies('clown');
    expect(speciesPrice(s, 0)).toBe(s.price);
    expect(speciesPrice(s, 3)).toBeGreaterThan(speciesPrice(s, 2));
  });

  it('upgrade cost grows then caps at null', () => {
    expect(upgradeCost('magnet', 0)).toBe(UPGRADES.magnet.baseCost);
    expect(upgradeCost('magnet', 1)!).toBeGreaterThan(UPGRADES.magnet.baseCost);
    expect(upgradeCost('magnet', UPGRADES.magnet.maxLevel)).toBeNull();
  });

  it('tiers and progress', () => {
    expect(tierIndex(0)).toBe(0);
    expect(tierIndex(TIERS[2].min)).toBe(2);
    expect(tierIndex(1e9)).toBe(TIERS.length - 1);
    expect(tierProgress(1e9)).toBe(1);
    expect(tierProgress(TIERS[1].min / 2)).toBeCloseTo(0.5);
  });

  it('reef value scales with growth', () => {
    expect(reefValue([{ species: 'clown', growth: 1 }])).toBeGreaterThan(reefValue([{ species: 'clown', growth: 0 }]));
  });

  it('coin metal follows value', () => {
    expect(coinTier(1)).toBe(0);
    expect(coinTier(9)).toBe(1);
    expect(coinTier(25)).toBe(2);
    expect(coinTier(250)).toBe(3);
    expect(coinValueFor(getSpecies('slopfish'), 1)).toBeGreaterThan(coinValueFor(getSpecies('slopfish'), 0));
  });

  it('every species is well formed', () => {
    for (const s of SPECIES) {
      expect(s.shape.length).toBeGreaterThan(0);
      expect(s.palette.body).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(() => getSpecies('nope')).toThrow(/E_SPECIES_UNKNOWN/);
  });
});

describe('save parsing', () => {
  it('rejects garbage', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('{not json')).toBeNull();
    expect(parseSave('{"v":2}')).toBeNull();
    expect(parseSave('[]')).toBeNull();
  });

  it('clamps hostile values and drops unknown species', () => {
    const data = parseSave(JSON.stringify({
      v: 1, coins: -50, totalEarned: 'lots', upgrades: { magnet: 99, propeller: -3 },
      fish: [{ s: 'clown', g: 5, h: -1, m: 3 }, { s: 'kraken', g: 0, h: 0, m: 0 }, { s: 'veilfin', g: 0, h: 0, m: 0 }, 'x'],
    }));
    expect(data).not.toBeNull();
    expect(data!.coins).toBe(0);
    expect(data!.totalEarned).toBe(0);
    expect(data!.upgrades.magnet).toBe(UPGRADES.magnet.maxLevel);
    expect(data!.upgrades.propeller).toBe(0);
    expect(data!.fish).toEqual([{ s: 'clown', g: 1, h: 0, m: 3 }]);
  });

  it('store survives a throwing storage', () => {
    const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('x'); } };
    const store = createLocalStore('k', bad);
    const orig = console.error;
    console.error = () => {};
    expect(store.load()).toBeNull();
    expect(store.save({ v: 1, coins: 0, totalEarned: 0, upgrades: { propeller: 0, hopper: 0, magnet: 0, sonar: 0 }, fish: [], stats: { pelletsDropped: 0, coinsCollected: 0, playTime: 0, veilfinsFed: 0 }, savedAt: 0 })).toBe(false);
    store.clear();
    console.error = orig;
  });

  it('store round-trips through a map-backed storage', () => {
    const m = new Map<string, string>();
    const store = createLocalStore('k', { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) });
    const save = { v: 1 as const, coins: 9, totalEarned: 9, upgrades: { propeller: 1, hopper: 0, magnet: 0, sonar: 0 }, fish: [], stats: { pelletsDropped: 1, coinsCollected: 1, playTime: 1, veilfinsFed: 0 }, savedAt: 1 };
    expect(store.save(save)).toBe(true);
    expect(store.load()).toEqual(save);
    store.clear();
    expect(store.load()).toBeNull();
  });
});

describe('world generation', () => {
  it('rng and noise are deterministic', () => {
    const a = createRng(5), b = createRng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const n = createNoise2D(3);
    expect(n(1.2, 3.4)).toBe(createNoise2D(3)(1.2, 3.4));
    expect(Math.abs(n(10.5, -3.3))).toBeLessThanOrEqual(1.01);
  });

  it('terrain forms a bowl: edges tower over the centre', () => {
    const t = new Terrain(7, 190, 100);
    expect(t.heightAt(0, 0)).toBeLessThan(10);
    expect(t.heightAt(90, 90)).toBeGreaterThan(t.heightAt(0, 0) + 20);
  });

  it('layout is deterministic and keeps the spawn clear', () => {
    const t = new Terrain(7, 190, 100);
    const a = generateLayout(t, 42);
    const b = generateLayout(t, 42);
    expect(a.rocks.length).toBe(b.rocks.length);
    expect(a.colliders.length).toBeGreaterThan(10);
    for (const r of a.rocks) expect(Math.hypot(r.x, r.z - 18)).toBeGreaterThan(8);
  });

  it('spatial hash finds neighbours and ignores far items', () => {
    const h = new SpatialHash<string>(5);
    h.insert(0, 0, 0, 'a');
    h.insert(3, 0, 0, 'b');
    h.insert(40, 0, 0, 'c');
    const found: string[] = [];
    h.forNear(1, 0, 0, (x) => found.push(x));
    expect(found.sort()).toEqual(['a', 'b']);
    h.clear();
    const none: string[] = [];
    h.forNear(1, 0, 0, (x) => none.push(x));
    expect(none).toEqual([]);
  });
});
