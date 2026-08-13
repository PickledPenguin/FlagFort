import { BALANCE } from "./config";
import { isBurning, isSlowed } from "./status-effects";
import { allAssetPaths, ASSETS } from "./assets";
import { BUILD_BAR_ICON_PATHS } from "./build-bar-icons";
import { ENEMY_REGISTRY } from "./enemy-registry";
import type { Game } from "./game";
import { META_BALANCE } from "./meta-balance";
import { affordability, type ResourceWallet } from "./rules";
import { costLayoutRows } from "./cost-layout";
import { projectileVisualColor } from "./projectile-visuals";
import { SeededRng } from "./rng";
import type { CampaignBiomeDefinition } from "./campaign";
import type { AreaStrike, Enemy, EnemyKind, Player, ResourceNode, Structure } from "./types";

const resourceColors = {
  wood: "#315f37",
  stone: "#87949a",
  gold: "#d7aa24",
  diamond: "#42c9d4",
};

const center = BALANCE.mapSize / 2;

export interface WeatherParticleDefinition {
  x: number;
  y: number;
  fallSpeed: number;
  radius: number;
  driftAmplitude: number;
  driftSpeed: number;
  phase: number;
  spawnGap: number;
}

type ParticleWeather = NonNullable<CampaignBiomeDefinition["weather"]>;

export function createWeatherField(
  seed: string,
  count: number,
  weather: ParticleWeather,
): WeatherParticleDefinition[] {
  const rng = new SeededRng(`${seed}:visual:${weather.seedKey}`);
  return Array.from({ length: count }, () => ({
    x: rng.range(0, BALANCE.mapSize),
    y: rng.range(0, BALANCE.mapSize),
    fallSpeed: rng.range(...weather.fallSpeed),
    radius: rng.range(...weather.radius),
    driftAmplitude: rng.range(...weather.driftAmplitude),
    driftSpeed: rng.range(...weather.driftSpeed),
    phase: rng.range(0, Math.PI * 2),
    spawnGap: rng.range(
      weather.spawnGapRatio[0] * BALANCE.mapSize,
      weather.spawnGapRatio[1] * BALANCE.mapSize,
    ),
  }));
}

export function enemyAttackTelegraphColor(kind: EnemyKind): string {
  return ENEMY_REGISTRY[kind].projectile?.color ?? "rgba(255,78,68,.75)";
}

const SWORD_SPRITE_BOUNDS = { x: -18, y: -72, width: 72, height: 79 } as const;
const SWORD_ASSET_VIEW_BOX = { x: -14, y: -48, width: 88, height: 96 } as const;
const SWORD_HANDLE_POINTS = [
  { x: 10.015, y: 22.044 },
  { x: -3.104, y: 36.908 },
] as const;

function swordHandlePoint(point: (typeof SWORD_HANDLE_POINTS)[number]): { x: number; y: number } {
  return {
    x: SWORD_SPRITE_BOUNDS.x
      + (point.x - SWORD_ASSET_VIEW_BOX.x) / SWORD_ASSET_VIEW_BOX.width * SWORD_SPRITE_BOUNDS.width,
    y: SWORD_SPRITE_BOUNDS.y
      + (point.y - SWORD_ASSET_VIEW_BOX.y) / SWORD_ASSET_VIEW_BOX.height * SWORD_SPRITE_BOUNDS.height,
  };
}

