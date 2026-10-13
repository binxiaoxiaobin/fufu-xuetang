import { describe, expect, it } from 'vitest';
import { COIN, ECONOMY, FISH, FOOD, SIM, SUB, VEILFIN, WORLD } from '../../src/core/config';
import { generateLayout } from '../../src/core/layout';
import { idleInput, Sim, type SimInput } from '../../src/core/sim';
import { Terrain } from '../../src/core/terrain';

const terrain = new Terrain(7, 120, 80);
const layout = generateLayout(terrain);

function run(sim: Sim, seconds: number, input: Partial<SimInput> = {}): void {
  const inp = { ...idleInput(), ...input };
  const steps = Math.round(seconds / SIM.step);
  for (let i = 0; i < steps; i++) sim.step(inp, SIM.step);
}

describe('new game', () => {
  it('starts with a small reef, starting coins and a full hopper', () => {
    const sim = Sim.newGame(terrain, layout.colliders, 1);
    expect(sim.fish).toHaveLength(8);
    expect(sim.coins).toBe(ECONOMY.startingCoins);
    expect(sim.hopper).toBe(sim.hopperCapacity);
  });
});

describe('submarine', () => {
  it('moves forward relative to the camera', () => {
    const sim = Sim.newGame(terrain, [], 2);
    const z0 = sim.sub.pos.z;
    run(sim, 1, { moveY: 1, cameraYaw: 0 });
    expect(sim.sub.pos.z).toBeLessThan(z0 - 3); // camera at yaw 0 looks down -Z
  });

  it('boost goes further than cruising', () => {
    const a = Sim.newGame(terrain, [], 3);
    const b = Sim.newGame(terrain, [], 3);
    run(a, 1, { moveY: 1 });
    run(b, 1, { moveY: 1, boost: true });
    expect(b.sub.pos.distanceTo(b.sub.vel.clone().set(0, 12, 18))).toBeGreaterThan(0);
    expect(WORLD.spawn.z - b.sub.pos.z).toBeGreaterThan(WORLD.spawn.z - a.sub.pos.z);
  });

  it('never leaves the basin or sinks into the floor', () => {
    const sim = Sim.newGame(terrain, layout.colliders, 4);
    run(sim, 20, { moveX: 1, moveY: 1, rise: -1, boost: true });
    const p = sim.sub.pos;
    expect(Math.abs(p.x)).toBeLessThanOrEqual(WORLD.halfSize);
    expect(Math.abs(p.z)).toBeLessThanOrEqual(WORLD.halfSize);
    expect(p.y).toBeGreaterThanOrEqual(terrain.heightAt(p.x, p.z) + WORLD.floorClearance - 1e-6);
  });

  it('respects the ceiling', () => {
    const sim = Sim.newGame(terrain, [], 5);
    run(sim, 10, { rise: 1 });
    expect(sim.sub.pos.y).toBeLessThanOrEqual(WORLD.ceilingY);
  });

  it('is pushed out of colliders', () => {
    const sim = Sim.newGame(terrain, [], 6);
    const col = { x: 0, y: 12, z: 10, r: 3, h: 0 };
    const withCol = new Sim(terrain, [col], 6);
    withCol.sub.pos.set(0, 12, 10.5);
    withCol.constrain(withCol.sub.pos, withCol.sub.vel, SUB.radius);
    expect(withCol.sub.pos.distanceTo({ x: 0, y: 12, z: 10 } as never)).toBeGreaterThanOrEqual(col.r + SUB.radius - 1e-6);
    expect(sim).toBeTruthy();
  });
});

