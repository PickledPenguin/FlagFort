import { BALANCE } from "./config";
import { NavigationGrid } from "./pathfinding";
import { SeededRng } from "./rng";
import { SpatialHash, distance, overlaps, segmentCircle } from "./spatial";
import type { Circle, ResourceKind, ResourceNode, Vec2, World } from "./types";
import type { CampaignTierId } from "./types";
import { campaignTier } from "./campaign";

const center = BALANCE.mapSize / 2;
const ordinaryZombieRadius = Math.max(
  BALANCE.enemy.basic.radius,
  BALANCE.enemy.runner.radius,
  BALANCE.enemy.breaker.radius,
  BALANCE.enemy.jumper.radius,
  BALANCE.enemy.summoner.radius,
);
const portalAngles = Array.from({ length: 8 }, (_, index) => index / 8 * Math.PI * 2);

function intendedPortalRegions(): Circle[] {
  return portalAngles.map((angle) => ({
    x: center + Math.cos(angle) * BALANCE.resource.validationPortalDistance,
    y: center + Math.sin(angle) * BALANCE.resource.validationPortalDistance,
    radius: BALANCE.portal.noBuildRadius,
  }));
}

function blocksValidationLane(candidate: Circle): boolean {
  const lanePadding = candidate.radius + BALANCE.navigation.zombieClearance
    + BALANCE.navigation.cellSize * 0.5;
  const radialDistance = distance(candidate, { x: center, y: center });
  if (Math.abs(radialDistance - BALANCE.resource.validationPortalDistance) < lanePadding) return true;
  const inflated = {
    ...candidate,
    radius: lanePadding,
  };
  return intendedPortalRegions().filter((_, index) => index % 2 === 0).some((portal) =>
    segmentCircle(center, center, portal.x, portal.y, inflated));
}

function createClearings(rng: SeededRng): Circle[] {
  return Array.from({ length: 12 }, (_, index) => {
    const angle = rng.range(0, Math.PI * 2);
    const radialDistance = index === 0 ? 0 : rng.range(460, 1450);
    return {
      x: center + Math.cos(angle) * radialDistance,
      y: center + Math.sin(angle) * radialDistance,
      radius: index === 0 ? 500 : rng.range(160, 350),
    };
  });
}

function resourceCount(kind: ResourceKind, multiplier: number): number {
  return Math.max(1, Math.floor(BALANCE.resource.counts[kind] * multiplier));
}

function placeResources(rng: SeededRng, resourceMultiplier: number): ResourceNode[] | null {
  const resources: ResourceNode[] = [];
  const spatial = new SpatialHash<ResourceNode>(180);
  const portals = intendedPortalRegions();
  let id = 1;
  const kinds = Object.keys(BALANCE.resource.counts) as ResourceKind[];
  for (const kind of kinds) {
    const count = resourceCount(kind, resourceMultiplier);
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 180) {
      attempts += 1;
      const angle = rng.range(0, Math.PI * 2);
      const radialDistance = rng.range(BALANCE.flagGenerationRadius, BALANCE.mapSize * 0.46);
      const x = center + Math.cos(angle) * radialDistance + rng.range(-145, 145);
      const y = center + Math.sin(angle) * radialDistance + rng.range(-145, 145);
      const radius = BALANCE.resource.radius[kind];
      const candidate = { x, y, radius };
      if (x < radius + 50 || y < radius + 50
        || x > BALANCE.mapSize - radius - 50 || y > BALANCE.mapSize - radius - 50) continue;
      if (distance(candidate, { x: center, y: center }) < BALANCE.flagGenerationRadius + radius) continue;
      if (portals.some((portal) => overlaps(candidate, portal, BALANCE.navigation.zombieClearance))) continue;
      if (blocksValidationLane(candidate)) continue;
      if (spatial.query(x, y, radius + 180).some((node) =>
        distance(candidate, node)
          < radius + node.radius + BALANCE.resource.minimumBoundarySeparation)) continue;
      const maxHealth = BALANCE.resource.health[kind];
      const node = { id: id++, kind, x, y, radius, health: maxHealth, maxHealth, hitFlash: 0 };
      resources.push(node);
      spatial.insert(node);
      placed += 1;
    }
    if (placed < count) return null;
  }
  return resources;
}

