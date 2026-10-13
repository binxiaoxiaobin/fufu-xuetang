import { Vector3 } from 'three';
import { COIN, ECONOMY, FISH, FOOD, SONAR, SUB, UPGRADES, VEILFIN, WORLD, type UpgradeId } from './config';
import {
  coinTier, coinValueFor, emptyUpgrades, reefValue, scaleForGrowth, speciesPrice, tierIndex, upgradeCost, type Upgrades,
} from './economy';
import type { Collider } from './layout';
import { createRng, type Rng } from './noise';
import { SpatialHash } from './spatial';
import { getSpecies, SPECIES, type Species } from './species';
import type { Terrain } from './terrain';

/**
 * The whole game, renderer-free. Advances in fixed steps, emits events for
 * audio/UI, and serialises to a plain object. Nothing here touches the DOM.
 */

export interface Fish {
  id: number;
  species: string;
  pos: Vector3;
  vel: Vector3;
  hunger: number;
  growth: number;
  meals: number;
  coinTimer: number;
  /** Seconds of sonar highlight remaining. */
  highlight: number;
  wander: Vector3;
  wanderTimer: number;
  target: Pellet | null;
  phase: number;
  /** Seconds since last meal, drives a brief "gulp" animation. */
  ateAgo: number;
}

export interface Pellet { id: number; pos: Vector3; vel: Vector3; age: number; rest: number; dead: boolean }
export interface Coin { id: number; pos: Vector3; value: number; tier: number; age: number; resting: boolean; highlight: number; spin: number }
export interface SonarPulse { origin: Vector3; radius: number; range: number }

export interface Sub {
  pos: Vector3;
  vel: Vector3;
  heading: number;
  pitch: number;
  bank: number;
  prop: number;
  boosting: boolean;
}

export interface Veilfin {
  fish: Fish | null;
  timer: number;
  visibleLeft: number;
  fed: boolean;
  leaving: number;
}

export interface SimInput {
  /** Camera-relative stick: x = right, y = forward, each -1..1. */
  moveX: number;
  moveY: number;
  rise: number;
  cameraYaw: number;
  boost: boolean;
  feed: boolean;
  sonar: boolean;
}

export const idleInput = (): SimInput => ({ moveX: 0, moveY: 0, rise: 0, cameraYaw: 0, boost: false, feed: false, sonar: false });

export type GameEvent =
  | { type: 'coin'; value: number; tier: number }
  | { type: 'drop'; tier: number }
  | { type: 'feed' }
  | { type: 'eat'; species: string }
  | { type: 'grow'; species: string; growth: number }
  | { type: 'sonar' }
  | { type: 'veilfin-appear' }
  | { type: 'veilfin-fed'; value: number }
  | { type: 'tier'; index: number }
  | { type: 'purchase'; what: string; legendary: boolean; upgrade: boolean }
  | { type: 'hopper-empty' };

export interface Stats { pelletsDropped: number; coinsCollected: number; playTime: number; veilfinsFed: number }

export interface SaveData {
  v: 1;
  coins: number;
  totalEarned: number;
  upgrades: Upgrades;
  fish: { s: string; g: number; h: number; m: number }[];
  stats: Stats;
  savedAt: number;
}

export type PurchaseResult = { ok: true } | { ok: false; reason: 'funds' | 'maxed' | 'locked' | 'full' };

export class Sim {
  readonly terrain: Terrain;
  readonly colliders: readonly Collider[];
  coins: number = ECONOMY.startingCoins;
  totalEarned = 0;
  upgrades: Upgrades = emptyUpgrades();
  fish: Fish[] = [];
  pellets: Pellet[] = [];
  coinList: Coin[] = [];
  pulses: SonarPulse[] = [];
  sub: Sub;
  hopper: number;
  sonarCooldown = 0;
  veilfin: Veilfin = { fish: null, timer: VEILFIN.interval * 0.5, visibleLeft: 0, fed: false, leaving: 0 };
  stats: Stats = { pelletsDropped: 0, coinsCollected: 0, playTime: 0, veilfinsFed: 0 };
  time = 0;
  tier = 0;
  private events: GameEvent[] = [];
  private nextId = 1;
  private dropTimer = 0;
  private emptyWarned = false;
  private readonly rng: Rng;
  private readonly grid = new SpatialHash<Fish>(FISH.neighbourRadius);
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly tmp3 = new Vector3();
  private readonly steer = new Vector3();

