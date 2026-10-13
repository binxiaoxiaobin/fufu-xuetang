import { FISH, UPGRADES, type UpgradeId } from './config';
import { emptyUpgrades } from './economy';
import type { SaveData } from './sim';
import { getSpecies, isSpeciesId } from './species';

/**
 * Parses untrusted JSON (localStorage can be edited by anyone) into a valid
 * SaveData, clamping every field. Returns null when the blob is unusable.
 */
export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(obj) || obj.v !== 1) return null;

  const upgrades = emptyUpgrades();
  if (isRecord(obj.upgrades)) {
    for (const id of Object.keys(UPGRADES) as UpgradeId[]) {
      upgrades[id] = clampInt(obj.upgrades[id], 0, UPGRADES[id].maxLevel);
    }
  }

  const fish: SaveData['fish'] = [];
  if (Array.isArray(obj.fish)) {
    for (const f of obj.fish) {
      if (fish.length >= FISH.maxResidents) break;
      if (!isRecord(f) || !isSpeciesId(f.s) || !getSpecies(f.s).shopVisible) continue;
      fish.push({ s: f.s, g: clampNum(f.g, 0, 1), h: clampNum(f.h, 0, 1), m: clampInt(f.m, 0, 1e6) });
    }
  }

  const st = isRecord(obj.stats) ? obj.stats : {};
  return {
    v: 1,
    coins: clampInt(obj.coins, 0, 1e9),
    totalEarned: clampInt(obj.totalEarned, 0, 1e12),
    upgrades,
    fish,
    stats: {
      pelletsDropped: clampInt(st.pelletsDropped, 0, 1e9),
      coinsCollected: clampInt(st.coinsCollected, 0, 1e9),
      playTime: clampNum(st.playTime, 0, 1e9),
      veilfinsFed: clampInt(st.veilfinsFed, 0, 1e6),
    },
    savedAt: clampInt(obj.savedAt, 0, Number.MAX_SAFE_INTEGER),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampNum(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : min;
  return Math.min(max, Math.max(min, n));
}

function clampInt(v: unknown, min: number, max: number): number {
  return Math.floor(clampNum(v, min, max));
}

/** Storage wrapper: localStorage can throw (private mode, quota), so every access is guarded. */
export interface SaveStore {
  load(): SaveData | null;
  save(data: SaveData): boolean;
  clear(): void;
}

export function createLocalStore(key: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): SaveStore {
  return {
    load() {
      try {
        return parseSave(storage?.getItem(key) ?? null);
      } catch (err) {
        console.error('[fishslop] E_SAVE_READ', (err as Error).name);
        return null;
      }
    },
    save(data) {
      try {
        storage?.setItem(key, JSON.stringify(data));
        return Boolean(storage);
      } catch (err) {
        console.error('[fishslop] E_SAVE_WRITE', (err as Error).name);
        return false;
      }
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch (err) {
        console.error('[fishslop] E_SAVE_CLEAR', (err as Error).name);
      }
    },
  };
}
