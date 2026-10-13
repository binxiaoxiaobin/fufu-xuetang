/**
 * Species catalogue. Pure data: the simulation reads behaviour numbers,
 * the renderer reads shape + palette, the shop reads price + unlock tier.
 */

export type Pattern = 'neon' | 'bands' | 'gradient' | 'spots' | 'stripes' | 'iridescent' | 'ghost';

export interface BodyShape {
  /** Nose-to-tail length in metres at scale 1. */
  length: number;
  /** Max body height as a fraction of length. */
  height: number;
  /** Max body width as a fraction of length. */
  width: number;
  /** 0..1 position of the thickest point along the body. */
  peak: number;
  tailSize: number;
  dorsal: number;
  /** Tall fin sails (angelfish), fraction of length. */
  sail: number;
  pectoral: number;
}

export interface Species {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Index into TIERS required before the shop sells it. */
  tier: number;
  shopVisible: boolean;
  shape: BodyShape;
  palette: { body: string; belly: string; accent: string };
  pattern: Pattern;
  patternScale: number;
  glow: number;
  speed: number;
  schooling: boolean;
  /** Hunger gained per second (0 = full, 1 = starving). */
  hungerRate: number;
  coinValue: number;
  coinInterval: number;
  /** Reef value contributed at full growth. */
  reefValue: number;
  swimFrequency: number;
}