const SWORD_HAND_CENTERS = SWORD_HANDLE_POINTS.map(swordHandlePoint);
const structureSpriteSize = {
  wall: 84,
  door: 86,
  spikes: 92,
  harvester: 96,
  turret: 90,
} as const;
const harvesterArmSpriteWidth = {
  wood: 120,
  stone: 130,
  gold: 142,
  diamond: 156,
} as const;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly tintedSprites = new Map<string, HTMLCanvasElement>();
  private readonly filteredSprites = new Map<string, HTMLCanvasElement>();
  private time = 0;
  private weatherIntensity = 0;
  private weatherFieldKey = "";
  private weatherField: WeatherParticleDefinition[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    this.ctx = ctx;
    const spritePaths = [...new Set([...allAssetPaths(), ...Object.values(BUILD_BAR_ICON_PATHS)])];
    for (const path of spritePaths) {
      const image = new Image();
      image.src = path;
      this.images.set(path, image);
    }
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private drawSprite(
    path: string,
    x: number,
    y: number,
    width: number,
    height: number,
    flash = false,
  ): boolean {
    const sprite = this.images.get(path);
    if (!sprite?.complete || sprite.naturalWidth <= 0) return false;
    const ctx = this.ctx;
    ctx.save();
    if (flash) ctx.filter = "brightness(0) invert(1)";
    ctx.drawImage(sprite, x, y, width, height);
    ctx.restore();
    return true;
  }

  private drawTintedSprite(
    path: string,
    color: string,
    x: number,
    y: number,
    width: number,
    height: number,
    flash = false,
  ): boolean {
    const sprite = this.images.get(path);
    if (!sprite?.complete || sprite.naturalWidth <= 0) return false;
    const key = `${path}:${color}`;
    let tinted = this.tintedSprites.get(key);
    if (!tinted) {
      tinted = document.createElement("canvas");
      tinted.width = 96;
      tinted.height = 96;
      const tintContext = tinted.getContext("2d");
      if (!tintContext) return false;
      tintContext.drawImage(sprite, 0, 0, 96, 96);
      tintContext.globalCompositeOperation = "source-in";
      tintContext.fillStyle = color;
      tintContext.fillRect(0, 0, 96, 96);
      this.tintedSprites.set(key, tinted);
    }
    if (flash) {
      this.ctx.save();
      this.ctx.filter = "brightness(0) invert(1)";
      this.ctx.drawImage(tinted, x, y, width, height);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(tinted, x, y, width, height);
    }
    return true;
  }

  private drawFilteredSprite(
    path: string,
    filter: string | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
    flash = false,
  ): boolean {
    if (!filter) return this.drawSprite(path, x, y, width, height, flash);
    const sprite = this.images.get(path);
    if (!sprite?.complete || sprite.naturalWidth <= 0) return false;
    const key = `${path}:${filter}`;
    let filtered = this.filteredSprites.get(key);
    if (!filtered) {
      filtered = document.createElement("canvas");
      filtered.width = sprite.naturalWidth;
      filtered.height = sprite.naturalHeight;
      const filterContext = filtered.getContext("2d");
      if (!filterContext) return false;
      filterContext.filter = filter;
      filterContext.drawImage(sprite, 0, 0);
      this.filteredSprites.set(key, filtered);
    }
    this.ctx.save();
    if (flash) this.ctx.filter = "brightness(0) invert(1)";
    this.ctx.drawImage(filtered, x, y, width, height);
    this.ctx.restore();
    return true;
  }

  private drawCenteredOverlay(
    path: string,
    x: number,
    y: number,
    radius: number,
    viewBoxSize: number,
  ): boolean {
    const size = radius * viewBoxSize / 50;
    return this.drawSprite(path, x - size / 2, y - size / 2, size, size);
  }

  private resize(): void {
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = BALANCE.logicalWidth * ratio;
    this.canvas.height = BALANCE.logicalHeight * ratio;
    this.canvas.style.aspectRatio = `${BALANCE.logicalWidth} / ${BALANCE.logicalHeight}`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  render(game: Game, dt: number): void {
    this.time += dt;
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, BALANCE.logicalWidth, BALANCE.logicalHeight);
    const biomePalette = game.getCampaignTier().biome.palette;
    const viewportColor = game.tutorialMode ? "#000000" : biomePalette.viewport;
    this.canvas.style.backgroundColor = viewportColor;
    document.documentElement.style.setProperty("--biome-viewport", viewportColor);
    ctx.fillStyle = viewportColor;
    ctx.fillRect(0, 0, BALANCE.logicalWidth, BALANCE.logicalHeight);

    const shakeX = game.tutorialMode ? 0 : Math.sin(this.time * 71) * game.shake;
    const shakeY = game.tutorialMode ? 0 : Math.cos(this.time * 83) * game.shake;
    ctx.translate(
      BALANCE.logicalWidth / 2 - game.camera.x + shakeX,
      BALANCE.logicalHeight / 2 - game.camera.y + shakeY,
    );
    if (game.tutorialMode) {
      ctx.beginPath();
      ctx.arc(center, center, BALANCE.tutorialArena.radius, 0, Math.PI * 2);
      ctx.clip();
    }
    this.drawWorld(game);
    this.drawBiomeWeather(game, dt);
    for (const effect of game.areaEffects) {
      if (effect.kind === "frost-slam") this.drawAreaEffect(effect);
    }
    if (game.tutorialMode) this.drawTutorialArenaFade();
    ctx.restore();
    if (game.timeRewind) {
      const progress = Math.min(1, game.timeRewind.elapsed / BALANCE.tierMechanics.clockwork.rewindDuration);
      const radius = Math.max(1, Math.hypot(BALANCE.logicalWidth, BALANCE.logicalHeight) * progress);
      ctx.save();
      const gradient = ctx.createRadialGradient(BALANCE.logicalWidth / 2, BALANCE.logicalHeight / 2, 0, BALANCE.logicalWidth / 2, BALANCE.logicalHeight / 2, radius);
      gradient.addColorStop(0, "rgba(121,231,223,.08)");
      gradient.addColorStop(0.82, "rgba(121,231,223,.18)");
      gradient.addColorStop(1, "rgba(255,240,184,.62)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, BALANCE.logicalWidth, BALANCE.logicalHeight);
      ctx.restore();
    }
    if (game.tutorialMode) this.drawTutorialArenaBoundary();
    else {
      this.drawVignette(game);
      this.drawMinimap(game);
    }
  }

  private drawTutorialArenaFade(): void {
    const radius = BALANCE.tutorialArena.radius;
    this.drawCenteredOverlay(ASSETS.tutorial.arenaFade, center, center, radius, 100);
  }

  private drawTutorialArenaBoundary(): void {
    this.drawCenteredOverlay(
      ASSETS.tutorial.arenaBoundary,
      BALANCE.logicalWidth / 2,
      BALANCE.logicalHeight / 2,
      BALANCE.tutorialArena.radius - BALANCE.tutorialArena.boundaryInset,
      103,
    );
  }

  private visible(game: Game, x: number, y: number, radius: number): boolean {
    return Math.abs(x - game.camera.x) < BALANCE.logicalWidth / 2 + radius
      && Math.abs(y - game.camera.y) < BALANCE.logicalHeight / 2 + radius;
  }

  private drawWorld(game: Game): void {
    const ctx = this.ctx;
    const palette = game.getCampaignTier().biome.palette;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, BALANCE.mapSize, BALANCE.mapSize);
    for (const clearing of game.world.clearings) {
      if (!this.visible(game, clearing.x, clearing.y, clearing.radius)) continue;
      const gradient = ctx.createRadialGradient(clearing.x, clearing.y, 0, clearing.x, clearing.y, clearing.radius);
      gradient.addColorStop(0, palette.clearingCenter);
      gradient.addColorStop(1, palette.clearingEdge);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(clearing.x, clearing.y, clearing.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const foliage of game.world.foliage) {
      if (!this.visible(game, foliage.x, foliage.y, foliage.radius)) continue;
      ctx.fillStyle = palette.foliage[foliage.shade] ?? palette.foliage[1];
      ctx.beginPath();
      ctx.arc(foliage.x, foliage.y, foliage.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (game.hasActiveFlag()) {
      this.drawCenteredOverlay(
        ASSETS.flag.protectionBoundary,
        game.flag.x,
        game.flag.y,
        BALANCE.flagProtectedRadius,
        104,
      );
    }
    if (game.tutorialMode) this.drawTutorialMarkers(game);

    for (const node of game.world.resources) {
      if (node.destroyed) continue;
      if (this.visible(game, node.x, node.y, node.radius)) {
        this.drawResource(node, game.getCampaignTier().biome);
      }
    }
    if (game.debugNavigation) this.drawNavigationDebug(game);
    for (const portal of game.portals) {
      if (!this.visible(game, portal.x, portal.y, portal.radius + 60)) continue;
      const selectedAction = game.getSelectedAction();
      if (!["fists", "tool", "recycle"].includes(selectedAction)) {
        this.drawCenteredOverlay(
          ASSETS.portal.noBuildZone,
          portal.x,
          portal.y,
          BALANCE.portal.noBuildRadius,
          104,
        );
      }
      const pulse = 1 + Math.sin(this.time * 4 + portal.id) * 0.08;
      ctx.save();
      ctx.translate(portal.x, portal.y);
      ctx.scale(pulse, pulse);
      this.drawSprite(ASSETS.portal.outer, -56, -56, 112, 112, portal.flash > 0);
      ctx.save();
      ctx.rotate(this.time * 1.8);
      this.drawSprite(ASSETS.portal.inner, -42, -42, 84, 84);
      ctx.restore();
      ctx.fillStyle = "#d9cbff";
      ctx.textAlign = "center";
      ctx.font = "800 20px system-ui";
      ctx.fillText(game.phase === "day" ? `${Math.ceil(game.timer)}` : `${Math.max(0, portal.assignedSpawns - portal.spawned)}`, 0, 7);
      ctx.font = "700 11px system-ui";
      ctx.fillText(game.phase === "day" ? "UNTIL OPEN" : "REMAIN", 0, 25);
      ctx.restore();
      this.healthBar(portal.x, portal.y - portal.radius - 18, 70, portal.health / portal.maxHealth, "#9b79ff");
    }
    this.drawSandTunnels(game);
    if (game.hasActiveFlag()) this.drawFlag(game);
    for (const structure of game.structures) {
      if (this.visible(game, structure.x, structure.y, structure.radius + 140)) this.drawStructure(structure, game.player);
    }
    for (const effect of game.areaEffects) {
      if (effect.kind !== "frost-slam"
        && this.visible(game, effect.x, effect.y, effect.radius + 20)) this.drawAreaEffect(effect);
    }
    for (const strike of game.areaStrikes) {
      if (this.visible(game, strike.x, strike.y, strike.radius + 30)) this.drawAreaStrike(strike);
    }
    if (game.buildPreview) this.drawBuildPreview(game);
    for (const projectile of game.projectiles) {
      if (!this.visible(game, projectile.x, projectile.y, projectile.radius + 70)) continue;
      if (projectile.appearance === "aether") {
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
        const trail = Math.max(34, projectile.radius * 5.2);
        const gradient = ctx.createLinearGradient(-trail, 0, projectile.radius, 0);
        gradient.addColorStop(0, "rgba(121,231,223,0)");
        gradient.addColorStop(0.48, "rgba(121,231,223,.4)");
        gradient.addColorStop(1, "rgba(229,255,251,.92)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(-trail * 0.36, 0, trail * 0.78, projectile.radius * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#255f63";
        ctx.lineWidth = 2;
        ctx.fillStyle = "#79e7df";
        ctx.beginPath();
        ctx.moveTo(projectile.radius * 1.4, 0);
        ctx.lineTo(-projectile.radius * 0.55, -projectile.radius * 0.72);
        ctx.lineTo(-projectile.radius * 0.9, 0);
        ctx.lineTo(-projectile.radius * 0.55, projectile.radius * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#effffc";
        ctx.beginPath();
        ctx.ellipse(projectile.radius * 0.32, -projectile.radius * 0.16, projectile.radius * 0.48, projectile.radius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (projectile.appearance === "spore") {
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
        const trail = Math.max(28, projectile.radius * 4.2);
        const gradient = ctx.createLinearGradient(-trail, 0, projectile.radius, 0);
        gradient.addColorStop(0, "rgba(104,205,166,0)");
        gradient.addColorStop(0.45, "rgba(104,205,166,.3)");
        gradient.addColorStop(1, "rgba(190,255,226,.72)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(-trail * 0.34, 0, trail * 0.76, projectile.radius * 1.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#68cda6";
        ctx.strokeStyle = "#254f46";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius * 0.82, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#d8fff0";
        for (const [x, y, radius] of [[-0.25, -0.28, 0.24], [0.24, 0.12, 0.18], [-0.18, 0.32, 0.14]] as const) {
          ctx.beginPath();
          ctx.arc(projectile.radius * x, projectile.radius * y, projectile.radius * radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        continue;
      }
      if (projectile.appearance === "comet") {
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
        const trail = Math.max(30, projectile.radius * 4.5);
        const gradient = ctx.createLinearGradient(-trail, 0, projectile.radius, 0);
        gradient.addColorStop(0, "rgba(117,92,255,0)");
        gradient.addColorStop(0.42, "rgba(139,105,255,.48)");
        gradient.addColorStop(0.78, "rgba(80,224,255,.72)");
        gradient.addColorStop(1, "#d8fbff");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(-trail * 0.34, 0, trail * 0.72, projectile.radius * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#65e8ff";
        ctx.strokeStyle = "#7454d8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#f4ffff";
        ctx.beginPath();
        ctx.arc(-projectile.radius * 0.2, -projectile.radius * 0.28, projectile.radius * 0.34, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (projectile.appearance === "sludge") {
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
        const trail = Math.max(22, projectile.radius * 3.6);
        const gradient = ctx.createLinearGradient(-trail, 0, projectile.radius, 0);
        gradient.addColorStop(0, "rgba(117,200,59,0)");
        gradient.addColorStop(0.58, "rgba(117,200,59,.52)");
        gradient.addColorStop(1, "#c4f46e");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(-trail * 0.32, 0, trail * 0.7, projectile.radius * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#75c83b";
        ctx.strokeStyle = "#356b2f";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#efff9c";
        ctx.beginPath();
        ctx.arc(-projectile.radius * 0.25, -projectile.radius * 0.3, projectile.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (projectile.appearance === "magma") {
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
        const trail = Math.max(20, projectile.radius * 3.2);
        const gradient = ctx.createLinearGradient(-trail, 0, projectile.radius, 0);
        gradient.addColorStop(0, "rgba(255,74,24,0)");
        gradient.addColorStop(0.55, "rgba(255,90,28,.58)");
        gradient.addColorStop(1, "#ffb13b");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(-trail * 0.3, 0, trail * 0.72, projectile.radius * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff5a1c";
        ctx.strokeStyle = "#662315";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffe06b";
        ctx.beginPath();
        ctx.arc(-projectile.radius * 0.24, -projectile.radius * 0.28, projectile.radius * 0.34, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (projectile.appearance === "sandblast") {
        ctx.save();
        ctx.translate(projectile.x, projectile.y);
        ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
        const length = Math.max(24, projectile.radius * 4.2);
        const gradient = ctx.createLinearGradient(-length, 0, projectile.radius, 0);
        gradient.addColorStop(0, "rgba(216,168,79,0)");
        gradient.addColorStop(0.45, "rgba(216,168,79,.55)");
        gradient.addColorStop(1, "#f1ca75");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(-length * 0.3, 0, length * 0.7, projectile.radius, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff0b2";
        ctx.beginPath();
        ctx.arc(projectile.radius * 0.25, 0, projectile.radius * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (projectile.owner === "boss-acid" || projectile.owner === "enemy-acid") {
        const size = projectile.radius * 3.4;
        this.drawSprite(
          ASSETS.projectiles.acid,
          projectile.x - size / 2,
          projectile.y - size / 2,
          size,
          size,
        );
        continue;
      }
      ctx.save();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      if (projectile.appearance === "snowball") {
        ctx.fillStyle = "rgba(184,239,255,.35)";
        ctx.beginPath();
        ctx.arc(-projectile.radius * 1.4, 0, projectile.radius * 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f5ffff";
        ctx.strokeStyle = "#8fc8d8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.beginPath();
        ctx.arc(-projectile.radius * 0.25, -projectile.radius * 0.3, projectile.radius * 0.25, 0, Math.PI * 2);
        ctx.fill();
      } else if (projectile.owner === "enemy-arrow") {
        ctx.strokeStyle = "#101214";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5, -5); ctx.lineTo(11, 0); ctx.lineTo(5, 5); ctx.stroke();
      } else {
        this.drawTintedSprite(
          ASSETS.projectiles.arrow,
          projectileVisualColor(projectile, game.activeCampaignTierId),
          -20,
          -4,
          24,
          8,
        );
      }
      ctx.restore();
    }
    for (const enemy of game.enemies) {
      if (this.visible(game, enemy.x, enemy.y, enemy.radius + 40)) this.drawEnemy(enemy, game);
    }
    this.drawPlayer(game);
    if ((game.phase === "day" || game.phase === "night") && game.player.health < game.player.maxHealth) {
      this.healthBar(game.player.x, game.player.y + game.player.radius + 15, 64, game.player.health / game.player.maxHealth, "#ff695f");
    }
    if (game.toolPreview) this.drawToolPreview(game);
    for (const particle of game.particles) {
      if (!this.visible(game, particle.x, particle.y, 40)) continue;
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      if (particle.text) {
        ctx.fillStyle = particle.color;
        ctx.font = "900 15px system-ui";
        ctx.textAlign = "center";
        if (particle.resource) {
          const image = this.images.get(ASSETS.resources[particle.resource]);
          const textWidth = ctx.measureText(particle.text).width;
          const totalWidth = 18 + 4 + textWidth;
          const left = particle.x - totalWidth / 2;
          if (image?.complete && image.naturalWidth > 0) ctx.drawImage(image, left, particle.y - 14, 18, 18);
          ctx.textAlign = "left";
          ctx.fillText(particle.text, left + 22, particle.y);
        } else {
          if (particle.textStrokeColor) {
            ctx.strokeStyle = particle.textStrokeColor;
            ctx.lineWidth = 4;
            ctx.lineJoin = "round";
            ctx.strokeText(particle.text, particle.x, particle.y);
          }
          ctx.fillText(particle.text, particle.x, particle.y);
        }
      } else if (particle.shape === "shard") {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(Math.atan2(particle.vy, particle.vx));
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.moveTo(particle.radius * 1.8, 0);
        ctx.lineTo(-particle.radius, particle.radius * 0.55);
        ctx.lineTo(-particle.radius * 0.45, -particle.radius * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const traveler of game.infectionTravelers) {
      if (!this.visible(game, traveler.x, traveler.y, 24)) continue;
      ctx.save();
      ctx.translate(traveler.x, traveler.y);
      ctx.fillStyle = "rgba(8,25,20,.72)";
      ctx.strokeStyle = "#79e6c1";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 5, this.time * 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#0a291c";
    ctx.lineWidth = 18;
    ctx.strokeRect(0, 0, BALANCE.mapSize, BALANCE.mapSize);
  }

  private drawSandTunnels(game: Game): void {
    const ctx = this.ctx;
    for (const tunnel of game.sandTunnels) {
      const dx = tunnel.exit.x - tunnel.entry.x;
      const dy = tunnel.exit.y - tunnel.entry.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      if (!this.visible(
        game,
        (tunnel.entry.x + tunnel.exit.x) / 2,
        (tunnel.entry.y + tunnel.exit.y) / 2,
        length / 2 + 36,
      )) continue;
      const perpendicularX = -dy / length;
      const perpendicularY = dx / length;
      const bend = (tunnel.id % 2 === 0 ? 1 : -1) * Math.min(26, length * 0.12);
      const midpointX = (tunnel.entry.x + tunnel.exit.x) / 2 + perpendicularX * bend;
      const midpointY = (tunnel.entry.y + tunnel.exit.y) / 2 + perpendicularY * bend;

      ctx.save();
      ctx.strokeStyle = "#9a622f";
      ctx.fillStyle = "#75451f";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tunnel.entry.x, tunnel.entry.y);
      ctx.quadraticCurveTo(midpointX, midpointY, tunnel.exit.x, tunnel.exit.y);
      ctx.stroke();
      ctx.strokeStyle = "#d09a4b";
      ctx.lineWidth = 2;
      ctx.stroke();
      for (const point of [tunnel.entry, tunnel.exit]) {
        ctx.beginPath();
        ctx.ellipse(point.x, point.y, 30, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawResource(
    node: ResourceNode,
    biome: CampaignBiomeDefinition,
  ): void {
    const depleted = node.health <= 0;
    const resourceState = ASSETS.resourceStateSkins[biome.resourceStateSkin][node.kind];
    const sprite = this.images.get(resourceState[depleted ? "depleted" : "active"]);
    if (sprite?.complete && sprite.naturalWidth > 0) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(node.x, node.y);
      if ((node.infectionHintTime ?? 0) > 0) {
        const progress = node.infectionHintTime! / 0.42;
        ctx.rotate(Math.sin(this.time * 34 + node.id) * 0.065 * progress);
      }
      if (node.hitFlash > 0) ctx.globalAlpha = 0.6;
      const size = node.radius * 2.55;
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      const overlay = biome.resourceOverlay;
      if (node.biomeOverlay && overlay?.kind === "cap" && !depleted) {
        ctx.globalAlpha = node.hitFlash > 0 ? overlay.hitOpacity : overlay.opacity;
        ctx.fillStyle = overlay.fillColor;
        ctx.strokeStyle = overlay.strokeColor;
        ctx.lineWidth = overlay.lineWidth;
        ctx.beginPath();
        ctx.ellipse(
          0,
          node.radius * overlay.verticalOffsetRatio,
          node.radius * overlay.widthRatio,
          node.radius * overlay.heightRatio,
          overlay.rotation,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    if ((node.infectionAttackTime ?? 0) > 0) {
      const ctx = this.ctx;
      const reveal = Math.sin(Math.min(1, node.infectionAttackTime! / 0.7) * Math.PI);
      ctx.save();
      ctx.strokeStyle = "#79e6c1";
      ctx.lineWidth = 7;
      for (let index = 0; index < 5; index += 1) {
        const angle = index / 5 * Math.PI * 2 + this.time * 0.7;
        ctx.beginPath();
        ctx.moveTo(node.x, node.y + node.radius * 0.4);
        ctx.quadraticCurveTo(
          node.x + Math.cos(angle + 0.5) * node.radius,
          node.y + Math.sin(angle + 0.5) * node.radius,
          node.x + Math.cos(angle) * node.radius * (1.25 + reveal),
          node.y + Math.sin(angle) * node.radius * (1.25 + reveal),
        );
        ctx.stroke();
      }
      ctx.restore();
    }
    if (node.health > 0 && node.health < node.maxHealth) {
      this.healthBar(
        node.x,
        node.y - node.radius - 10,
        node.radius * 1.5,
        node.health / node.maxHealth,
        resourceColors[node.kind],
      );
      if ((node.radiationDamage ?? 0) > 0) {
        const width = node.radius * 1.5;
        const radiationWidth = width * Math.min(1, (node.radiationDamage ?? 0) / node.maxHealth);
        this.ctx.fillStyle = "#b7dd63";
        this.ctx.fillRect(node.x + width / 2 - radiationWidth, node.y - node.radius - 7, radiationWidth, 3);
      }
    }
  }

  private drawTutorialMarkers(game: Game): void {
    const task = game.getTutorialTask();
    if (!task) return;
    const ctx = this.ctx;
    const pulse = 4 + Math.sin(this.time * 5) * 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 237, 140, .96)";
    ctx.fillStyle = "rgba(255, 237, 140, .08)";
    ctx.lineWidth = pulse;
    ctx.setLineDash([11, 8]);
    if (game.tutorialPlacementArea && (task.highlight === "placement-area" || task.highlight === "turret-half")) {
      ctx.beginPath();
      ctx.arc(
        game.tutorialPlacementArea.x,
        game.tutorialPlacementArea.y,
        game.tutorialPlacementArea.radius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
    }
    if (task.highlight === "flag-radius" && game.hasActiveFlag()) {
      ctx.beginPath();
      ctx.arc(game.flag.x, game.flag.y, BALANCE.flagProtectedRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    let target: ResourceNode | Structure | undefined;
    if (task.highlight === "tree") target = game.world.resources.find((node) => node.kind === "wood");
    else if (task.highlight.includes("wall")) target = game.structures.find((item) => item.kind === "wall");
    else if (task.highlight.includes("spikes")) target = game.structures.find((item) => item.kind === "spikes");
    else if (task.highlight.includes("door")) target = game.structures.find((item) => item.kind === "door");
    else if (task.highlight.includes("turret")) target = game.structures.find((item) => item.kind === "turret");
    else if (task.highlight.includes("harvester")) target = game.structures.find((item) => item.kind === "harvester");
    if (target) {
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.radius + 14 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFlag(game: Game): void {
    const ctx = this.ctx;
    const flag = game.flag;
    const pulse = 1 + Math.sin(this.time * 2.2) * 0.025;
    ctx.save();
    ctx.translate(flag.x, flag.y);
    ctx.scale(pulse, pulse);
    this.drawCenteredOverlay(
      ASSETS.flag.healingAura,
      0,
      0,
      BALANCE.flagProtectedRadius,
      103,
    );
    this.drawSprite(ASSETS.flag.base, -70, -75, 140, 150);
    this.drawSprite(ASSETS.flag.cloth, -18, -74, 77, 52, flag.hurtFlash > 0);
    ctx.fillStyle = "#f8f1d3";
    ctx.font = "950 34px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.max(0, Math.ceil(flag.health))}`, 0, 21);
    ctx.font = "800 10px system-ui";
    ctx.fillText("FLAG", 0, 37);
    ctx.restore();
    this.healthBar(flag.x, flag.y + 70, 118, flag.health / flag.maxHealth, "#ef6258");
  }

  private drawStructure(structure: Structure, player: Player): void {
    const ctx = this.ctx;
    if (isBurning(structure)) {
      ctx.save(); ctx.fillStyle = "rgba(255,105,32,.24)"; ctx.beginPath();
      ctx.arc(structure.x, structure.y, structure.radius + 9 + Math.sin(this.time * 9) * 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.save();
    ctx.translate(structure.x, structure.y);
    if (structure.kind === "turret" && isSlowed(structure)) {
      ctx.filter = "saturate(.68) brightness(1.1) contrast(.94)";
    }
    if (structure.kind === "door") {
      const proximity = Math.max(0, Math.min(1,
        (BALANCE.ui.doorFadeRadius - Math.hypot(player.x - structure.x, player.y - structure.y)) / 30));
      ctx.globalAlpha = 1 - proximity * (1 - BALANCE.ui.doorFadedOpacity);
    }
    const size = structureSpriteSize[structure.kind];
    this.drawSprite(
      ASSETS.structures[structure.kind][structure.tier],
      -size / 2,
      -size / 2,
      size,
      size,
      structure.flash > 0,
    );
    if (structure.kind === "turret") {
      ctx.save();
      ctx.rotate(structure.angle);
      this.drawSprite(
        ASSETS.structureParts.turretBarrels[structure.tier],
        -20,
        -20,
        70,
        40,
        structure.flash > 0,
      );
      ctx.restore();
    } else if (structure.kind === "harvester") {
      ctx.save();
      ctx.rotate(structure.angle);
      this.drawSprite(
        ASSETS.structureParts.harvesterArms[structure.tier],
        -5,
        -15,
        harvesterArmSpriteWidth[structure.tier],
        30,
        structure.flash > 0,
      );
      ctx.restore();
    }
    this.drawStructureCracks(structure);
    if (structure.kind === "turret" && isSlowed(structure)) {
      ctx.filter = "none";
      this.drawFrostAccumulation(structure.radius);
    }
    ctx.restore();
  }

  private drawFrostAccumulation(radius: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(248,255,255,.86)";
    ctx.strokeStyle = "rgba(190,222,228,.82)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-radius * 0.18, -radius * 0.66, radius * 0.62, radius * 0.2, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const [x, y, size] of [
      [-0.6, -0.2, 0.1],
      [0.52, -0.08, 0.08],
      [0.2, -0.5, 0.07],
    ] as const) {
      ctx.beginPath();
      ctx.arc(radius * x, radius * y, radius * size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBuildPreview(game: Game): void {
    const preview = game.buildPreview;
    if (!preview) return;
    const ctx = this.ctx;
    ctx.save();
    const buildable = preview.valid && preview.affordable;
    if (preview.kind === "turret") {
      const upgradedRange = game.getTurretRange(preview.tier);
      if (preview.upgrading) {
        const currentRange = game.getTurretRange(preview.upgrading.tier);
        if (Math.abs(currentRange - upgradedRange) > 0.5) {
          this.drawCenteredOverlay(
            ASSETS.previews.turretRange.current,
            preview.upgrading.x,
            preview.upgrading.y,
            currentRange,
            103,
          );
        }
      }
      this.drawCenteredOverlay(
        ASSETS.previews.turretRange.upgraded,
        preview.x,
        preview.y,
        upgradedRange,
        103,
      );
    }
    this.drawCenteredOverlay(
      buildable ? ASSETS.previews.placement.allowed : ASSETS.previews.placement.blocked,
      preview.x,
      preview.y,
      BALANCE.structure.radius[preview.kind],
      104,
    );
    ctx.fillStyle = preview.valid ? "#d5ffe3" : "#ffd1cd";
    ctx.font = "800 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(preview.upgrading ? "UPGRADE" : preview.reason || "PLACE", preview.x, preview.y - 48);
    if (preview.upgrading) {
      ctx.fillText(
        `${preview.upgrading.tier.toUpperCase()}  →  ${preview.tier.toUpperCase()}`,
        preview.x,
        preview.y - 64,
      );
    }
    if (preview.kind === "harvester") {
      const arm = BALANCE.structure.harvesterArm[BALANCE.tierIndex[preview.tier]] ?? 98;
      this.drawCenteredOverlay(
        buildable ? ASSETS.previews.harvesterRange.allowed : ASSETS.previews.harvesterRange.blocked,
        preview.x,
        preview.y,
        arm,
        103,
      );
      for (const node of game.world.resources) {
        if (node.destroyed || Math.hypot(preview.x - node.x, preview.y - node.y) > arm + node.radius) continue;
        const supported = BALANCE.harvest[preview.tier][node.kind] > 0;
        this.drawCenteredOverlay(
          supported
            ? ASSETS.previews.resourceTarget.supported
            : ASSETS.previews.resourceTarget.unsupported,
          node.x,
          node.y,
          node.radius + 5,
          103,
        );
      }
    }
    this.drawWorldCost(game, preview.x, preview.y + BALANCE.structure.radius[preview.kind] + 28, preview.cost);
    ctx.restore();
  }

  private drawToolPreview(game: Game): void {
    const preview = game.toolPreview;
    if (!preview) return;
    const ctx = this.ctx;
    const active = preview.valid && preview.affordable;
    const color = active ? "#74f3a5" : preview.valid ? "#ffbd52" : "#ff6259";
    ctx.save();
    ctx.translate(preview.x, preview.y);
    const ring = active
      ? ASSETS.cursors.ringAllowed
      : preview.valid ? ASSETS.cursors.ringContext : ASSETS.cursors.ringBlocked;
    this.drawSprite(ring, -42, -42, 84, 84);
    const toolIcon = preview.action === "repair"
      ? BUILD_BAR_ICON_PATHS["repair-wrench"]
      : BUILD_BAR_ICON_PATHS["recycle-mallet"];
    this.drawTintedSprite(toolIcon, color, -25, -25, 50, 50);
    ctx.fillStyle = "#f7f3db";
    ctx.font = "900 12px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    if (preview.action === "repair" && preview.target && preview.target !== game.flag) {
      ctx.fillText(
        `${Math.ceil(preview.target.health)}  →  ${Math.ceil(preview.target.maxHealth)} HP`,
        0,
        56,
      );
    } else {
      ctx.fillText(preview.reason, 0, 56);
    }
    ctx.restore();
    this.drawWorldCost(
      game,
      preview.x,
      preview.y + 76,
      preview.action === "repair" ? preview.cost : preview.refund,
      preview.action === "recycle" ? "+" : "",
    );
  }

  private drawEnemy(enemy: Enemy, game: Game): void {
    const ctx = this.ctx;
    const angle = enemy.angle ?? Math.atan2(center - enemy.y, center - enemy.x);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.mireTentacle) {
      ctx.fillStyle = "rgba(34,80,70,.62)";
      ctx.beginPath();
      ctx.ellipse(0, 7, enemy.radius * 1.7, enemy.radius * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.86;
      ctx.scale(1.05, 0.5);
    }
    let biomeFilter: string | undefined;
    if ((enemy.kind === "basic" || enemy.kind === "runner")
      && game.activeCampaignTierId !== "forest") {
      const biomeFilters: Record<Exclude<typeof game.activeCampaignTierId, "forest">, string> = {
        snowy: "hue-rotate(135deg) saturate(.55) brightness(1.55)",
        desert: "hue-rotate(300deg) saturate(.72) sepia(.45) brightness(1.12)",
        volcanic: "hue-rotate(265deg) saturate(.85) brightness(.62)",
        wasteland: "hue-rotate(28deg) saturate(.75) brightness(.78)",
        rift: "hue-rotate(160deg) saturate(1.35) brightness(.82)",
        mire: "hue-rotate(48deg) saturate(.58) brightness(.62)",
        clockwork: "sepia(.8) saturate(.65) brightness(.82)",
      };
      biomeFilter = biomeFilters[game.activeCampaignTierId];
    }
    if ((enemy.ghostRemaining ?? 0) > 0) {
      ctx.globalAlpha = 0.38 + Math.sin(this.time * 18 + enemy.id) * 0.12;
      ctx.shadowColor = "#d99cff";
      ctx.shadowBlur = 20;
    }
    if (enemy.kind === "sandstormer") {
      const radius = BALANCE.tierMechanics.desert.sandstormRadius;
      ctx.strokeStyle = "rgba(241,202,117,.28)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(241,202,117,.11)";
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 12, 0, Math.PI * 2);
      ctx.fill();
    }
    if (enemy.timedLifeRemaining !== undefined) {
      if (enemy.timedLifeExpired) ctx.filter = "grayscale(1) brightness(.72)";
      else {
        ctx.fillStyle = "rgba(19,27,33,.9)";
        ctx.strokeStyle = "#e2b85d";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, -enemy.radius - 18, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff0b8"; ctx.font = "900 12px system-ui"; ctx.textAlign = "center";
        ctx.fillText(`${Math.ceil(enemy.timedLifeRemaining)}`, 0, -enemy.radius - 14);
      }
    }
    if (enemy.burning || ENEMY_REGISTRY[enemy.kind].capabilities.fireAura) {
      ctx.fillStyle = "rgba(255,105,32,.25)";
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 11 + Math.sin(this.time * 10 + enemy.id) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (enemy.jumpTime > 0) {
      const leap = ENEMY_REGISTRY[enemy.kind].leap;
      const lift = leap
        ? Math.sin((enemy.jumpTime / leap.duration) * Math.PI) * leap.arcHeight
        : 0;
      ctx.translate(0, -lift);
      ctx.globalAlpha = 0.82;
    }
    if (enemy.attackWindup > 0) {
      ctx.strokeStyle = enemyAttackTelegraphColor(enemy.kind);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * enemy.attackWindup);
      ctx.stroke();
    }
    const phaseSlam = ENEMY_REGISTRY[enemy.kind].phaseSlam;
    if (phaseSlam && enemy.bossSmashWindup > 0) {
      const slamProgress = Math.min(
        1,
        enemy.bossSmashWindup / phaseSlam.chargeDuration,
      );
      const slamDiameter = phaseSlam.radius * 2;
      ctx.save();
      ctx.globalAlpha = 0.3 + slamProgress * 0.18;
      this.drawSprite(
        ASSETS.effects.bossSlamWave,
        -phaseSlam.radius,
        -phaseSlam.radius,
        slamDiameter,
        slamDiameter,
      );
      ctx.restore();
      ctx.strokeStyle = phaseSlam.telegraphColor;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, phaseSlam.radius, -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * slamProgress);
      ctx.stroke();
    }
    const aimedProjectile = ENEMY_REGISTRY[enemy.kind].aimedProjectile;
    if (aimedProjectile && enemy.acidWindup > 0) {
      ctx.strokeStyle = aimedProjectile.telegraphColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 18, -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, enemy.acidWindup / aimedProjectile.telegraphDuration));
      ctx.stroke();
      ctx.rotate(enemy.acidAimAngle);
      ctx.fillStyle = aimedProjectile.color;
      ctx.beginPath();
      ctx.arc(enemy.radius + 12, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(-enemy.acidAimAngle);
    }
    if (game.isBossEnemyKind(enemy.kind)) {
      const armorConfig = ENEMY_REGISTRY[enemy.kind].armor;
      const size = enemy.radius * 2.65;
      const armored = Boolean(armorConfig && (enemy.armor ?? 0) > 0);
      const bossSprite = armorConfig && !armored
        ? ASSETS.enemyBrokenArmor[enemy.kind] ?? ASSETS.enemyBodies[enemy.kind]
        : ASSETS.enemyBodies[enemy.kind];
      this.drawSprite(bossSprite, -size / 2, -size / 2, size, size, enemy.flash > 0);
      if (armored) {
        ctx.fillStyle = "rgba(174,239,250,.22)";
        ctx.strokeStyle = "rgba(225,252,255,.92)";
        ctx.lineWidth = 5;
        for (let index = 0; index < 8; index += 1) {
          const shardAngle = index / 8 * Math.PI * 2;
          const inner = enemy.radius * 0.78;
          const outer = enemy.radius * (1.08 + (index % 2) * 0.08);
          ctx.beginPath();
          ctx.moveTo(Math.cos(shardAngle - 0.24) * inner, Math.sin(shardAngle - 0.24) * inner);
          ctx.lineTo(Math.cos(shardAngle) * outer, Math.sin(shardAngle) * outer);
          ctx.lineTo(Math.cos(shardAngle + 0.24) * inner, Math.sin(shardAngle + 0.24) * inner);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
      if (armored) {
        this.healthBar(
          enemy.x,
          enemy.y - enemy.radius - 12,
          160,
          (enemy.armor ?? 0) / Math.max(1, enemy.maxArmor ?? 1),
          armorConfig!.barColor,
        );
        ctx.fillStyle = "#e9fdff";
        ctx.font = "900 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(armorConfig!.label, enemy.x, enemy.y - enemy.radius - 22);
        return;
      }
      this.healthBar(enemy.x, enemy.y - enemy.radius - 12, 160, enemy.health / enemy.maxHealth, "#85cd5d");
      const segments = Math.max(0, Math.ceil((enemy.health / enemy.maxHealth) * 10));
      ctx.fillStyle = "#fff0c2";
      ctx.font = "950 22px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${segments}`, enemy.x, enemy.y - enemy.radius - 35);
      ctx.font = "800 10px system-ui";
      ctx.fillText("SEGMENTS", enemy.x, enemy.y - enemy.radius - 22);
      for (let i = 0; i < 10; i += 1) {
        ctx.fillStyle = i < segments ? "#e1544c" : "#2a2e2b";
        ctx.fillRect(enemy.x - 78 + i * 16, enemy.y + enemy.radius + 18, 12, 7);
      }
      return;
    }
    const ram = ENEMY_REGISTRY[enemy.kind].ram;
    if (ram && enemy.attackWindup > 0) {
      ctx.save();
      ctx.rotate(angle);
      ctx.strokeStyle = ram.telegraphColor;
      ctx.lineWidth = 5;
      ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.moveTo(enemy.radius + 8, 0); ctx.lineTo(enemy.radius + ram.telegraphLength, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.rotate(angle);
    const definition = ENEMY_REGISTRY[enemy.kind];
    const render = definition.render;
    if (render) {
      const armorConfig = definition.armor;
      const height = render.height;
      const width = render.width ?? height;
      const sprite = armorConfig && (enemy.armor ?? 0) <= 0
        ? ASSETS.enemyBrokenArmor[enemy.kind] ?? ASSETS.enemies[enemy.kind]
        : ASSETS.enemies[enemy.kind];
      this.drawSprite(sprite, -width / 2, -height / 2, width, height, enemy.flash > 0);
      ctx.restore();
      if (armorConfig && (enemy.armor ?? 0) > 0) {
        this.healthBar(
          enemy.x,
          enemy.y - enemy.radius - 12,
          72,
          (enemy.armor ?? 0) / Math.max(1, enemy.maxArmor ?? 1),
          armorConfig.barColor,
        );
      } else {
        this.healthBar(enemy.x, enemy.y - enemy.radius - 12, ram?.healthBarWidth ?? 55,
          enemy.health / enemy.maxHealth, "#d2574e");
      }
      return;
    }
    const handReach = enemy.radius + 11 + enemy.attackWindup * 10;
    const handDiameter = enemy.radius * 0.7;
    this.drawFilteredSprite(
      ASSETS.enemyHands[enemy.kind],
      biomeFilter,
      handReach - handDiameter / 2,
      -enemy.radius * 0.55 - handDiameter / 2,
      handDiameter,
      handDiameter,
      enemy.flash > 0,
    );
    this.drawFilteredSprite(
      ASSETS.enemyHands[enemy.kind],
      biomeFilter,
      handReach - handDiameter / 2,
      enemy.radius * 0.55 - handDiameter / 2,
      handDiameter,
      handDiameter,
      enemy.flash > 0,
    );
    this.drawFilteredSprite(
      ASSETS.enemyBodies[enemy.kind],
      biomeFilter,
      -40,
      -40,
      80,
      80,
      enemy.flash > 0,
    );
    ctx.restore();
    this.healthBar(
      enemy.x,
      enemy.y - enemy.radius - 12,
      55,
      enemy.health / enemy.maxHealth,
      "#d2574e",
    );
  }

  private drawAreaEffect(effect: import("./types").AreaEffect): void {
    const reducedMotion = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const progress = Math.max(0, Math.min(1, 1 - effect.remaining / effect.duration));
    const radius = reducedMotion ? effect.radius : effect.radius * progress;
    if (effect.kind === "frost-slam") {
      const appearance = effect.appearance ?? {
        center: "rgba(99,198,232,.04)",
        middle: "rgba(99,198,232,.12)",
        edge: "rgba(119,220,244,.2)",
        stroke: "rgba(82,202,238,.98)",
        highlight: "rgba(232,253,255,.92)",
      };
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = Math.max(0.22, 0.72 - progress * 0.38);
      const gradient = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius);
      gradient.addColorStop(0, appearance.center);
      gradient.addColorStop(0.72, appearance.middle);
      gradient.addColorStop(0.9, appearance.edge);
      gradient.addColorStop(1, appearance.stroke);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = appearance.stroke;
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = appearance.highlight;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, Math.max(0, radius - 9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const path = effect.kind === "boss-slam"
      ? ASSETS.effects.bossSlamWave
      : ASSETS.enemyDeathBursts[effect.sourceEnemyKind ?? "popper"];
    if (!path) return;
    const size = radius * 2;
    this.ctx.save();
    this.ctx.globalAlpha = reducedMotion ? 0.72 : Math.max(0.24, 1 - progress * 0.58);
    this.drawSprite(path, effect.x - radius, effect.y - radius, size, size);
    this.ctx.restore();
  }

  private drawAreaStrike(strike: AreaStrike): void {
    const appearance = ENEMY_REGISTRY[strike.sourceEnemyKind].areaStrike?.appearance;
    if (!appearance) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(strike.x, strike.y);
    if (strike.warningRemaining > 0) {
      const progress = 1 - strike.warningRemaining / strike.warningDuration;
      ctx.fillStyle = appearance.warningFill;
      ctx.strokeStyle = appearance.warningOutline;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, strike.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = appearance.warningProgress;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, strike.radius - 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
      ctx.globalAlpha = 1 / 3 + progress * 2 / 3;
      ctx.fillStyle = appearance.warningPulse;
      ctx.beginPath();
      ctx.arc(0, 0, strike.radius * progress, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const progress = 1 - strike.eruptionRemaining / strike.eruptionDuration;
    const rise = Math.min(1, progress / 0.38);
    const fade = progress > 0.72 ? 1 - (progress - 0.72) / 0.28 : 1;
    ctx.globalAlpha = Math.max(0, fade);
    ctx.rotate(strike.angle);
    ctx.fillStyle = appearance.eruptionShadow;
    ctx.beginPath();
    ctx.ellipse(0, 8, strike.radius * 0.8, strike.radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    const height = strike.radius * 2.3 * rise;
    const width = strike.radius * 0.65;
    const gradient = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
    gradient.addColorStop(0, appearance.eruptionEdge);
    gradient.addColorStop(0.48, appearance.eruptionHighlight);
    gradient.addColorStop(1, appearance.eruptionFarEdge);
    ctx.fillStyle = gradient;
    ctx.strokeStyle = appearance.eruptionOutline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -height);
    ctx.lineTo(width / 2, 5);
    ctx.lineTo(-width / 2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawPlayer(game: Game): void {
    const ctx = this.ctx;
    if (isBurning(game.player)) {
      ctx.save(); ctx.fillStyle = "rgba(255,105,32,.25)"; ctx.beginPath();
      ctx.arc(game.player.x, game.player.y, game.player.radius + 11 + Math.sin(this.time * 10) * 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    const player = game.player;
    const angle = player.angle;
    const punching = player.cooldown > 0 && game.getSelectedAction() === "fists";
    const profile = game.profileManager?.profile;
    const equipment = profile?.equipment;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(angle);
    if (isSlowed(player)) {
      ctx.filter = "saturate(.7) brightness(1.08) contrast(.95)";
    }
    const action = game.getSelectedAction();
    const gloveTier = game.getBestGlove();
    const swordItem = equipment?.sword;
    const swordStats = action === "fists" && game.isCombatMode()
      ? game.getEquippedSword()
      : null;
    const swordEquipped = Boolean(swordStats && swordItem?.tier);
    const swordProgress = swordEquipped ? game.getMeleeSwingProgress() : null;
    const punchInterval = Math.max(0.16, BALANCE.player.punchRate - game.upgrades.punchRate);
    const punchReturn = punching && !swordEquipped
      ? Math.sin(Math.min(1, player.cooldown / punchInterval) * Math.PI / 2) * 18
      : 0;
    const rightReach = player.radius + 13 + (punching && player.punchHand === "right" ? punchReturn : 0);
    const leftReach = player.radius + 13 + (punching && player.punchHand === "left" ? punchReturn : 0);
    const handSprite = ASSETS.player.hands[gloveTier];
    if (swordEquipped && swordStats && swordProgress !== null && swordProgress < 1) {
      const animation = META_BALANCE.equipment.swordAnimation;
      const damageProgress = Math.min(1, swordProgress / animation.damageProgress);
      const sweepRadius = swordStats.range * (
        animation.sweepStartRadiusRatio
          + (1 - animation.sweepStartRadiusRatio) * damageProgress
      );
      const sweepOpacity = animation.sweepOpacity * Math.sin(swordProgress * Math.PI);
      const sweepEnd = -swordStats.arc + swordStats.arc * 2 * damageProgress;
      ctx.save();
      ctx.globalAlpha = sweepOpacity;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, sweepRadius, -swordStats.arc, sweepEnd);
      ctx.arc(0, 0, animation.sweepInnerRadius, sweepEnd, -swordStats.arc, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (!swordEquipped) {
      this.drawSprite(handSprite, rightReach - 10.5, -player.radius * 0.65 - 10.5, 21, 21, player.hurtFlash > 0);
      this.drawSprite(handSprite, leftReach - 10.5, player.radius * 0.65 - 10.5, 21, 21, player.hurtFlash > 0);
    }
    if (action === "tool") {
      if (game.isCombatMode()) {
        this.drawSprite(ASSETS.player.tools.bow, 8, -30, 58, 60);
      } else {
        const wrench = equipment?.wrench;
        const wrenchAsset = wrench?.equipped && wrench.tier
          ? META_BALANCE.assets.equipment.wrench[wrench.tier]
          : ASSETS.player.tools.repair;
        this.drawSprite(wrenchAsset, 15, -25, 45, 45);
      }
    } else if (action === "recycle") {
      const mallet = equipment?.mallet;
      const malletAsset = mallet?.equipped && mallet.tier
        ? META_BALANCE.assets.equipment.mallet[mallet.tier]
        : ASSETS.player.tools.recycle;
      this.drawSprite(malletAsset, 15, -25, 50, 50);
    } else if (!["fists", "tool", "recycle"].includes(action)) {
      this.drawSprite(ASSETS.player.tools.blueprint, 20, -22, 45, 44);
    }
    const playerColor = profile?.playerColor ?? META_BALANCE.customization.colors[0];
    const eyeStyle = profile?.eyeStyle ?? "round";
    const flashing = player.hurtFlash > 0;
    this.drawTintedSprite(ASSETS.player.body, playerColor, -30, -30, 60, 60, flashing);
    this.drawSprite(ASSETS.player.bodyDetails, -30, -30, 60, 60, flashing);
    this.drawSprite(ASSETS.player.eyes[eyeStyle], -30, -30, 60, 60, flashing);
    if (swordEquipped && swordItem?.tier && swordStats) {
      const animation = META_BALANCE.equipment.swordAnimation;
      const swingRotation = swordProgress === null || swordProgress >= 1
        ? -0.2
        : -swordStats.arc + swordStats.arc * 2
          * Math.min(1, swordProgress / animation.damageProgress);
      const gripX = animation.gripX;
      const gripY = animation.gripY;
      ctx.save();
      ctx.translate(gripX, gripY);
      ctx.rotate(swingRotation);
      ctx.rotate(animation.bladeRotationOffset);
      this.drawSprite(
        META_BALANCE.assets.equipment.sword[swordItem.tier],
        SWORD_SPRITE_BOUNDS.x,
        SWORD_SPRITE_BOUNDS.y,
        SWORD_SPRITE_BOUNDS.width,
        SWORD_SPRITE_BOUNDS.height,
        flashing,
      );
      for (const hand of SWORD_HAND_CENTERS) {
        this.drawSprite(handSprite, hand.x - 10.5, hand.y - 10.5, 21, 21, flashing);
      }
      ctx.restore();
    }
    const helmet = equipment?.helmet;
    if (helmet?.equipped && helmet.tier) {
      ctx.save();
      ctx.rotate(-Math.PI / 2);
      this.drawSprite(META_BALANCE.assets.equipment.helmet[helmet.tier], -30, -37, 60, 55, flashing);
      ctx.restore();
    }
    if (isSlowed(player)) {
      ctx.filter = "none";
      ctx.rotate(-angle);
      this.drawFrostAccumulation(player.radius);
    }
    ctx.restore();
  }

  private drawStructureCracks(structure: Structure): void {
    const missing = 1 - structure.health / Math.max(1, structure.maxHealth);
    if (missing <= 0) return;
    let stage = 0;
    for (let index = 0; index < BALANCE.cracks.thresholds.length; index += 1) {
      const threshold = BALANCE.cracks.thresholds[index] ?? 1;
      if (missing >= threshold) stage = index;
    }
    const image = this.images.get(ASSETS.cracks[stage] ?? ASSETS.cracks[0]);
    if (!image?.complete || image.naturalWidth <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    if (structure.kind === "spikes") {
      for (let index = 0; index < 24; index += 1) {
        const angle = index / 24 * Math.PI * 2;
        const radius = index % 2 === 0 ? structure.radius + 8 : structure.radius - 8;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else {
      ctx.arc(0, 0, structure.radius, 0, Math.PI * 2);
    }
    ctx.clip();
    const size = structure.radius * 2.15;
    ctx.globalAlpha = 0.78;
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  private drawWorldCost(
    game: Game,
    x: number,
    y: number,
    wallet: ResourceWallet,
    prefix = "",
  ): void {
    const rows = costLayoutRows(wallet);
    const values = rows.flat();
    if (values.length === 0) return;
    const affordabilityByResource = new Map(
      affordability(game.resources, wallet).map((item) => [item.resource, item.affordable]),
    );
    const ctx = this.ctx;
    const itemWidth = 48;
    const itemHeight = 26;
    const columns = Math.max(...rows.map((row) => row.length));
    const totalWidth = columns * itemWidth + 12;
    const totalHeight = rows.length * itemHeight + 8;
    const minX = game.camera.x - BALANCE.logicalWidth / 2 + 16;
    const maxX = game.camera.x + BALANCE.logicalWidth / 2 - 16;
    const minY = game.camera.y - BALANCE.logicalHeight / 2 + 16;
    const maxY = game.camera.y + BALANCE.logicalHeight / 2 - 16;
    const clampedX = Math.max(minX + totalWidth / 2, Math.min(maxX - totalWidth / 2, x));
    const clampedY = Math.max(minY + totalHeight / 2, Math.min(maxY - totalHeight / 2, y));
    ctx.save();
    ctx.translate(clampedX, clampedY);
    ctx.fillStyle = "rgba(7,23,14,.9)";
    ctx.strokeStyle = "rgba(247,243,219,.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-totalWidth / 2, -totalHeight / 2, totalWidth, totalHeight, 10);
    ctx.fill();
    ctx.stroke();
    rows.forEach((row, rowIndex) => row.forEach((item, itemIndex) => {
      const rowWidth = row.length * itemWidth;
      const itemX = -rowWidth / 2 + itemIndex * itemWidth + 2;
      const itemY = -totalHeight / 2 + 6 + rowIndex * itemHeight;
      const image = this.images.get(ASSETS.resources[item.resource]);
      if (image?.complete && image.naturalWidth > 0) ctx.drawImage(image, itemX, itemY, 20, 20);
      ctx.fillStyle = affordabilityByResource.get(item.resource) || prefix === "+" ? "#74f3a5" : "#ff6259";
      ctx.font = "900 12px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(`${prefix}${item.value}`, itemX + 22, itemY + 15);
    }));
    ctx.restore();
  }

  private drawNavigationDebug(game: Game): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(63,214,255,.72)";
    for (const route of game.world.navigation.routes) {
      if (route.length === 0) continue;
      ctx.beginPath();
      route.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,221,90,.42)";
    for (const node of game.world.resources) {
      ctx.beginPath();
      ctx.arc(
        node.x,
        node.y,
        node.radius + BALANCE.navigation.zombieClearance,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.fillStyle = "#ff3d57";
    for (const gap of game.world.navigation.invalidGaps) {
      ctx.beginPath();
      ctx.arc(gap.x, gap.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private healthBar(x: number, y: number, width: number, ratio: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(8,20,14,.82)";
    ctx.fillRect(x - width / 2 - 2, y - 2, width + 4, 9);
    ctx.fillStyle = color;
    ctx.fillRect(x - width / 2, y, width * Math.max(0, Math.min(1, ratio)), 5);
  }

  private drawVignette(game: Game): void {
    const ctx = this.ctx;
    if (game.phase === "night") {
      const gradient = ctx.createRadialGradient(
        BALANCE.logicalWidth / 2,
        BALANCE.logicalHeight / 2,
        120,
        BALANCE.logicalWidth / 2,
        BALANCE.logicalHeight / 2,
        620,
      );
      gradient.addColorStop(0, "rgba(5,14,28,.04)");
      gradient.addColorStop(1, "rgba(4,9,24,.58)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, BALANCE.logicalWidth, BALANCE.logicalHeight);
    } else if (game.phase === "day" && game.timer < 20) {
      ctx.fillStyle = `rgba(66,31,52,${(20 - game.timer) / 70})`;
      ctx.fillRect(0, 0, BALANCE.logicalWidth, BALANCE.logicalHeight);
    }
  }

  private drawMinimap(game: Game): void {
    if (game.phase === "menu") return;
    const ctx = this.ctx;
    const size = 158;
    const x = BALANCE.logicalWidth - size - 23;
    const compactHud = this.canvas.clientWidth <= 980 || this.canvas.clientHeight <= 620;
    const toolbarBottomInset = compactHud ? 5 : 13;
    const cssToLogicalScale = this.canvas.clientHeight > 0
      ? BALANCE.logicalHeight / this.canvas.clientHeight
      : 1;
    const panelBottomInset = toolbarBottomInset * cssToLogicalScale;
    const panelBottomPadding = 8;
    const y = BALANCE.logicalHeight - size - panelBottomPadding - panelBottomInset;
    const scale = size / BALANCE.mapSize;
    ctx.save();
    ctx.fillStyle = "rgba(8,24,17,.9)";
    ctx.strokeStyle = "#d7e2ce";
    ctx.lineWidth = 3;
    ctx.fillRect(x - 8, y - 26, size + 16, size + 34);
    ctx.strokeRect(x, y, size, size);
    ctx.fillStyle = "#d7e2ce";
    ctx.font = "800 11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(game.getCampaignTier().biome.minimapLabel, x, y - 9);
    ctx.globalAlpha = 0.52;
    for (const node of game.world.resources) {
      if (node.destroyed) continue;
      ctx.fillStyle = resourceColors[node.kind];
      ctx.fillRect(x + node.x * scale, y + node.y * scale, 2, 2);
    }
    ctx.globalAlpha = 1;
    for (const portal of game.portals) {
      ctx.fillStyle = "#a682ff";
      ctx.beginPath();
      ctx.arc(x + portal.x * scale, y + portal.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (game.isCombatMode()) {
      for (const enemy of game.enemies) {
        const boss = game.isBossEnemyKind(enemy.kind);
        ctx.fillStyle = boss ? "#ff5149" : "#8ac95e";
        ctx.fillRect(x + enemy.x * scale - 1, y + enemy.y * scale - 1, boss ? 6 : 3, boss ? 6 : 3);
      }
    }
    if (game.hasActiveFlag()) {
      ctx.fillStyle = "#ee6658";
      ctx.beginPath();
      ctx.arc(x + game.flag.x * scale, y + game.flag.y * scale, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff6d1";
    ctx.beginPath();
    ctx.arc(x + game.player.x * scale, y + game.player.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBiomeWeather(game: Game, dt: number): void {
    const weather = game.getCampaignTier().biome.weather;
    const target = weather
      && (weather.activeDuring === "always" || game.phase === weather.activeDuring) ? 1 : 0;
    const fadeSeconds = weather?.fadeSeconds ?? 1;
    this.weatherIntensity += Math.sign(target - this.weatherIntensity)
      * Math.min(Math.abs(target - this.weatherIntensity), dt / Math.max(0.1, fadeSeconds));
    if (!weather || this.weatherIntensity <= 0.002) return;
    const fieldCount = Math.ceil(
      weather.particleCount * BALANCE.mapSize * BALANCE.mapSize
      / (BALANCE.logicalWidth * BALANCE.logicalHeight),
    );
    const fieldKey = `${game.seed}:${game.activeCampaignTierId}:${fieldCount}`;
    if (fieldKey !== this.weatherFieldKey) {
      this.weatherFieldKey = fieldKey;
      this.weatherField = createWeatherField(fieldKey, fieldCount, weather);
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = this.weatherIntensity;
    ctx.fillStyle = weather.color;
    const elapsed = game.stats.elapsed;
    for (const particle of this.weatherField) {
      const cycleHeight = BALANCE.mapSize + particle.spawnGap;
      const y = (particle.y + elapsed * particle.fallSpeed) % cycleHeight - particle.spawnGap;
      const x = particle.x
        + Math.sin(elapsed * particle.driftSpeed + particle.phase) * particle.driftAmplitude;
      if (!this.visible(game, x, y, particle.radius + 4)) continue;
      ctx.beginPath();
      ctx.arc(x, y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
