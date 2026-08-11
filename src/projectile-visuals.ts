import type { CampaignTierId, Projectile } from "./types";

export const SNOW_ARROW_COLOR = "#704321";

export function projectileVisualColor(
  projectile: Pick<Projectile, "owner" | "color">,
  campaignTierId: CampaignTierId,
): string {
  if (campaignTierId === "snowy"
    && (projectile.owner === "player" || projectile.owner === "turret")) {
    return SNOW_ARROW_COLOR;
  }
  return projectile.color;
}
