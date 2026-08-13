import type { Circle } from "./types";

export class SpatialHash<T extends Circle> {
  private cells = new Map<number, T[]>();
  private maximumItemRadius = 0;

  constructor(private readonly cellSize = 160) {}

  clear(): void {
    this.cells.clear();
    this.maximumItemRadius = 0;
  }

  insert(item: T): void {
    const x = Math.floor(item.x / this.cellSize);
    const y = Math.floor(item.y / this.cellSize);
    const key = this.key(x, y);
    const cell = this.cells.get(key);
    if (cell) cell.push(item);
    else this.cells.set(key, [item]);
    this.maximumItemRadius = Math.max(this.maximumItemRadius, item.radius);
  }

  query(x: number, y: number, radius: number): T[] {
    return this.queryInto(x, y, radius, []);
  }

  queryInto(x: number, y: number, radius: number, found: T[]): T[] {
    found.length = 0;
    const reach = radius + this.maximumItemRadius;
    const minX = Math.floor((x - reach) / this.cellSize);
    const maxX = Math.floor((x + reach) / this.cellSize);
    const minY = Math.floor((y - reach) / this.cellSize);
    const maxY = Math.floor((y + reach) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) found.push(...cell);
      }
    }
    return found;
  }

  private key(x: number, y: number): number {
    return x * 65_536 + y;
  }
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function overlaps(a: Circle, b: Circle, padding = 0): boolean {
  return distance(a, b) < a.radius + b.radius + padding;
}

export function segmentCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  circle: Circle,
  padding = 0,
): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((circle.x - ax) * abx + (circle.y - ay) * aby) / lengthSquared));
  const x = ax + abx * t;
  const y = ay + aby * t;
  return Math.hypot(x - circle.x, y - circle.y) <= circle.radius + padding;
}
