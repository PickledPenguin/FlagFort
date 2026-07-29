import type { EnemyKind, ResourceKind, StructureKind, Tier } from "./types";

const image = (path: string): string => `./images/${path}.svg`;

export const ASSETS = {
  resources: {
    wood: image("resources/wood-log"),
    stone: image("resources/stone"),
    gold: image("resources/gold"),
    diamond: image("resources/diamond"),
  } satisfies Record<ResourceKind, string>,
  resourceStates: {
    wood: { active: image("world/tree-active"), depleted: image("world/tree-depleted") },
    stone: { active: image("world/stone-active"), depleted: image("world/stone-depleted") },
    gold: { active: image("world/gold-active"), depleted: image("world/gold-depleted") },
    diamond: { active: image("world/diamond-active"), depleted: image("world/diamond-depleted") },
  } satisfies Record<ResourceKind, Record<"active" | "depleted", string>>,
  enemies: {
    basic: image("enemies/basic-zombie"),
    runner: image("enemies/runner-zombie"),
    breaker: image("enemies/breaker-zombie"),
    jumper: image("enemies/jumper-zombie"),
    summoner: image("enemies/summoner-zombie"),
    boss: image("enemies/countdown-boss"),
  } satisfies Record<EnemyKind, string>,
  cracks: [
    image("structures/crack-small"),
    image("structures/crack-25"),
    image("structures/crack-50"),
    image("structures/crack-75"),
  ],
  ui: Object.fromEntries([
    "heart", "timer", "settings", "play", "book", "maximize",
    "shuffle", "restart", "close", "arrow-left", "arrow-right", "skip", "copy", "pause",
  ].map((name) => [name, image(`ui/${name}`)])) as Record<string, string>,
  structures: Object.fromEntries(
    (["wall", "door", "spikes", "harvester", "turret"] as StructureKind[]).map((kind) => [
      kind,
      Object.fromEntries((["wood", "stone", "gold", "diamond"] as Tier[]).map((tier) => [
        tier,
        image(`structures/${kind}`),
      ])),
    ]),
  ) as Record<StructureKind, Record<Tier, string>>,
} as const;

export function allAssetPaths(value: unknown = ASSETS): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap((entry) => allAssetPaths(entry));
}
