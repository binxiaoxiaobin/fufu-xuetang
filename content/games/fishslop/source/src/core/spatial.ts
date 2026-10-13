/**
 * Uniform-grid spatial hash. Insert is O(1); a neighbour query visits the
 * 27 surrounding cells, so flocking stays ~O(N) instead of O(N²).
 */
export class SpatialHash<T> {
  private readonly cells = new Map<number, T[]>();
  private readonly pool: T[][] = [];

  constructor(private readonly cellSize: number) {}

  private key(ix: number, iy: number, iz: number): number {
    // Offsets keep indices positive; 1024 cells per axis is far beyond the basin.
    return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512);
  }

  clear(): void {
    for (const list of this.cells.values()) {
      list.length = 0;
      this.pool.push(list);
    }
    this.cells.clear();
  }

  insert(x: number, y: number, z: number, item: T): void {
    const s = this.cellSize;
    const k = this.key(Math.floor(x / s), Math.floor(y / s), Math.floor(z / s));
    let list = this.cells.get(k);
    if (!list) {
      list = this.pool.pop() ?? [];
      this.cells.set(k, list);
    }
    list.push(item);
  }

  forNear(x: number, y: number, z: number, fn: (item: T) => void): void {
    const s = this.cellSize;
    const cx = Math.floor(x / s), cy = Math.floor(y / s), cz = Math.floor(z / s);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = this.cells.get(this.key(cx + dx, cy + dy, cz + dz));
          if (list) for (const item of list) fn(item);
        }
  }
}
