import { campaignTier } from "./campaign";
import type { CampaignTierId, Projectile } from "./types";

export function projectileVisualColor(
  projectile: Pick<Projectile, "owner" | "color">,
  campaignTierId: CampaignTierId,
): string {
  const friendlyProjectileColor = campaignTier(campaignTierId).biome.friendlyProjectileColor;
  if (friendlyProjectileColor
    && (projectile.owner === "player" || projectile.owner === "turret")) {
    return friendlyProjectileColor;
  }
  return projectile.color;
}