  constructor(terrain: Terrain, colliders: readonly Collider[], seed = Date.now() & 0xffff) {
    this.terrain = terrain;
    this.colliders = colliders;
    this.rng = createRng(seed);
    this.sub = {
      pos: new Vector3(WORLD.spawn.x, WORLD.spawn.y, WORLD.spawn.z),
      vel: new Vector3(), heading: 0, pitch: 0, bank: 0, prop: 0, boosting: false,
    };
    this.hopper = this.hopperCapacity;
  }

  /** A fresh reef: a small school of tetras and a pair of clownfish. */
  static newGame(terrain: Terrain, colliders: readonly Collider[], seed?: number): Sim {
    const sim = new Sim(terrain, colliders, seed);
    for (let i = 0; i < 6; i++) sim.addFish('glimmer', { growth: 0.1, hunger: 0.35 });
    for (let i = 0; i < 2; i++) sim.addFish('clown', { growth: 0.15, hunger: 0.4 });
    sim.tier = tierIndex(reefValue(sim.fish));
    return sim;
  }

  // ---------------------------------------------------------------- derived

  get hopperCapacity(): number { return FOOD.baseCapacity + FOOD.capacityPerLevel * this.upgrades.hopper; }
  get hopperRefill(): number { return FOOD.baseRefill + FOOD.refillPerLevel * this.upgrades.hopper; }
  get magnetRadius(): number { return SUB.baseMagnetRadius + SUB.magnetPerLevel * this.upgrades.magnet; }
  get sonarRange(): number { return SONAR.range * (1 + 0.25 * this.upgrades.sonar); }
  get sonarCooldownMax(): number { return SONAR.cooldown * (1 - 0.18 * this.upgrades.sonar); }
  get reefValue(): number { return reefValue(this.fish); }

