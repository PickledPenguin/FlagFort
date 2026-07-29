import type { StructureKind, Tier } from "./types";

export type BuildBarActionIcon =
  | "fists"
  | "repair-wrench"
  | "nighttime-bow"
  | "recycle-mallet";

export type BuildBarIndicatorIcon =
  | "locked"
  | "selected-tier"
  | "upgrade-arrow"
  | "material-tier-badge";

export type BuildBarIconName = BuildBarActionIcon | StructureKind | BuildBarIndicatorIcon;

const buildBarImage = (category: "actions" | "structures" | "indicators", name: string): string =>
  `./images/ui/build-bar/${category}/${name}.svg`;

export const BUILD_BAR_ICON_PATHS = {
  fists: buildBarImage("actions", "fists"),
  "repair-wrench": buildBarImage("actions", "repair-wrench"),
  "nighttime-bow": buildBarImage("actions", "nighttime-bow"),
  "recycle-mallet": buildBarImage("actions", "recycle-mallet"),
  wall: buildBarImage("structures", "wall"),
  spikes: buildBarImage("structures", "spikes"),
  door: buildBarImage("structures", "door"),
  harvester: buildBarImage("structures", "harvester"),
  turret: buildBarImage("structures", "turret"),
  locked: buildBarImage("indicators", "locked"),
  "selected-tier": buildBarImage("indicators", "selected-tier"),
  "upgrade-arrow": buildBarImage("indicators", "upgrade-arrow"),
  "material-tier-badge": buildBarImage("indicators", "material-tier-badge"),
} as const satisfies Record<BuildBarIconName, string>;

type BuildBarIconOptions = {
  className?: string;
  tier?: Tier;
  large?: boolean;
};

export function buildBarIcon(name: BuildBarIconName, options: BuildBarIconOptions = {}): string {
  const { className = "", tier, large = false } = options;
  const classes = [
    "build-bar-icon",
    `build-bar-icon-${name}`,
    tier,
    large ? "large" : "",
    className,
  ].filter(Boolean).join(" ");

  return `<svg class="${classes}" aria-hidden="true"><use href="${BUILD_BAR_ICON_PATHS[name]}#icon"></use></svg>`;
}
