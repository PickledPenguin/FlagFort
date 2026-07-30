import { BALANCE } from "./config";
import { allAssetPaths, ASSETS } from "./assets";
import { BUILD_BAR_ICON_PATHS } from "./build-bar-icons";
import type { Game } from "./game";
import { META_BALANCE } from "./meta-balance";
import { affordability, type ResourceWallet } from "./rules";
import { costLayoutRows } from "./cost-layout";
import type { Enemy, Player, ResourceNode, Structure } from "./types";

const resourceColors = {
  wood: "#315f37",
  stone: "#87949a",
  gold: "#d7aa24",
  diamond: "#42c9d4",
};

const center = BALANCE.mapSize / 2;
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
  private time = 0;

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
    ctx.fillStyle = game.tutorialMode ? "#000000" : "#173f2a";
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
    if (game.tutorialMode) this.drawTutorialArenaFade();
    ctx.restore();
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
    ctx.fillStyle = "#1a4b30";
    ctx.fillRect(0, 0, BALANCE.mapSize, BALANCE.mapSize);
    for (const clearing of game.world.clearings) {
      const gradient = ctx.createRadialGradient(clearing.x, clearing.y, 0, clearing.x, clearing.y, clearing.radius);
      gradient.addColorStop(0, "#315c36");
      gradient.addColorStop(1, "#1c4930");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(clearing.x, clearing.y, clearing.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const foliage of game.world.foliage) {
      if (!this.visible(game, foliage.x, foliage.y, foliage.radius)) continue;
      ctx.fillStyle = ["#113b26", "#17452a", "#214f2c", "#285932"][foliage.shade] ?? "#18472b";
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
      if (this.visible(game, node.x, node.y, node.radius)) this.drawResource(node);
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
    if (game.hasActiveFlag()) this.drawFlag(game);
    for (const structure of game.structures) {
      if (this.visible(game, structure.x, structure.y, structure.radius + 140)) this.drawStructure(structure, game.player);
    }
    if (game.buildPreview) this.drawBuildPreview(game);
    for (const projectile of game.projectiles) {
      if (projectile.owner === "boss-acid") {
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
      this.drawTintedSprite(ASSETS.projectiles.arrow, projectile.color, -20, -4, 24, 8);
      ctx.restore();
    }
    for (const enemy of game.enemies) {
      if (this.visible(game, enemy.x, enemy.y, enemy.radius + 40)) this.drawEnemy(enemy);
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
          ctx.fillText(particle.text, particle.x, particle.y);
        }
      } else {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#0a291c";
    ctx.lineWidth = 18;
    ctx.strokeRect(0, 0, BALANCE.mapSize, BALANCE.mapSize);
  }

  private drawResource(node: ResourceNode): void {
    const depleted = node.health <= 0;
    const sprite = this.images.get(ASSETS.resourceStates[node.kind][depleted ? "depleted" : "active"]);
    if (sprite?.complete && sprite.naturalWidth > 0) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(node.x, node.y);
      if (node.hitFlash > 0) ctx.globalAlpha = 0.6;
      const size = node.radius * 2.55;
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
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
    ctx.save();
    ctx.translate(structure.x, structure.y);
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
      ctx.rotate(structure.angle);
      this.drawSprite(
        ASSETS.structureParts.turretBarrels[structure.tier],
        -20,
        -20,
        70,
        40,
        structure.flash > 0,
      );
    } else if (structure.kind === "harvester") {
      ctx.rotate(structure.angle);
      this.drawSprite(
        ASSETS.structureParts.harvesterArms[structure.tier],
        -5,
        -15,
        harvesterArmSpriteWidth[structure.tier],
        30,
        structure.flash > 0,
      );
    }
    this.drawStructureCracks(structure);
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

  private drawEnemy(enemy: Enemy): void {
    const ctx = this.ctx;
    const angle = Math.atan2(center - enemy.y, center - enemy.x);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    if (enemy.burning) {
      ctx.fillStyle = "rgba(255,125,42,.18)";
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 12 + Math.sin(this.time * 8 + enemy.id) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (enemy.jumpTime > 0) {
      const lift = Math.sin((enemy.jumpTime / BALANCE.jumper.jumpDuration) * Math.PI) * 28;
      ctx.translate(0, -lift);
      ctx.globalAlpha = 0.82;
    }
    if (enemy.attackWindup > 0) {
      ctx.strokeStyle = "rgba(255,78,68,.75)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * enemy.attackWindup);
      ctx.stroke();
    }
    if (enemy.kind === "boss" && enemy.bossSmashWindup > 0) {
      ctx.strokeStyle = "rgba(255,92,76,.82)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 175, 0, Math.PI * 2 * Math.min(1, enemy.bossSmashWindup / 1.25));
      ctx.stroke();
    }
    if (enemy.kind === "boss" && enemy.acidWindup > 0) {
      ctx.strokeStyle = "#cfff4c";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 18, -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, enemy.acidWindup / BALANCE.boss.acidTelegraph));
      ctx.stroke();
      ctx.rotate(enemy.acidAimAngle);
      ctx.fillStyle = "#b8ff3d";
      ctx.beginPath();
      ctx.arc(enemy.radius + 12, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(-enemy.acidAimAngle);
    }
    if (enemy.kind === "boss") {
      const size = enemy.radius * 2.65;
      this.drawSprite(ASSETS.enemyBodies.boss, -size / 2, -size / 2, size, size, enemy.flash > 0);
      ctx.restore();
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
    ctx.rotate(angle);
    const handReach = enemy.radius + 11 + enemy.attackWindup * 10;
    const handDiameter = enemy.radius * 0.7;
    this.drawSprite(
      ASSETS.enemyHands[enemy.kind],
      handReach - handDiameter / 2,
      -enemy.radius * 0.55 - handDiameter / 2,
      handDiameter,
      handDiameter,
      enemy.flash > 0,
    );
    this.drawSprite(
      ASSETS.enemyHands[enemy.kind],
      handReach - handDiameter / 2,
      enemy.radius * 0.55 - handDiameter / 2,
      handDiameter,
      handDiameter,
      enemy.flash > 0,
    );
    this.drawSprite(ASSETS.enemyBodies[enemy.kind], -40, -40, 80, 80, enemy.flash > 0);
    ctx.restore();
    this.healthBar(
      enemy.x,
      enemy.y - enemy.radius - 12,
      55,
      enemy.health / enemy.maxHealth,
      "#d2574e",
    );
  }

  private drawPlayer(game: Game): void {
    const ctx = this.ctx;
    const player = game.player;
    const angle = player.angle;
    const punching = player.cooldown > 0 && game.getSelectedAction() === "fists";
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(angle);
    const action = game.getSelectedAction();
    const gloveTier = game.getBestGlove();
    const punchInterval = Math.max(0.16, BALANCE.player.punchRate - game.upgrades.punchRate);
    const punchReturn = punching ? Math.sin(Math.min(1, player.cooldown / punchInterval) * Math.PI / 2) * 18 : 0;
    const rightReach = player.radius + 13 + (punching && player.punchHand === "right" ? punchReturn : 0);
    const leftReach = player.radius + 13 + (punching && player.punchHand === "left" ? punchReturn : 0);
    const handSprite = ASSETS.player.hands[gloveTier];
    this.drawSprite(handSprite, rightReach - 10.5, -player.radius * 0.65 - 10.5, 21, 21, player.hurtFlash > 0);
    this.drawSprite(handSprite, leftReach - 10.5, player.radius * 0.65 - 10.5, 21, 21, player.hurtFlash > 0);
    if (action === "tool") {
      if (game.phase === "night") {
        this.drawSprite(ASSETS.player.tools.bow, 8, -30, 58, 60);
      } else {
        this.drawSprite(ASSETS.player.tools.repair, 15, -25, 45, 45);
      }
    } else if (action === "recycle") {
      this.drawSprite(ASSETS.player.tools.recycle, 15, -25, 50, 50);
    } else if (!["fists", "tool", "recycle"].includes(action)) {
      this.drawSprite(ASSETS.player.tools.blueprint, 20, -22, 45, 44);
    }
    const profile = game.profileManager?.profile;
    const playerColor = profile?.playerColor ?? META_BALANCE.customization.colors[0];
    const eyeStyle = profile?.eyeStyle ?? "round";
    const flashing = player.hurtFlash > 0;
    this.drawTintedSprite(ASSETS.player.body, playerColor, -30, -30, 60, 60, flashing);
    this.drawSprite(ASSETS.player.bodyDetails, -30, -30, 60, 60, flashing);
    this.drawSprite(ASSETS.player.eyes[eyeStyle], -30, -30, 60, 60, flashing);
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
    const y = BALANCE.logicalHeight - size - 118;
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
    ctx.fillText("FOREST MAP", x, y - 9);
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
    if (game.phase === "night") {
      for (const enemy of game.enemies) {
        ctx.fillStyle = enemy.kind === "boss" ? "#ff5149" : "#8ac95e";
        ctx.fillRect(x + enemy.x * scale - 1, y + enemy.y * scale - 1, enemy.kind === "boss" ? 6 : 3, enemy.kind === "boss" ? 6 : 3);
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
}