function validateResources(resources: ResourceNode[]): World["navigation"] {
  const obstacles = resources.filter((node) => !node.destroyed);
  const navigation = new NavigationGrid(
    obstacles,
    ordinaryZombieRadius,
    BALANCE.navigation.zombieClearance - ordinaryZombieRadius,
  );
  const flagGoal = { x: center, y: center };
  const routes = intendedPortalRegions().map((portal) => navigation.find(portal, flagGoal));
  const invalidGaps: Vec2[] = [];
  const spatial = new SpatialHash<ResourceNode>(180);
  for (const node of resources) {
    for (const other of spatial.query(node.x, node.y, 220)) {
      const boundaryGap = distance(node, other) - node.radius - other.radius;
      if (boundaryGap < ordinaryZombieRadius * 2 + BALANCE.navigation.obstacleMargin) {
        invalidGaps.push({ x: (node.x + other.x) / 2, y: (node.y + other.y) / 2 });
      }
    }
    spatial.insert(node);
  }
  return {
    valid: routes.every((route) => route.length > 0) && invalidGaps.length === 0,
    routes,
    invalidGaps,
    attempts: 0,
    fallback: false,
  };
}

function fallbackResources(seed: string, resourceMultiplier: number): ResourceNode[] {
  const rng = new SeededRng(`${seed}:world:fallback`);
  const resources: ResourceNode[] = [];
  const kinds = Object.keys(BALANCE.resource.counts) as ResourceKind[];
  const portals = intendedPortalRegions();
  let id = 1;
  const candidates: Vec2[] = [];
  const spacing = 170;
  const rowSpacing = spacing * Math.sqrt(3) / 2;
  let row = 0;
  for (let y = 110; y <= BALANCE.mapSize - 110; y += rowSpacing) {
    const offset = row % 2 === 0 ? 0 : spacing / 2;
    for (let x = 110 + offset; x <= BALANCE.mapSize - 110; x += spacing) {
      const candidate = { x, y };
      if (distance(candidate, { x: center, y: center }) < BALANCE.flagGenerationRadius + 50) continue;
      if (portals.some((portal) => overlaps({ ...candidate, radius: 44 }, portal, BALANCE.navigation.zombieClearance))) continue;
      if (blocksValidationLane({ ...candidate, radius: 44 })) continue;
      candidates.push(candidate);
    }
    row += 1;
  }
  const shuffled = rng.shuffle(candidates);
  let index = 0;
  for (const kind of kinds) {
    const count = resourceCount(kind, resourceMultiplier);
    for (let placed = 0; placed < count; placed += 1) {
      const position = shuffled[index];
      if (!position) throw new Error("Deterministic fallback resource layout exhausted.");
      const radius = BALANCE.resource.radius[kind];
      resources.push({
        id: id++,
        kind,
        x: position.x,
        y: position.y,
        radius,
        health: BALANCE.resource.health[kind],
        maxHealth: BALANCE.resource.health[kind],
        hitFlash: 0,
      });
      index += 1;
    }
  }
  return resources;
}

export function generateWorld(
  seed: string,
  resourceMultiplier = 1,
  campaignTierId: CampaignTierId = "forest",
): World {
  let selectedResources: ResourceNode[] | null = null;
  let selectedNavigation: World["navigation"] | null = null;
  let attempts = 0;
  for (let attempt = 0; attempt < BALANCE.resource.generationRetries; attempt += 1) {
    attempts = attempt + 1;
    const resources = placeResources(
      new SeededRng(`${seed}:world:resources:${attempt}`),
      resourceMultiplier,
    );
    if (!resources) continue;
    const navigation = validateResources(resources);
    if (!navigation.valid) continue;
    selectedResources = resources;
    selectedNavigation = navigation;
    break;
  }
  if (!selectedResources || !selectedNavigation) {
    selectedResources = fallbackResources(seed, resourceMultiplier);
    selectedNavigation = validateResources(selectedResources);
    selectedNavigation.fallback = true;
  }
  selectedNavigation.attempts = attempts;
  const sceneryRng = new SeededRng(`${seed}:world:scenery`);
  const snowRng = new SeededRng(`${seed}:world:resource-snow:${campaignTierId}`);
  const snowChance = campaignTier(campaignTierId).biome.resourceSnowChance;
  for (const node of selectedResources) node.snowCovered = snowRng.next() < snowChance;
  const clearings = createClearings(sceneryRng);
  const foliage = Array.from({ length: 260 }, () => {
    const x = sceneryRng.range(30, BALANCE.mapSize - 30);
    const y = sceneryRng.range(30, BALANCE.mapSize - 30);
    return { x, y, radius: sceneryRng.range(8, 22), shade: sceneryRng.int(0, 3) };
  }).filter((item) => distance(item, { x: center, y: center }) > 430);
  return {
    seed,
    clearings,
    resources: selectedResources,
    foliage,
    navigation: selectedNavigation,
  };
}