export const SPECIES: readonly Species[] = [
  {
    id: 'glimmer',
    name: 'Glimmer tetra',
    blurb: 'Pocket-sized, schools tight, glows at night.',
    price: 12,
    tier: 0,
    shopVisible: true,
    shape: { length: 0.8, height: 0.28, width: 0.13, peak: 0.36, tailSize: 0.34, dorsal: 0.14, sail: 0, pectoral: 0.1 },
    palette: { body: '#6f8fa8', belly: '#dfe8ee', accent: '#3ff2ff' },
    pattern: 'neon',
    patternScale: 1,
    glow: 0.8,
    speed: 3.4,
    schooling: true,
    hungerRate: 1 / 70,
    coinValue: 2,
    coinInterval: 14,
    reefValue: 4,
    swimFrequency: 15,
  },
  {
    id: 'clown',
    name: 'Clownfish',
    blurb: 'Loyal to the sub. Drops bronze like it means it.',
    price: 30,
    tier: 0,
    shopVisible: true,
    shape: { length: 1.1, height: 0.36, width: 0.18, peak: 0.4, tailSize: 0.3, dorsal: 0.2, sail: 0, pectoral: 0.14 },
    palette: { body: '#ff6a1f', belly: '#ff9a4d', accent: '#fdf6ec' },
    pattern: 'bands',
    patternScale: 3,
    glow: 0,
    speed: 2.6,
    schooling: false,
    hungerRate: 1 / 80,
    coinValue: 5,
    coinInterval: 16,
    reefValue: 10,
    swimFrequency: 11,
  },
  {
    id: 'tang',
    name: 'Sunburst tang',
    blurb: 'Tall, lemon-bright, always on patrol.',
    price: 70,
    tier: 1,
    shopVisible: true,
    shape: { length: 1.35, height: 0.62, width: 0.14, peak: 0.42, tailSize: 0.32, dorsal: 0.3, sail: 0, pectoral: 0.13 },
    palette: { body: '#ffd21f', belly: '#ffe977', accent: '#fff6c9' },
    pattern: 'gradient',
    patternScale: 1,
    glow: 0,
    speed: 3,
    schooling: true,
    hungerRate: 1 / 85,
    coinValue: 9,
    coinInterval: 17,
    reefValue: 22,
    swimFrequency: 9,
  },
  {
    id: 'regal',
    name: 'Regal blue',
    blurb: 'Electric blue with a black palette stroke.',
    price: 140,
    tier: 2,
    shopVisible: true,
    shape: { length: 1.45, height: 0.46, width: 0.15, peak: 0.4, tailSize: 0.36, dorsal: 0.22, sail: 0, pectoral: 0.15 },
    palette: { body: '#1d63ff', belly: '#6fa6ff', accent: '#0b0f1e' },
    pattern: 'stripes',
    patternScale: 1,
    glow: 0.1,
    speed: 3.2,
    schooling: false,
    hungerRate: 1 / 90,
    coinValue: 16,
    coinInterval: 18,
    reefValue: 45,
    swimFrequency: 9,
  },
  {
    id: 'angel',
    name: 'Crowned angelfish',
    blurb: 'All sail. Glides instead of swims.',
    price: 260,
    tier: 2,
    shopVisible: true,
    shape: { length: 1.5, height: 0.72, width: 0.12, peak: 0.38, tailSize: 0.3, dorsal: 0.1, sail: 0.55, pectoral: 0.14 },
    palette: { body: '#27327a', belly: '#f7c948', accent: '#ffdc5e' },
    pattern: 'stripes',
    patternScale: 2.4,
    glow: 0,
    speed: 2.1,
    schooling: false,
    hungerRate: 1 / 100,
    coinValue: 26,
    coinInterval: 19,
    reefValue: 80,
    swimFrequency: 6,
  },
  {
    id: 'puffer',
    name: 'Polka puffer',
    blurb: 'Round, spotted, suspicious of everything.',
    price: 420,
    tier: 3,
    shopVisible: true,
    shape: { length: 1.3, height: 0.66, width: 0.62, peak: 0.45, tailSize: 0.26, dorsal: 0.1, sail: 0, pectoral: 0.2 },
    palette: { body: '#c9a45c', belly: '#fbf1d6', accent: '#2a1d0e' },
    pattern: 'spots',
    patternScale: 7,
    glow: 0,
    speed: 1.6,
    schooling: false,
    hungerRate: 1 / 110,
    coinValue: 42,
    coinInterval: 20,
    reefValue: 130,
    swimFrequency: 8,
  },
  {
    id: 'mandarin',
    name: 'Mandarin dragonet',
    blurb: 'Psychedelic swirl, pays in gold.',
    price: 780,
    tier: 4,
    shopVisible: true,
    shape: { length: 1.15, height: 0.34, width: 0.24, peak: 0.34, tailSize: 0.34, dorsal: 0.3, sail: 0, pectoral: 0.22 },
    palette: { body: '#0f7bd4', belly: '#ff7a1a', accent: '#35f0a0' },
    pattern: 'spots',
    patternScale: 11,
    glow: 0.35,
    speed: 2.3,
    schooling: false,
    hungerRate: 1 / 110,
    coinValue: 70,
    coinInterval: 21,
    reefValue: 240,
    swimFrequency: 10,
  },
  {
    id: 'slopfish',
    name: 'The Slopfish',
    blurb: 'Legendary. Oil-slick scales, pearls on schedule.',
    price: 2400,
    tier: 5,
    shopVisible: true,
    shape: { length: 2.6, height: 0.42, width: 0.16, peak: 0.36, tailSize: 0.42, dorsal: 0.26, sail: 0.12, pectoral: 0.18 },
    palette: { body: '#e9c46a', belly: '#fff2cf', accent: '#ff5fd2' },
    pattern: 'iridescent',
    patternScale: 1,
    glow: 0.55,
    speed: 3.6,
    schooling: false,
    hungerRate: 1 / 120,
    coinValue: 120,
    coinInterval: 18,
    reefValue: 900,
    swimFrequency: 7,
  },
  {
    id: 'veilfin',
    name: 'Veilfin',
    blurb: 'Only sonar can see it. Feed it once, get a pearl.',
    price: 0,
    tier: 0,
    shopVisible: false,
    shape: { length: 2.3, height: 0.34, width: 0.12, peak: 0.3, tailSize: 0.55, dorsal: 0.4, sail: 0.2, pectoral: 0.25 },
    palette: { body: '#bdf6ff', belly: '#ffffff', accent: '#8a7dff' },
    pattern: 'ghost',
    patternScale: 1,
    glow: 1,
    speed: 4.2,
    schooling: false,
    hungerRate: 0,
    coinValue: 0,
    coinInterval: 9999,
    reefValue: 0,
    swimFrequency: 6,
  },
] as const;

const byId = new Map(SPECIES.map((s) => [s.id, s]));

export function getSpecies(id: string): Species {
  const s = byId.get(id);
  if (!s) throw new Error(`E_SPECIES_UNKNOWN: ${id}`);
  return s;
}

export function isSpeciesId(id: unknown): id is string {
  return typeof id === 'string' && byId.has(id);
}

export const SHOP_SPECIES = SPECIES.filter((s) => s.shopVisible);
