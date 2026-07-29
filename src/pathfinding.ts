import { BALANCE } from "./config";
import type { Circle, Vec2 } from "./types";

interface GridCell {
  x: number;
  y: number;
}

const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [0, 1, 1],
  [-1, 0, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
  [1, -1, Math.SQRT2],
];

export class NavigationGrid {
  readonly cellSize = BALANCE.navigation.cellSize;
  readonly columns = Math.ceil(BALANCE.mapSize / this.cellSize);
  private readonly blocked = new Set<number>();

  constructor(
    readonly obstacles: readonly Circle[],
    readonly actorRadius: number,
    readonly margin: number = BALANCE.navigation.obstacleMargin,
  ) {
    this.buildBlockedCells();
  }

  find(start: Vec2, goal: Vec2): Vec2[] {
    const startCell = this.nearestOpen(this.toCell(start));
    const goalCell = this.nearestOpen(this.toCell(goal));
    const startKey = this.key(startCell.x, startCell.y);
    const goalKey = this.key(goalCell.x, goalCell.y);
    if (startKey === goalKey) return [goal];

    const open = new Set<number>([startKey]);
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>([[startKey, 0]]);
    const fScore = new Map<number, number>([[startKey, this.heuristic(startCell, goalCell)]]);
    let iterations = 0;

    while (open.size > 0 && iterations < this.columns * this.columns * 2) {
      iterations += 1;
      let currentKey = -1;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const candidate of open) {
        const score = fScore.get(candidate) ?? Number.POSITIVE_INFINITY;
        if (score < bestScore || (score === bestScore && candidate < currentKey)) {
          currentKey = candidate;
          bestScore = score;
        }
      }
      if (currentKey === goalKey) return this.reconstruct(cameFrom, currentKey, startKey, start, goal);
      open.delete(currentKey);
      const current = this.fromKey(currentKey);
      for (const [dx, dy, movementCost] of DIRECTIONS) {
        const next = { x: current.x + dx, y: current.y + dy };
        if (!this.inBounds(next) || this.isBlocked(next)) continue;
        if (dx !== 0 && dy !== 0) {
          if (this.isBlocked({ x: current.x + dx, y: current.y })
            || this.isBlocked({ x: current.x, y: current.y + dy })) continue;
        }
        const nextKey = this.key(next.x, next.y);
        const tentative = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + movementCost;
        if (tentative >= (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentative);
        fScore.set(nextKey, tentative + this.heuristic(next, goalCell));
        open.add(nextKey);
      }
    }
    return [];
  }

  isPointBlocked(point: Vec2): boolean {
    return this.isBlocked(this.toCell(point));
  }

  private buildBlockedCells(): void {
    const inflate = this.actorRadius + this.margin;
    for (const obstacle of this.obstacles) {
      const radius = obstacle.radius + inflate;
      const minX = Math.max(0, Math.floor((obstacle.x - radius) / this.cellSize));
      const maxX = Math.min(this.columns - 1, Math.floor((obstacle.x + radius) / this.cellSize));
      const minY = Math.max(0, Math.floor((obstacle.y - radius) / this.cellSize));
      const maxY = Math.min(this.columns - 1, Math.floor((obstacle.y + radius) / this.cellSize));
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          const point = this.cellCenter({ x, y });
          const halfDiagonal = this.cellSize * 0.42;
          if (Math.hypot(point.x - obstacle.x, point.y - obstacle.y) <= radius + halfDiagonal) {
            this.blocked.add(this.key(x, y));
          }
        }
      }
    }
  }

  private reconstruct(
    cameFrom: Map<number, number>,
    goalKey: number,
    startKey: number,
    start: Vec2,
    goal: Vec2,
  ): Vec2[] {
    const reversed: Vec2[] = [goal];
    let current = goalKey;
    while (current !== startKey) {
      const previous = cameFrom.get(current);
      if (previous === undefined) return [];
      if (previous !== startKey) reversed.push(this.cellCenter(this.fromKey(previous)));
      current = previous;
    }
    const path = reversed.reverse();
    return smoothPath(start, path, this.obstacles, this.actorRadius + this.margin);
  }

  private nearestOpen(origin: GridCell): GridCell {
    if (!this.isBlocked(origin)) return origin;
    for (let radius = 1; radius <= 6; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const candidate = { x: origin.x + dx, y: origin.y + dy };
          if (this.inBounds(candidate) && !this.isBlocked(candidate)) return candidate;
        }
      }
    }
    return origin;
  }

  private heuristic(a: GridCell, b: GridCell): number {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  }

  private toCell(point: Vec2): GridCell {
    return {
      x: Math.max(0, Math.min(this.columns - 1, Math.floor(point.x / this.cellSize))),
      y: Math.max(0, Math.min(this.columns - 1, Math.floor(point.y / this.cellSize))),
    };
  }

  private cellCenter(cell: GridCell): Vec2 {
    return { x: cell.x * this.cellSize + this.cellSize / 2, y: cell.y * this.cellSize + this.cellSize / 2 };
  }

  private key(x: number, y: number): number {
    return y * this.columns + x;
  }

  private fromKey(key: number): GridCell {
    return { x: key % this.columns, y: Math.floor(key / this.columns) };
  }

  private inBounds(cell: GridCell): boolean {
    return cell.x >= 0 && cell.y >= 0 && cell.x < this.columns && cell.y < this.columns;
  }

  private isBlocked(cell: GridCell): boolean {
    return this.blocked.has(this.key(cell.x, cell.y));
  }
}

export function findPath(start: Vec2, goal: Vec2, obstacles: readonly Circle[], radius: number): Vec2[] {
  return new NavigationGrid(obstacles, radius).find(start, goal);
}

export function pathIntersectsObstacle(
  start: Vec2,
  path: readonly Vec2[],
  obstacles: readonly Circle[],
  actorRadius: number,
  margin = BALANCE.navigation.obstacleMargin,
): boolean {
  let previous = start;
  for (const point of path) {
    for (const obstacle of obstacles) {
      if (segmentHitsCircle(previous, point, obstacle, actorRadius + margin)) return true;
    }
    previous = point;
  }
  return false;
}

function smoothPath(
  start: Vec2,
  points: readonly Vec2[],
  obstacles: readonly Circle[],
  inflate: number,
): Vec2[] {
  if (points.length <= 1) return [...points];
  const route = [start, ...points];
  const result: Vec2[] = [];
  let anchorIndex = 0;
  while (anchorIndex < route.length - 1) {
    const anchor = route[anchorIndex];
    if (!anchor) break;
    let nextIndex = route.length - 1;
    while (nextIndex > anchorIndex + 1) {
      const candidate = route[nextIndex];
      if (candidate && obstacles.every((obstacle) => !segmentHitsCircle(anchor, candidate, obstacle, inflate))) break;
      nextIndex -= 1;
    }
    const next = route[nextIndex];
    if (!next) break;
    result.push(next);
    anchorIndex = nextIndex;
  }
  return result;
}

function segmentHitsCircle(start: Vec2, end: Vec2, obstacle: Circle, inflate: number): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((obstacle.x - start.x) * dx + (obstacle.y - start.y) * dy) / lengthSquared));
  const closestX = start.x + dx * projection;
  const closestY = start.y + dy * projection;
  return Math.hypot(closestX - obstacle.x, closestY - obstacle.y) < obstacle.radius + inflate;
}
