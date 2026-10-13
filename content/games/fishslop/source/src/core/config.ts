/**
 * Every tunable number in the game lives here. Gameplay, rendering and UI
 * import from this module instead of inlining magic values.
 */

export const WORLD = {
  /** Half-extent of the playable basin on X and Z (metres). */
  halfSize: 62,
  /** Terrain mesh size; larger than the basin so walls read as a bowl. */
  terrainSize: 190,
  terrainSegments: 220,
  surfaceY: 40,
  /** Minimum clearance the sub and fish keep above the sea floor. */
  floorClearance: 1.4,
  /** Maximum height fish and the sub may reach below the surface. */
  ceilingY: 35,
  spawn: { x: 0, y: 12, z: 18 },
} as const;

export const SIM = {
  /** Fixed simulation step (seconds). Rendering interpolates nothing; 60 Hz is smooth enough. */
  step: 1 / 60,
  /** Clamp for long frames (tab switch, debugger) so physics never explodes. */
  maxFrameDelta: 0.25,
  autosaveInterval: 5,
} as const;

export const SUB = {
  thrust: 16,
  drag: 2.2,
  verticalThrust: 11,
  boostMultiplier: 1.85,
  turnRate: 3.2,
  radius: 1.6,
  baseMagnetRadius: 4.5,
  magnetPerLevel: 2.6,
  thrustPerLevel: 0.18,
  collectRadius: 1.5,
} as const;

export const FOOD = {
  sinkSpeed: 1.05,
  lifetime: 28,
  /** Seconds a pellet rests on the sand before dissolving. */
  restTime: 8,
  baseCapacity: 14,
  capacityPerLevel: 8,
  baseRefill: 1.4,
  refillPerLevel: 0.9,
  /** Seconds between pellets while the feed key is held. */
  dropInterval: 0.11,
  /** Hunger removed by eating one pellet, before species scaling. */
  nutrition: 0.34,
  eatRadius: 0.9,
  maxPellets: 160,
} as const;

export const FISH = {
  maxResidents: 110,
  /** Fish consider pellets food once hunger passes this. */
  appetiteThreshold: 0.18,
  /** Fish above this hunger stop producing coins. */
  starvingThreshold: 0.72,
  mealsPerGrowth: 3,
  growthPerStage: 0.14,
  minScale: 0.72,
  maxScale: 1.38,
  neighbourRadius: 5.5,
  separationRadius: 1.35,
  subAvoidRadius: 2.8,
  foodSenseRadius: 26,
  wallMargin: 7,
} as const;

export const COIN = {
  sinkSpeed: 0.55,
  lifetime: 120,
  maxCoins: 220,
  /** Value thresholds that pick a coin's metal. */
  tiers: [
    { name: 'bronze', min: 0 },
    { name: 'silver', min: 8 },
    { name: 'gold', min: 20 },
    { name: 'pearl', min: 60 },
  ],
} as const;

export const SONAR = {
  cooldown: 5.5,
  speed: 34,
  range: 70,
  highlightTime: 5,
  /** Passive range shown on the scope without pinging. */
  passiveRange: 22,
} as const;

export const VEILFIN = {
  /** Seconds between appearances, randomised by ±40%. */
  interval: 55,
  visibleTime: 38,
  reward: 250,
  /** A pinged Veilfin must be within this distance of a pellet to take it. */
  eatRadius: 1.6,
} as const;

export const UPGRADES = {
  propeller: { label: 'Propeller', maxLevel: 4, baseCost: 60, growth: 2.3 },
  hopper: { label: 'Food hopper', maxLevel: 4, baseCost: 45, growth: 2.2 },
  magnet: { label: 'Coin magnet', maxLevel: 4, baseCost: 70, growth: 2.4 },
  sonar: { label: 'Sonar array', maxLevel: 3, baseCost: 120, growth: 2.6 },
} as const;

export type UpgradeId = keyof typeof UPGRADES;

export const ECONOMY = {
  startingCoins: 35,
  /** Each resident of the same species raises its price by this factor. */
  speciesPriceGrowth: 1.16,
} as const;

/** Reef tiers — reef value unlocks new species in the shop. */
export const TIERS = [
  { name: 'Tide pool', min: 0 },
  { name: 'Lagoon', min: 60 },
  { name: 'Coral garden', min: 220 },
  { name: 'Barrier reef', min: 600 },
  { name: 'Atoll', min: 1400 },
  { name: 'Abyssal wonder', min: 3200 },
] as const;

export const STORAGE_KEYS = {
  save: 'fishslop.save.v1',
  settings: 'fishslop.settings.v1',
} as const;

export const RENDER = {
  maxPixelRatio: 1.5,
  minPixelRatio: 0.7,
  shadowMapSize: 2048,
  fov: 62,
  cameraDistance: 8,
  cameraMinDistance: 4.5,
  cameraMaxDistance: 18,
} as const;