  ownedCount(speciesId: string): number {
    let n = 0;
    for (const f of this.fish) if (f.species === speciesId) n++;
    return n;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------------------------------------------------------- shop

  priceOf(speciesId: string): number {
    return speciesPrice(getSpecies(speciesId), this.ownedCount(speciesId));
  }

  buySpecies(speciesId: string): PurchaseResult {
    const species = getSpecies(speciesId);
    if (!species.shopVisible || species.tier > this.tier) return { ok: false, reason: 'locked' };
    if (this.fish.length >= FISH.maxResidents) return { ok: false, reason: 'full' };
    const price = this.priceOf(speciesId);
    if (this.coins < price) return { ok: false, reason: 'funds' };
    this.coins -= price;
    const f = this.addFish(speciesId, { growth: 0, hunger: 0.3 });
    // New arrivals leave the sub's cargo hatch.
    f.pos.copy(this.sub.pos).add(this.tmp.set(this.rng() - 0.5, -0.6, this.rng() - 0.5));
    this.events.push({ type: 'purchase', what: species.name, legendary: species.tier >= 5, upgrade: false });
    this.refreshTier();
    return { ok: true };
  }

  buyUpgrade(id: UpgradeId): PurchaseResult {
    const cost = upgradeCost(id, this.upgrades[id]);
    if (cost === null) return { ok: false, reason: 'maxed' };
    if (this.coins < cost) return { ok: false, reason: 'funds' };
    this.coins -= cost;
    this.upgrades[id]++;
    if (id === 'hopper') this.hopper = this.hopperCapacity;
    this.events.push({ type: 'purchase', what: UPGRADES[id].label, legendary: false, upgrade: true });
    return { ok: true };
  }

  // ---------------------------------------------------------------- spawning

  addFish(speciesId: string, opts: { growth?: number; hunger?: number; meals?: number } = {}): Fish {
    const species = getSpecies(speciesId);
    const angle = this.rng() * Math.PI * 2;
    const dist = 4 + this.rng() * 10;
    const x = this.sub.pos.x + Math.cos(angle) * dist;
    const z = this.sub.pos.z + Math.sin(angle) * dist;
    const floor = this.terrain.heightAt(x, z);
    const f: Fish = {
      id: this.nextId++,
      species: speciesId,
      pos: new Vector3(x, Math.max(floor + 3, this.sub.pos.y + (this.rng() - 0.5) * 4), z),
      vel: new Vector3(this.rng() - 0.5, 0, this.rng() - 0.5).multiplyScalar(species.speed),
      hunger: opts.hunger ?? 0.3,
      growth: opts.growth ?? 0,
      meals: opts.meals ?? 0,
      coinTimer: this.rng() * species.coinInterval * 0.8,
      highlight: 0,
      wander: new Vector3(x, floor + 5, z),
      wanderTimer: 0,
      target: null,
      phase: this.rng() * Math.PI * 2,
      ateAgo: 10,
    };
    this.fish.push(f);
    return f;
  }

  private dropCoin(pos: Vector3, value: number): void {
    if (this.coinList.length >= COIN.maxCoins) this.coinList.shift();
    const tier = coinTier(value);
    this.coinList.push({ id: this.nextId++, pos: pos.clone(), value, tier, age: 0, resting: false, highlight: 0, spin: this.rng() * 6 });
    this.events.push({ type: 'drop', tier });
  }

  private refreshTier(): void {
    const t = tierIndex(this.reefValue);
    if (t > this.tier) this.events.push({ type: 'tier', index: t });
    this.tier = Math.max(this.tier, t);
  }

  // ---------------------------------------------------------------- step

  /** `attract` runs the world behind the title screen without counting it as play time. */
  step(input: SimInput, dt: number, attract = false): void {
    this.time += dt;
    if (!attract) this.stats.playTime += dt;
    this.stepSub(input, dt);
    this.stepFeeding(input, dt);
    this.stepPellets(dt);
    this.stepFish(dt);
    this.stepVeilfin(dt);
    this.stepCoins(dt);
    this.stepSonar(input, dt);
  }

  private stepSub(input: SimInput, dt: number): void {
    const sub = this.sub;
    const thrust = SUB.thrust * (1 + SUB.thrustPerLevel * this.upgrades.propeller) * (input.boost ? SUB.boostMultiplier : 1);
    // Rotate the camera-relative stick into world space (camera looks down -Z at yaw 0).
    const sin = Math.sin(input.cameraYaw);
    const cos = Math.cos(input.cameraYaw);
    let mx = input.moveX * cos - input.moveY * sin;
    let mz = -input.moveX * sin - input.moveY * cos;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    sub.vel.x += mx * thrust * dt;
    sub.vel.z += mz * thrust * dt;
    sub.vel.y += input.rise * SUB.verticalThrust * (input.boost ? 1.4 : 1) * dt;
    const damp = Math.exp(-SUB.drag * dt);
    sub.vel.multiplyScalar(damp);
    sub.boosting = input.boost && len > 0.1;

    sub.pos.addScaledVector(sub.vel, dt);
    this.constrain(sub.pos, sub.vel, SUB.radius);

    const hSpeed = Math.hypot(sub.vel.x, sub.vel.z);
    let turn = 0;
    if (hSpeed > 0.6 && len > 0.05) {
      const want = Math.atan2(-sub.vel.x, -sub.vel.z);
      turn = wrapAngle(want - sub.heading);
      sub.heading = wrapAngle(sub.heading + turn * Math.min(1, SUB.turnRate * dt));
    }
    const targetPitch = Math.max(-0.5, Math.min(0.5, sub.vel.y * 0.09));
    sub.pitch += (targetPitch - sub.pitch) * Math.min(1, 4 * dt);
    const targetBank = Math.max(-0.55, Math.min(0.55, -turn * 0.8 * Math.min(1, hSpeed / 5)));
    sub.bank += (targetBank - sub.bank) * Math.min(1, 3 * dt);
    sub.prop += dt * (4 + sub.vel.length() * 3.5);
  }

  /** Keep a body inside the basin, above the floor, below the ceiling, and out of solid set-pieces. */
  constrain(pos: Vector3, vel: Vector3, radius: number): void {
    const e = WORLD.halfSize - radius;
    if (pos.x > e) { pos.x = e; vel.x = Math.min(0, vel.x); }
    if (pos.x < -e) { pos.x = -e; vel.x = Math.max(0, vel.x); }
    if (pos.z > e) { pos.z = e; vel.z = Math.min(0, vel.z); }
    if (pos.z < -e) { pos.z = -e; vel.z = Math.max(0, vel.z); }
    const floor = this.terrain.heightAt(pos.x, pos.z) + WORLD.floorClearance + radius * 0.5;
    if (pos.y < floor) { pos.y = floor; vel.y = Math.max(0, vel.y); }
    if (pos.y > WORLD.ceilingY) { pos.y = WORLD.ceilingY; vel.y = Math.min(0, vel.y); }
    for (const c of this.colliders) {
      const dy = c.h > 0 ? Math.max(0, Math.abs(pos.y - c.y) - c.h) * Math.sign(pos.y - c.y) : pos.y - c.y;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const min = c.r + radius;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.y += dy * push;
        pos.z += dz * push;
        // Remove the velocity component heading into the collider.
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const vn = vel.x * nx + vel.y * ny + vel.z * nz;
        if (vn < 0) { vel.x -= vn * nx; vel.y -= vn * ny; vel.z -= vn * nz; }
      }
    }
  }