describe('feeding', () => {
  it('drops pellets from the hopper while feeding', () => {
    const sim = Sim.newGame(terrain, [], 7);
    run(sim, 0.5, { feed: true });
    expect(sim.pellets.length).toBeGreaterThan(2);
    expect(sim.hopper).toBeLessThan(sim.hopperCapacity);
    expect(sim.stats.pelletsDropped).toBe(sim.pellets.length);
  });

  it('warns once when the hopper runs dry', () => {
    const sim = Sim.newGame(terrain, [], 8);
    sim.hopper = 0;
    run(sim, 0.3, { feed: true });
    const empties = sim.drainEvents().filter((e) => e.type === 'hopper-empty');
    expect(empties).toHaveLength(1);
  });

  it('hungry fish eat pellets, get fuller and grow', () => {
    const sim = Sim.newGame(terrain, [], 9);
    for (const f of sim.fish) f.hunger = 0.9;
    const before = sim.fish.reduce((s, f) => s + f.hunger, 0);
    let ate = 0;
    let grew = 0;
    for (let i = 0; i < 25; i++) {
      run(sim, 1, { feed: i < 20 });
      for (const e of sim.drainEvents()) {
        if (e.type === 'eat') ate++;
        if (e.type === 'grow') grew++;
      }
    }
    const after = sim.fish.reduce((s, f) => s + f.hunger, 0);
    expect(ate).toBeGreaterThan(5);
    expect(after).toBeLessThan(before);
    expect(grew).toBeGreaterThan(0);
  });

  it('pellets settle on the floor and dissolve', () => {
    const sim = Sim.newGame(terrain, [], 10);
    sim.fish = [];
    run(sim, 0.2, { feed: true });
    expect(sim.pellets.length).toBeGreaterThan(0);
    run(sim, FOOD.lifetime + 1);
    expect(sim.pellets).toHaveLength(0);
  });
});

describe('coins', () => {
  it('fed fish drop coins over time', () => {
    const sim = Sim.newGame(terrain, [], 11);
    for (const f of sim.fish) { f.hunger = 0; f.coinTimer = 0; }
    run(sim, 20);
    const drops = sim.drainEvents().filter((e) => e.type === 'drop');
    expect(drops.length).toBeGreaterThan(0);
  });

  it('starving fish stop paying', () => {
    const sim = Sim.newGame(terrain, [], 12);
    for (const f of sim.fish) { f.hunger = 1; f.coinTimer = 0; }
    run(sim, 20);
    expect(sim.drainEvents().filter((e) => e.type === 'drop')).toHaveLength(0);
  });

  it('the magnet pulls nearby coins in and banks them', () => {
    const sim = Sim.newGame(terrain, [], 13);
    sim.fish = [];
    const start = sim.coins;
    sim.coinList.push({ id: 999, pos: sim.sub.pos.clone().add({ x: 3, y: 0, z: 0 } as never), value: 25, tier: 2, age: 0, resting: false, highlight: 0, spin: 0 });
    run(sim, 1.5);
    expect(sim.coins).toBe(start + 25);
    expect(sim.stats.coinsCollected).toBe(1);
  });

  it('coins out of range sink and eventually expire', () => {
    const sim = Sim.newGame(terrain, [], 14);
    sim.fish = [];
    sim.coinList.push({ id: 5, pos: sim.sub.pos.clone().add({ x: 30, y: 5, z: 0 } as never), value: 3, tier: 0, age: 0, resting: false, highlight: 0, spin: 0 });
    run(sim, 60);
    expect(sim.coinList[0]?.resting).toBe(true);
    run(sim, COIN.lifetime);
    expect(sim.coinList).toHaveLength(0);
  });
});

