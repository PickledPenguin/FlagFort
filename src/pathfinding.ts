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
  readonly columns: number;
  private readonly blocked = new Set<number>();
  private readonly cameFrom: Int32Array;
  private readonly gScore: Float64Array;
  private readonly closed: Uint8Array;
  private readonly heapKeys: number[] = [];
  private readonly heapScores: number[] = [];

  constructor(
    readonly obstacles: readonly Circle[],
    readonly actorRadius: number,
    readonly margin: number = BALANCE.navigation.obstacleMargin,
    readonly cellSize: number = BALANCE.navigation.cellSize,
  ) {
    this.columns = Math.ceil(BALANCE.mapSize / this.cellSize);
    const cellCount = this.columns * this.columns;
    this.cameFrom = new Int32Array(cellCount);
    this.gScore = new Float64Array(cellCount);
    this.closed = new Uint8Array(cellCount);
    this.buildBlockedCells();
  }

  find(start: Vec2, goal: Vec2, goalRadius = 0): Vec2[] {
    if (this.segmentIsClear(
      start,
      goal,
      this.actorRadius + BALANCE.navigation.pathTraversalMargin,
    )) return [goal];
    const path = this.findOnGrid(start, goal, goalRadius);
    if (path.length > 0 || this.cellSize <= BALANCE.navigation.fineCellSize) return path;
    return new NavigationGrid(
      this.obstacles,
      this.actorRadius,
      BALANCE.navigation.pathTraversalMargin,
      BALANCE.navigation.fineCellSize,
    ).find(start, goal, goalRadius);
  }

  private findOnGrid(start: Vec2, goal: Vec2, goalRadius: number): Vec2[] {
    const startCell = this.nearestOpen(this.toCell(start), start);
    const exactGoalCell = this.toCell(goal);
    const exactGoalOpen = !this.isBlocked(exactGoalCell);
    const goalCell = exactGoalOpen
      ? exactGoalCell
      : this.nearestOpenGoal(exactGoalCell, startCell, goal, goalRadius);
    const startKey = this.key(startCell.x, startCell.y);
    const goalKey = this.key(goalCell.x, goalCell.y);
    if (startKey === goalKey) {
      return [exactGoalOpen ? goal : this.cellCenter(goalCell)];
    }

    this.cameFrom.fill(-1);
    this.gScore.fill(Number.POSITIVE_INFINITY);
    this.closed.fill(0);
    this.heapKeys.length = 0;
    this.heapScores.length = 0;
    this.gScore[startKey] = 0;
    this.pushOpen(startKey, this.heuristic(startCell, goalCell));
    let iterations = 0;

    while (this.heapKeys.length > 0 && iterations < this.columns * this.columns * 2) {
      iterations += 1;
      const currentKey = this.popOpen();
      if (currentKey < 0 || this.closed[currentKey]) continue;
      if (currentKey === goalKey) {
        return this.reconstruct(
          this.cameFrom,
          currentKey,
          startKey,
          start,
          goal,
          exactGoalOpen,
        );
      }
      this.closed[currentKey] = 1;
      const current = this.fromKey(currentKey);
      for (const [dx, dy, movementCost] of DIRECTIONS) {
        const next = { x: current.x + dx, y: current.y + dy };
        if (!this.inBounds(next) || this.isBlocked(next)) continue;
        if (!this.canTraverse(current, next)) continue;
        if (dx !== 0 && dy !== 0) {
          if (this.isBlocked({ x: current.x + dx, y: current.y })
            || this.isBlocked({ x: current.x, y: current.y + dy })) continue;
        }
        const nextKey = this.key(next.x, next.y);
        if (this.closed[nextKey]) continue;
        const tentative = this.gScore[currentKey]! + movementCost;
        if (tentative >= this.gScore[nextKey]!) continue;
        this.cameFrom[nextKey] = currentKey;
        this.gScore[nextKey] = tentative;
        this.pushOpen(nextKey, tentative + this.heuristic(next, goalCell));
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
          const rasterPadding = this.cellSize > BALANCE.navigation.fineCellSize
            ? this.cellSize * 0.42
            : 0;
          if (Math.hypot(point.x - obstacle.x, point.y - obstacle.y) < radius + rasterPadding) {
            this.blocked.add(this.key(x, y));
          }
        }
      }
    }
  }

  private canTraverse(from: GridCell, to: GridCell): boolean {
    const start = this.cellCenter(from);
    const end = this.cellCenter(to);
    return this.segmentIsClear(start, end);
  }

  private segmentIsClear(
    start: Vec2,
    end: Vec2,
    inflate = this.actorRadius + this.margin,
  ): boolean {
    return this.obstacles.every((obstacle) =>
      !segmentHitsCircle(start, end, obstacle, inflate));
  }

  private reconstruct(
    cameFrom: Int32Array,
    goalKey: number,
    startKey: number,
    start: Vec2,
    goal: Vec2,
    useExactGoal: boolean,
  ): Vec2[] {
    const reversed: Vec2[] = [useExactGoal ? goal : this.cellCenter(this.fromKey(goalKey))];
    let current = goalKey;
    while (current !== startKey) {
      const previous = cameFrom[current] ?? -1;
      if (previous < 0) return [];
      if (previous !== startKey) reversed.push(this.cellCenter(this.fromKey(previous)));
      current = previous;
    }
    const path = reversed.reverse();
    return smoothPath(start, path, this.obstacles, this.actorRadius + this.margin);
  }

  private pushOpen(key: number, score: number): void {
    let index = this.heapKeys.length;
    this.heapKeys.push(key);
    this.heapScores.push(score);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.openEntryBefore(index, parent)) break;
      this.swapOpen(index, parent);
      index = parent;
    }
  }

  private popOpen(): number {
    const first = this.heapKeys[0];
    const lastKey = this.heapKeys.pop();
    const lastScore = this.heapScores.pop();
    if (first === undefined || lastKey === undefined || lastScore === undefined) return -1;
    if (this.heapKeys.length === 0) return first;
    this.heapKeys[0] = lastKey;
    this.heapScores[0] = lastScore;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < this.heapKeys.length && this.openEntryBefore(left, best)) best = left;
      if (right < this.heapKeys.length && this.openEntryBefore(right, best)) best = right;
      if (best === index) break;
      this.swapOpen(index, best);
      index = best;
    }
    return first;
  }

  private openEntryBefore(a: number, b: number): boolean {
    const aScore = this.heapScores[a] ?? Number.POSITIVE_INFINITY;
    const bScore = this.heapScores[b] ?? Number.POSITIVE_INFINITY;
    if (aScore !== bScore) return aScore < bScore;
    return (this.heapKeys[a] ?? Number.POSITIVE_INFINITY)
      < (this.heapKeys[b] ?? Number.POSITIVE_INFINITY);
  }

  private swapOpen(a: number, b: number): void {
    const key = this.heapKeys[a]!;
    this.heapKeys[a] = this.heapKeys[b]!;
    this.heapKeys[b] = key;
    const score = this.heapScores[a]!;
    this.heapScores[a] = this.heapScores[b]!;
    this.heapScores[b] = score;
  }

  private nearestOpen(origin: GridCell, exactStart?: Vec2): GridCell {
    if (!this.isBlocked(origin)) return origin;
    let fallback: GridCell | null = null;
    let fallbackDistance = Number.POSITIVE_INFINITY;
    for (let radius = 1; radius <= 6; radius += 1) {
      let best: GridCell | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const candidate = { x: origin.x + dx, y: origin.y + dy };
          if (!this.inBounds(candidate) || this.isBlocked(candidate)) continue;
          const center = this.cellCenter(candidate);
          const candidateDistance = exactStart
            ? Math.hypot(center.x - exactStart.x, center.y - exactStart.y)
            : Math.hypot(dx, dy);
          if (candidateDistance < fallbackDistance
            || (candidateDistance === fallbackDistance && fallback
              && this.key(candidate.x, candidate.y) < this.key(fallback.x, fallback.y))) {
            fallback = candidate;
            fallbackDistance = candidateDistance;
          }
          const reachable = !exactStart || this.obstacles.every((obstacle) =>
            !segmentHitsCircle(
              exactStart,
              center,
              obstacle,
              this.actorRadius + this.margin,
            ));
          if (!reachable) continue;
          if (candidateDistance < bestDistance
            || (candidateDistance === bestDistance && best
              && this.key(candidate.x, candidate.y) < this.key(best.x, best.y))) {
            best = candidate;
            bestDistance = candidateDistance;
          }
        }
      }
      if (best) return best;
    }
    return fallback ?? origin;
  }

  private nearestOpenGoal(
    origin: GridCell,
    start: GridCell,
    goal: Vec2,
    goalRadius: number,
  ): GridCell {
    const maximumCellRadius = Math.max(
      1,
      Math.ceil((Math.max(0, goalRadius) + this.cellSize * 0.5) / this.cellSize),
    );
    let best: GridCell | null = null;
    let bestStartDistance = Number.POSITIVE_INFINITY;
    let bestGoalDistance = Number.POSITIVE_INFINITY;
    for (let radius = 1; radius <= Math.max(6, maximumCellRadius); radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const candidate = { x: origin.x + dx, y: origin.y + dy };
          if (!this.inBounds(candidate) || this.isBlocked(candidate)) continue;
          const center = this.cellCenter(candidate);
          const goalDistance = Math.hypot(center.x - goal.x, center.y - goal.y);
          if (goalRadius > 0 && goalDistance > goalRadius) continue;
          const startDistance = this.heuristic(candidate, start);
          if (!best || startDistance < bestStartDistance
            || (startDistance === bestStartDistance && goalDistance < bestGoalDistance)
            || (startDistance === bestStartDistance && goalDistance === bestGoalDistance
              && this.key(candidate.x, candidate.y) < this.key(best.x, best.y))) {
            best = candidate;
            bestStartDistance = startDistance;
            bestGoalDistance = goalDistance;
          }
        }
      }
      if (best) return best;
    }
    return this.nearestOpen(origin);
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
  margin = BALANCE.navigation.pathTraversalMargin,
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