  private stepFeeding(input: SimInput, dt: number): void {
    this.hopper = Math.min(this.hopperCapacity, this.hopper + this.hopperRefill * dt);
    this.dropTimer -= dt;
    if (!input.feed) { this.emptyWarned = false; return; }
    if (this.hopper < 1) {
      if (!this.emptyWarned) this.events.push({ type: 'hopper-empty' });
      this.emptyWarned = true;
      return;
    }
    if (this.dropTimer > 0) return;
    this.dropTimer = FOOD.dropInterval;
    this.hopper -= 1;
    if (this.pellets.length >= FOOD.maxPellets) this.pellets.shift();
    const sub = this.sub;
    const back = this.tmp.set(Math.sin(sub.heading), 0, Math.cos(sub.heading)).multiplyScalar(0.9);
    const pos = sub.pos.clone().add(back).add(this.tmp2.set((this.rng() - 0.5) * 0.5, -0.8, (this.rng() - 0.5) * 0.5));
    const vel = sub.vel.clone().multiplyScalar(0.35).add(this.tmp2.set((this.rng() - 0.5) * 1.4, -0.6, (this.rng() - 0.5) * 1.4));
    this.pellets.push({ id: this.nextId++, pos, vel, age: 0, rest: 0, dead: false });
    this.stats.pelletsDropped++;
    this.events.push({ type: 'feed' });
  }

  private stepPellets(dt: number): void {
    const alive: Pellet[] = [];
    for (const p of this.pellets) {
      p.age += dt;
      if (p.dead || p.age > FOOD.lifetime) { p.dead = true; continue; }
      const floor = this.terrain.heightAt(p.pos.x, p.pos.z) + 0.12;
      if (p.pos.y <= floor) {
        p.pos.y = floor;
        p.vel.set(0, 0, 0);
        p.rest += dt;
        if (p.rest > FOOD.restTime) { p.dead = true; continue; }
      } else {
        const damp = Math.exp(-1.6 * dt);
        p.vel.x *= damp;
        p.vel.z *= damp;
        p.vel.y += (-FOOD.sinkSpeed - p.vel.y) * Math.min(1, 2 * dt);
        p.pos.addScaledVector(p.vel, dt);
        p.pos.x += Math.sin(this.time * 1.3 + p.id) * 0.08 * dt;
      }
      alive.push(p);
    }
    this.pellets = alive;
  }

