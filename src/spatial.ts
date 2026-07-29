import type { Circle } from "./types";

export class SpatialHash<T extends Circle> {
  private cells = new Map<string, T[]>();

  constructor(private readonly cellSize = 160) {}

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const minX = Math.floor((item.x - item.radius) / this.cellSize);
    const maxX = Math.floor((item.x + item.radius) / this.cellSize);
    const minY = Math.floor((item.y - item.radius) / this.cellSize);
    const maxY = Math.floor((item.y + item.radius) / this.cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`;
        const cell = this.cells.get(key) ?? [];
        cell.push(item);
        this.cells.set(key, cell);
      }
    }
  }

  query(x: number, y: number, radius: number): T[] {
    const found = new Set<T>();
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        for (const item of this.cells.get(`${cx}:${cy}`) ?? []) found.add(item);
      }
    }
    return [...found];
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
): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((circle.x - ax) * abx + (circle.y - ay) * aby) / lengthSquared));
  const x = ax + abx * t;
  const y = ay + aby * t;
  return Math.hypot(x - circle.x, y - circle.y) <= circle.radius;
}