describe('shop', () => {
  it('buys a species, deducts the price and raises the next price', () => {
    const sim = Sim.newGame(terrain, [], 15);
    sim.coins = 500;
    const price = sim.priceOf('clown');
    expect(sim.buySpecies('clown')).toEqual({ ok: true });
    expect(sim.coins).toBe(500 - price);
    expect(sim.priceOf('clown')).toBeGreaterThan(price);
  });

  it('refuses without funds, when locked, or when the reef is full', () => {
    const sim = Sim.newGame(terrain, [], 16);
    sim.coins = 0;
    expect(sim.buySpecies('clown')).toEqual({ ok: false, reason: 'funds' });
    sim.coins = 1e6;
    expect(sim.buySpecies('slopfish')).toEqual({ ok: false, reason: 'locked' });
    expect(sim.buySpecies('veilfin')).toEqual({ ok: false, reason: 'locked' });
    while (sim.fish.length < FISH.maxResidents) sim.addFish('glimmer');
    expect(sim.buySpecies('glimmer')).toEqual({ ok: false, reason: 'full' });
  });

  it('upgrades apply and cap at max level', () => {
    const sim = Sim.newGame(terrain, [], 17);
    sim.coins = 1e6;
    const r0 = sim.magnetRadius;
    expect(sim.buyUpgrade('magnet').ok).toBe(true);
    expect(sim.magnetRadius).toBeGreaterThan(r0);
    for (let i = 0; i < 10; i++) sim.buyUpgrade('magnet');
    expect(sim.upgrades.magnet).toBe(4);
    expect(sim.buyUpgrade('magnet')).toEqual({ ok: false, reason: 'maxed' });
    sim.buyUpgrade('hopper');
    expect(sim.hopper).toBe(sim.hopperCapacity);
  });

  it('buying valuable fish advances the reef tier', () => {
    const sim = Sim.newGame(terrain, [], 18);
    sim.coins = 1e6;
    const t0 = sim.tier;
    for (let i = 0; i < 10; i++) sim.buySpecies('clown');
    expect(sim.tier).toBeGreaterThan(t0);
    expect(sim.drainEvents().some((e) => e.type === 'tier')).toBe(true);
  });
});

describe('sonar and the Veilfin', () => {
  it('a ping highlights nearby fish and respects cooldown', () => {
    const sim = Sim.newGame(terrain, [], 19);
    run(sim, 2, { sonar: true });
    expect(sim.drainEvents().filter((e) => e.type === 'sonar')).toHaveLength(1);
    expect(sim.fish.some((f) => f.highlight > 0)).toBe(true);
    expect(sim.sonarCooldown).toBeGreaterThan(0);
  });

  it('the Veilfin appears, and takes a pellet only once revealed', () => {
    const sim = Sim.newGame(terrain, [], 20);
    sim.veilfin.timer = 0.01;
    run(sim, 0.1);
    const vf = sim.veilfin.fish!;
    expect(vf).toBeTruthy();
    // Park the sub on top of it and feed without sonar: nothing happens.
    sim.sub.pos.copy(vf.pos).add({ x: 0, y: 2.2, z: 0 } as never);
    vf.highlight = 0;
    sim.pellets.push({ id: 1, pos: vf.pos.clone(), vel: vf.vel.clone().set(0, 0, 0), age: 0, rest: 0, dead: false });
    sim.step(idleInput(), SIM.step);
    expect(sim.veilfin.fed).toBe(false);
    // Reveal it: it eats and pays a pearl.
    vf.highlight = 5;
    sim.pellets.push({ id: 2, pos: vf.pos.clone(), vel: vf.vel.clone().set(0, 0, 0), age: 0, rest: 0, dead: false });
    sim.step(idleInput(), SIM.step);
    expect(sim.veilfin.fed).toBe(true);
    expect(sim.drainEvents().some((e) => e.type === 'veilfin-fed' && e.value === VEILFIN.reward)).toBe(true);
    expect(sim.coinList.some((c) => c.value === VEILFIN.reward)).toBe(true);
  });
});

describe('attract mode', () => {
  it('title-screen steps do not count as play time', () => {
    const sim = Sim.newGame(terrain, [], 22);
    for (let i = 0; i < 120; i++) sim.step(idleInput(), SIM.step, true);
    expect(sim.stats.playTime).toBe(0);
    expect(sim.time).toBeGreaterThan(1.9);
  });
});

describe('persistence', () => {
  it('round-trips through a save', () => {
    const sim = Sim.newGame(terrain, [], 21);
    sim.coins = 321;
    sim.upgrades.propeller = 2;
    sim.fish[0].growth = 0.5;
    const data = sim.toSave();
    const loaded = Sim.fromSave(terrain, [], JSON.parse(JSON.stringify(data)), 21);
    expect(loaded.coins).toBe(321);
    expect(loaded.upgrades.propeller).toBe(2);
    expect(loaded.fish).toHaveLength(sim.fish.length);
    expect(loaded.fish[0].growth).toBeCloseTo(0.5);
  });
});