  private nearestPellet(pos: Vector3, radius: number): Pellet | null {
    let best: Pellet | null = null;
    let bestD = radius * radius;
    for (const p of this.pellets) {
      if (p.dead) continue;
      const d = p.pos.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  private stepFish(dt: number): void {
    // Spatial hash keeps neighbour queries ~O(N) instead of O(N²).
    this.grid.clear();
    for (const f of this.fish) this.grid.insert(f.pos.x, f.pos.y, f.pos.z, f);
    const frame = Math.floor(this.time / dt);

    for (const f of this.fish) {
      const sp = getSpecies(f.species);
      const scale = scaleForGrowth(f.growth);
      f.hunger = Math.min(1, f.hunger + sp.hungerRate * dt);
      f.highlight = Math.max(0, f.highlight - dt);
      f.ateAgo += dt;
      const steer = this.steer.set(0, 0, 0);
      let maxSpeed = sp.speed;

      // Hungry fish look for food; staggered so each fish rescans every 6 steps.
      const hungry = f.hunger > FISH.appetiteThreshold;
      if (hungry && (f.id + frame) % 6 === 0) f.target = this.nearestPellet(f.pos, FISH.foodSenseRadius);
      if (!hungry || f.target?.dead) f.target = null;
      const pellet = f.target;

      if (pellet) {
        this.tmp.subVectors(pellet.pos, f.pos);
        const d = this.tmp.length();
        maxSpeed *= 1.7;
        steer.addScaledVector(this.tmp.normalize(), 7);
        if (d < FOOD.eatRadius * scale * (0.6 + sp.shape.length * 0.4)) {
          pellet.dead = true;
          this.eat(f, sp);
          f.target = null;
        }
      } else {
        // Wander toward a roaming target; hungry fish home in on the sub, which feeds them.
        f.wanderTimer -= dt;
        if (f.wanderTimer <= 0 || f.pos.distanceToSquared(f.wander) < 4) this.pickWander(f, sp);
        if (hungry) {
          // Gather a few metres ahead of the sub, where the player is looking and food will fall.
          const h = this.sub.heading;
          this.tmp.set(this.sub.pos.x - Math.sin(h) * 5, this.sub.pos.y - 0.5, this.sub.pos.z - Math.cos(h) * 5).sub(f.pos);
          const d = this.tmp.length();
          if (d > 2.5) steer.addScaledVector(this.tmp.normalize(), (1.2 + 1.6 * f.hunger) * Math.min(1, d / 6));
        }
        this.tmp.subVectors(f.wander, f.pos).normalize();
        steer.addScaledVector(this.tmp, 1.2);
      }

      // Flocking.
      let alignN = 0;
      const align = this.tmp2.set(0, 0, 0);
      const center = this.tmp3.set(0, 0, 0);
      this.grid.forNear(f.pos.x, f.pos.y, f.pos.z, (o) => {
        if (o === f) return;
        const dx = f.pos.x - o.pos.x, dy = f.pos.y - o.pos.y, dz = f.pos.z - o.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > FISH.neighbourRadius * FISH.neighbourRadius) return;
        const sep = FISH.separationRadius * scale * sp.shape.length;
        if (d2 < sep * sep && d2 > 1e-6) {
          const inv = 1 / Math.sqrt(d2);
          steer.x += dx * inv * 3; steer.y += dy * inv * 3; steer.z += dz * inv * 3;
        }
        if (sp.schooling && o.species === f.species) {
          align.add(o.vel);
          center.add(o.pos);
          alignN++;
        }
      });
      if (alignN > 0 && !pellet) {
        steer.addScaledVector(align.divideScalar(alignN).normalize(), 1.1);
        steer.addScaledVector(center.divideScalar(alignN).sub(f.pos).normalize(), 0.8);
      }

      // Keep a polite distance from the sub.
      this.tmp.subVectors(f.pos, this.sub.pos);
      const subD = this.tmp.length();
      if (subD < FISH.subAvoidRadius && subD > 1e-3) steer.addScaledVector(this.tmp.normalize(), 6 * (1 - subD / FISH.subAvoidRadius));

      this.boundsSteer(f, steer);
      f.vel.addScaledVector(steer, dt * 2.2);
      clampSpeed(f.vel, maxSpeed * 0.3, maxSpeed);
      f.pos.addScaledVector(f.vel, dt);
      this.constrain(f.pos, f.vel, 0.3 * scale * sp.shape.length);

      if (f.hunger < FISH.starvingThreshold) {
        f.coinTimer += dt;
        if (f.coinTimer >= sp.coinInterval) {
          f.coinTimer = (this.rng() - 0.5) * sp.coinInterval * 0.3;
          this.dropCoin(f.pos, coinValueFor(sp, f.growth));
        }
      }
    }
    this.pellets = this.pellets.filter((p) => !p.dead);
  }

  private eat(f: Fish, sp: Species): void {
    f.hunger = Math.max(0, f.hunger - FOOD.nutrition / (0.6 + sp.shape.length * 0.3));
    f.meals++;
    f.ateAgo = 0;
    this.events.push({ type: 'eat', species: sp.id });
    if (f.meals % FISH.mealsPerGrowth === 0 && f.growth < 1) {
      f.growth = Math.min(1, f.growth + FISH.growthPerStage);
      this.events.push({ type: 'grow', species: sp.id, growth: f.growth });
      this.refreshTier();
    }
  }

  private pickWander(f: Fish, sp: Species): void {
    // Most fish stay within a comfortable range of the sub so the reef feels alive around the player.
    const roam = sp.schooling ? 22 : 30;
    const cx = this.rng() < 0.6 ? this.sub.pos.x : 0;
    const cz = this.rng() < 0.6 ? this.sub.pos.z : 0;
    const e = WORLD.halfSize - FISH.wallMargin;
    const x = Math.max(-e, Math.min(e, cx + (this.rng() - 0.5) * roam * 2));
    const z = Math.max(-e, Math.min(e, cz + (this.rng() - 0.5) * roam * 2));
    const floor = this.terrain.heightAt(x, z);
    const y = Math.min(WORLD.ceilingY - 4, floor + 2 + this.rng() * 12);
    f.wander.set(x, y, z);
    f.wanderTimer = 6 + this.rng() * 10;
  }

  private boundsSteer(f: { pos: Vector3 }, steer: Vector3): void {
    const e = WORLD.halfSize - FISH.wallMargin;
    if (f.pos.x > e) steer.x -= (f.pos.x - e) * 0.8;
    if (f.pos.x < -e) steer.x -= (f.pos.x + e) * 0.8;
    if (f.pos.z > e) steer.z -= (f.pos.z - e) * 0.8;
    if (f.pos.z < -e) steer.z -= (f.pos.z + e) * 0.8;
    const floor = this.terrain.heightAt(f.pos.x, f.pos.z) + 1.8;
    if (f.pos.y < floor) steer.y += (floor - f.pos.y) * 2;
    if (f.pos.y > WORLD.ceilingY - 3) steer.y -= (f.pos.y - WORLD.ceilingY + 3) * 1.5;
    for (const c of this.colliders) {
      const dx = f.pos.x - c.x, dz = f.pos.z - c.z;
      const dy = c.h > 0 ? 0 : f.pos.y - c.y;
      const d2 = dx * dx + dy * dy + dz * dz;
      const reach = c.r + 2;
      if (d2 < reach * reach && d2 > 1e-6) {
        if (c.h > 0 && Math.abs(f.pos.y - c.y) > c.h + 1) continue;
        const d = Math.sqrt(d2);
        const k = (reach - d) / reach * 5 / d;
        steer.x += dx * k; steer.y += dy * k; steer.z += dz * k;
      }
    }
  }

  private stepVeilfin(dt: number): void {
    const v = this.veilfin;
    if (!v.fish) {
      v.timer -= dt;
      if (v.timer <= 0) {
        const f = this.addFish('veilfin', { hunger: 1 });
        this.fish.pop(); // the Veilfin lives outside the resident list
        const a = this.rng() * Math.PI * 2;
        const e = WORLD.halfSize - 12;
        f.pos.set(Math.cos(a) * e * 0.8, 0, Math.sin(a) * e * 0.8);
        f.pos.y = this.terrain.heightAt(f.pos.x, f.pos.z) + 6 + this.rng() * 8;
        v.fish = f;
        v.visibleLeft = VEILFIN.visibleTime;
        v.fed = false;
        v.leaving = 0;
        this.events.push({ type: 'veilfin-appear' });
      }
      return;
    }
    const f = v.fish;
    const sp = getSpecies('veilfin');
    f.highlight = Math.max(0, f.highlight - dt);
    v.visibleLeft -= dt;
    if (v.leaving > 0 || v.visibleLeft <= 0) {
      v.leaving += dt;
      f.vel.y += dt * 3;
      f.pos.addScaledVector(f.vel, dt);
      if (v.leaving > 4) {
        v.fish = null;
        v.timer = VEILFIN.interval * (0.6 + this.rng() * 0.8);
      }
      return;
    }
    const steer = this.steer.set(0, 0, 0);
    // Wide lazy orbit around the basin centre.
    const t = this.time * 0.08 + f.phase;
    const r = WORLD.halfSize * 0.55;
    f.wander.set(Math.cos(t) * r, 0, Math.sin(t) * r);
    f.wander.y = this.terrain.heightAt(f.wander.x, f.wander.z) + 9;
    // A revealed Veilfin will take a pellet.
    let target: Pellet | undefined;
    if (f.highlight > 0 && !v.fed) {
      target = this.nearestPellet(f.pos, 14) ?? undefined;
    }
    if (target) {
      this.tmp.subVectors(target.pos, f.pos);
      if (this.tmp.length() < VEILFIN.eatRadius) {
        target.dead = true;
        this.pellets = this.pellets.filter((p) => !p.dead);
        v.fed = true;
        v.leaving = 0.01;
        f.ateAgo = 0;
        this.dropCoin(f.pos, VEILFIN.reward);
        this.stats.veilfinsFed++;
        this.events.push({ type: 'veilfin-fed', value: VEILFIN.reward });
      }
      steer.addScaledVector(this.tmp.normalize(), 8);
    } else {
      steer.addScaledVector(this.tmp.subVectors(f.wander, f.pos).normalize(), 2);
    }
    this.boundsSteer(f, steer);
    f.vel.addScaledVector(steer, dt * 2);
    clampSpeed(f.vel, sp.speed * 0.4, sp.speed * (target ? 1.4 : 1));
    f.pos.addScaledVector(f.vel, dt);
    this.constrain(f.pos, f.vel, 0.4);
  }

  private stepCoins(dt: number): void {
    const magnet = this.magnetRadius;
    const alive: Coin[] = [];
    for (const c of this.coinList) {
      c.age += dt;
      c.spin += dt * 2.5;
      c.highlight = Math.max(0, c.highlight - dt);
      if (c.age > COIN.lifetime) continue;
      this.tmp.subVectors(this.sub.pos, c.pos);
      const d = this.tmp.length();
      if (d < SUB.collectRadius + 0.4) {
        this.coins += c.value;
        this.totalEarned += c.value;
        this.stats.coinsCollected++;
        this.events.push({ type: 'coin', value: c.value, tier: c.tier });
        continue;
      }
      if (d < magnet) {
        c.resting = false;
        const pull = 6 + (1 - d / magnet) * 18;
        c.pos.addScaledVector(this.tmp.normalize(), Math.min(d, pull * dt));
      } else if (!c.resting) {
        c.pos.y -= COIN.sinkSpeed * dt;
        const floor = this.terrain.heightAt(c.pos.x, c.pos.z) + 0.25;
        if (c.pos.y <= floor) { c.pos.y = floor; c.resting = true; }
      }
      alive.push(c);
    }
    this.coinList = alive;
  }

  private stepSonar(input: SimInput, dt: number): void {
    this.sonarCooldown = Math.max(0, this.sonarCooldown - dt);
    if (input.sonar && this.sonarCooldown <= 0) {
      this.sonarCooldown = this.sonarCooldownMax;
      this.pulses.push({ origin: this.sub.pos.clone(), radius: 0, range: this.sonarRange });
      this.events.push({ type: 'sonar' });
    }
    const alive: SonarPulse[] = [];
    for (const p of this.pulses) {
      const prev = p.radius;
      p.radius += SONAR.speed * dt;
      const hit = (pos: Vector3) => {
        const d = pos.distanceTo(p.origin);
        return d >= prev && d < p.radius;
      };
      for (const f of this.fish) if (hit(f.pos)) f.highlight = SONAR.highlightTime;
      for (const c of this.coinList) if (hit(c.pos)) c.highlight = SONAR.highlightTime;
      const vf = this.veilfin.fish;
      if (vf && hit(vf.pos)) vf.highlight = SONAR.highlightTime * 2;
      if (p.radius < p.range) alive.push(p);
    }
    this.pulses = alive;
  }

  // ---------------------------------------------------------------- persistence

  toSave(): SaveData {
    return {
      v: 1,
      coins: Math.floor(this.coins),
      totalEarned: Math.floor(this.totalEarned),
      upgrades: { ...this.upgrades },
      fish: this.fish.map((f) => ({ s: f.species, g: round3(f.growth), h: round3(f.hunger), m: f.meals })),
      stats: { ...this.stats },
      savedAt: Date.now(),
    };
  }

  static fromSave(terrain: Terrain, colliders: readonly Collider[], data: SaveData, seed?: number): Sim {
    const sim = new Sim(terrain, colliders, seed);
    sim.coins = data.coins;
    sim.totalEarned = data.totalEarned;
    sim.upgrades = { ...data.upgrades };
    sim.stats = { ...data.stats };
    for (const f of data.fish) sim.addFish(f.s, { growth: f.g, hunger: f.h, meals: f.m });
    sim.hopper = sim.hopperCapacity;
    sim.tier = tierIndex(sim.reefValue);
    return sim;
  }
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clampSpeed(v: Vector3, min: number, max: number): void {
  const l = v.length();
  if (l > max) v.multiplyScalar(max / l);
  else if (l < min && l > 1e-5) v.multiplyScalar(min / l);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export const ALL_SPECIES = SPECIES;
