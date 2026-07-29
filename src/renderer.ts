import { BALANCE } from "./config";
import { ASSETS } from "./assets";
import type { Game } from "./game";
import { affordability, type ResourceWallet } from "./rules";
import { costLayoutRows } from "./cost-layout";
import type { Enemy, Player, ResourceNode, Structure } from "./types";
import { drawZombieBody } from "./zombie-visual";

const resourceColors = {
  wood: "#315f37",
  stone: "#87949a",
  gold: "#d7aa24",
  diamond: "#42c9d4",
};

const center = BALANCE.mapSize / 2;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private time = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    this.ctx = ctx;
    const spritePaths = [
      ...Object.values(ASSETS.resourceStates).flatMap((states) => Object.values(states)),
      ...Object.values(ASSETS.resources),
      ...ASSETS.cracks,
      ASSETS.enemies.boss,
    ];
    for (const path of spritePaths) {
      const image = new Image();
      image.src = path;
      this.images.set(path, image);
    }
    this.resize();
    window.addEventListener("resize", () => this.resize());
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
    const ctx = this.ctx;
    const radius = BALANCE.tutorialArena.radius;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(BALANCE.tutorialArena.fadeStart, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.92, "rgba(0, 0, 0, 0.46)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.94)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTutorialArenaBoundary(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(156, 222, 164, 0.52)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      BALANCE.logicalWidth / 2,
      BALANCE.logicalHeight / 2,
      BALANCE.tutorialArena.radius - BALANCE.tutorialArena.boundaryInset,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
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
      ctx.strokeStyle = "#87d897";
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 12]);
      ctx.beginPath();
      ctx.arc(game.flag.x, game.flag.y, BALANCE.flagProtectedRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
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
        ctx.save();
        ctx.strokeStyle = "rgba(183,145,255,.42)";
        ctx.fillStyle = "rgba(117,73,184,.08)";
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.arc(portal.x, portal.y, BALANCE.portal.noBuildRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      const pulse = 1 + Math.sin(this.time * 4 + portal.id) * 0.08;
      ctx.save();
      ctx.translate(portal.x, portal.y);
      ctx.scale(pulse, pulse);
      ctx.strokeStyle = portal.flash > 0 ? "#ffffff" : "#a682ff";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(0, 0, portal.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#4e328b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, portal.radius - 14, this.time * 1.8, this.time * 1.8 + Math.PI * 1.45);
      ctx.stroke();
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
    if (game.toolPreview) this.drawToolPreview(game);
    for (const projectile of game.projectiles) {
      if (projectile.owner === "boss-acid") {
        const gradient = ctx.createRadialGradient(
          projectile.x - projectile.radius * 0.25,
          projectile.y - projectile.radius * 0.25,
          1,
          projectile.x,
          projectile.y,
          projectile.radius * 1.7,
        );
        gradient.addColorStop(0, "#efff8f");
        gradient.addColorStop(0.45, "#b8ff3d");
        gradient.addColorStop(1, "rgba(59,144,30,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, projectile.radius * 1.7, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(projectile.x, projectile.y);
      const len = Math.hypot(projectile.vx, projectile.vy) || 1;
      ctx.lineTo(projectile.x - (projectile.vx / len) * 18, projectile.y - (projectile.vy / len) * 18);
      ctx.stroke();
    }
    for (const enemy of game.enemies) {
      if (this.visible(game, enemy.x, enemy.y, enemy.radius + 40)) this.drawEnemy(enemy);
    }
    this.drawPlayer(game);
    if ((game.phase === "day" || game.phase === "night") && game.player.health < game.player.maxHealth) {
      this.healthBar(game.player.x, game.player.y + game.player.radius + 15, 64, game.player.health / game.player.maxHealth, "#ff695f");
    }
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
    const ctx = this.ctx;
    const depleted = node.health <= 0;
    const sprite = this.images.get(ASSETS.resourceStates[node.kind][depleted ? "depleted" : "active"]);
    if (sprite?.complete && sprite.naturalWidth > 0) {
      ctx.save();
      ctx.translate(node.x, node.y);
      if (node.hitFlash > 0) ctx.globalAlpha = 0.6;
      const size = node.radius * 2.55;
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
      if (node.health > 0 && node.health < node.maxHealth) {
        this.healthBar(node.x, node.y - node.radius - 10, node.radius * 1.5, node.health / node.maxHealth, resourceColors[node.kind]);
      }
      return;
    }
    const depletedColors = { wood: "#76502d", stone: "#505a5d", gold: "#737c76", diamond: "#737c76" };
    const color = depleted ? depletedColors[node.kind] : resourceColors[node.kind];
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.fillStyle = node.hitFlash > 0 ? "#ffffff" : "#102b20";
    ctx.beginPath();
    ctx.arc(3, 5, node.radius + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, node.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = depleted ? "#59615d" : "rgba(255,255,255,.25)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(-node.radius * 0.2, -node.radius * 0.2, node.radius * 0.62, Math.PI, Math.PI * 1.75);
    ctx.stroke();
    if (node.kind === "wood") {
      ctx.fillStyle = depleted ? "#6a6f6b" : "#193b22";
      ctx.beginPath();
      ctx.arc(-13, -8, node.radius * 0.55, 0, Math.PI * 2);
      ctx.arc(15, -5, node.radius * 0.48, 0, Math.PI * 2);
      ctx.fill();
    } else if (node.kind === "diamond") {
      ctx.strokeStyle = "#b8fbff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(0, -14);
      ctx.lineTo(12, 0);
      ctx.lineTo(0, 16);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    if (node.health > 0 && node.health < node.maxHealth) {
      this.healthBar(node.x, node.y - node.radius - 10, node.radius * 1.5, node.health / node.maxHealth, color);
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
    ctx.fillStyle = "rgba(116,243,165,.08)";
    ctx.beginPath();
    ctx.arc(0, 0, BALANCE.flagProtectedRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(116,243,165,.2)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "#d7c59f";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-18, 42);
    ctx.lineTo(-18, -64);
    ctx.stroke();
    ctx.fillStyle = flag.hurtFlash > 0 ? "#ffffff" : "#e95f4b";
    ctx.beginPath();
    ctx.moveTo(-13, -59);
    ctx.lineTo(54, -45);
    ctx.lineTo(-13, -17);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#13291e";
    ctx.beginPath();
    ctx.arc(0, 9, flag.radius, 0, Math.PI * 2);
    ctx.fill();
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
    const color = BALANCE.tierColors[structure.tier];
    ctx.save();
    ctx.translate(structure.x, structure.y);
    if (structure.kind === "door") {
      const proximity = Math.max(0, Math.min(1,
        (BALANCE.ui.doorFadeRadius - Math.hypot(player.x - structure.x, player.y - structure.y)) / 30));
      ctx.globalAlpha = 1 - proximity * (1 - BALANCE.ui.doorFadedOpacity);
    }
    ctx.fillStyle = structure.flash > 0 ? "#ffffff" : "#0d2a1d";
    ctx.beginPath();
    ctx.arc(3, 5, structure.radius + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#2b241d";
    ctx.lineWidth = 4;
    if (structure.kind === "wall") {
      ctx.beginPath();
      ctx.arc(0, 0, structure.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.32)";
      ctx.beginPath();
      ctx.moveTo(-17, -17);
      ctx.lineTo(17, 17);
      ctx.moveTo(17, -17);
      ctx.lineTo(-17, 17);
      ctx.stroke();
    } else if (structure.kind === "door") {
      ctx.beginPath();
      ctx.arc(0, 0, structure.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2b241d";
      for (const [x, y] of [[-11, -11], [11, -11], [-11, 11], [11, 11]] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (structure.kind === "spikes") {
      ctx.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const r = i % 2 === 0 ? structure.radius + 8 : structure.radius - 8;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (structure.kind === "turret") {
      ctx.beginPath();
      ctx.arc(0, 0, structure.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.rotate(structure.angle);
      ctx.fillStyle = "#202d28";
      ctx.fillRect(0, -8, 44, 16);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, structure.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const index = BALANCE.tierIndex[structure.tier];
      const arm = BALANCE.structure.harvesterArm[index] ?? 98;
      ctx.rotate(structure.angle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(arm, 0);
      ctx.stroke();
      ctx.fillStyle = "#eff7e9";
      ctx.beginPath();
      ctx.arc(arm, 0, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawStructureCracks(structure);
    ctx.restore();
  }

  private drawBuildPreview(game: Game): void {
    const preview = game.buildPreview;
    if (!preview) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.55;
    const buildable = preview.valid && preview.affordable;
    ctx.fillStyle = buildable ? "#74f3a5" : "#ff6259";
    ctx.strokeStyle = buildable ? "#d5ffe3" : "#ffd1cd";
    ctx.lineWidth = 4;
    ctx.setLineDash([7, 6]);
    if (preview.kind === "turret") {
      const previewStyle = BALANCE.ui.turretRangePreview;
      const upgradedRange = game.getTurretRange(preview.tier);
      if (preview.upgrading) {
        const currentRange = game.getTurretRange(preview.upgrading.tier);
        if (Math.abs(currentRange - upgradedRange) > 0.5) {
          ctx.strokeStyle = previewStyle.currentStroke;
          ctx.lineWidth = previewStyle.lineWidth;
          ctx.setLineDash([...previewStyle.dash]);
          ctx.beginPath();
          ctx.arc(preview.upgrading.x, preview.upgrading.y, currentRange, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.fillStyle = previewStyle.fill;
      ctx.strokeStyle = previewStyle.upgradedStroke;
      ctx.lineWidth = previewStyle.lineWidth;
      ctx.setLineDash([...previewStyle.dash]);
      ctx.beginPath();
      ctx.arc(preview.x, preview.y, upgradedRange, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(preview.x, preview.y, BALANCE.structure.radius[preview.kind], 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
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
      ctx.strokeStyle = buildable ? "rgba(116,243,165,.9)" : "rgba(255,98,89,.9)";
      ctx.fillStyle = buildable ? "rgba(116,243,165,.08)" : "rgba(255,98,89,.08)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(preview.x, preview.y, arm, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(preview.x, preview.y);
      ctx.lineTo(preview.x + arm, preview.y);
      ctx.stroke();
      for (const node of game.world.resources) {
        if (node.destroyed || Math.hypot(preview.x - node.x, preview.y - node.y) > arm + node.radius) continue;
        const supported = BALANCE.harvest[preview.tier][node.kind] > 0;
        ctx.strokeStyle = supported ? "#8dffad" : "#d5c56e";
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
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
    ctx.fillStyle = active ? "rgba(40,112,65,.36)" : "rgba(96,35,31,.34)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#14251c";
    ctx.fillStyle = color;
    ctx.lineCap = "round";
    if (preview.action === "repair") {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-15, 15);
      ctx.lineTo(13, -13);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(13, -13, 9, Math.PI * 0.1, Math.PI * 1.35);
      ctx.stroke();
    } else {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-8, 17);
      ctx.lineTo(5, -8);
      ctx.stroke();
      ctx.fillRect(-8, -19, 30, 15);
      ctx.strokeRect(-8, -19, 30, 15);
    }
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
    const bossSprite = enemy.kind === "boss" ? this.images.get(ASSETS.enemies.boss) : null;
    if (bossSprite?.complete && bossSprite.naturalWidth > 0) {
      drawZombieBody(ctx, {
        kind: enemy.kind,
        radius: enemy.radius,
        angle: 0,
        flash: enemy.flash,
        attackWindup: enemy.attackWindup,
        bossImage: bossSprite,
      });
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
    drawZombieBody(ctx, {
      kind: enemy.kind,
      radius: enemy.radius,
      angle,
      flash: enemy.flash,
      attackWindup: enemy.attackWindup,
    });
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
    const gloveColor = BALANCE.tierColors[gloveTier];
    ctx.fillStyle = player.hurtFlash > 0 ? "#ffffff" : gloveColor;
    ctx.strokeStyle = "#2c2923";
    ctx.lineWidth = 3;
    const punchInterval = Math.max(0.16, BALANCE.player.punchRate - game.upgrades.punchRate);
    const punchReturn = punching ? Math.sin(Math.min(1, player.cooldown / punchInterval) * Math.PI / 2) * 18 : 0;
    const rightReach = player.radius + 13 + (punching && player.punchHand === "right" ? punchReturn : 0);
    const leftReach = player.radius + 13 + (punching && player.punchHand === "left" ? punchReturn : 0);
    ctx.beginPath();
    ctx.arc(rightReach, -player.radius * 0.65, 9, 0, Math.PI * 2);
    ctx.arc(leftReach, player.radius * 0.65, 9, 0, Math.PI * 2);
    ctx.fill();
    //ctx.stroke();
    if (action === "tool") {
      if (game.phase === "night") {
        ctx.strokeStyle = "#dfbd72";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(36, 0, 24, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.strokeStyle = "#f7eed2";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(36, -24);
        ctx.lineTo(36, 24);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#dce7e2";
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(20, 11);
        ctx.lineTo(47, -10);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(49, -12, 8, 0.15, Math.PI * 1.45);
        ctx.stroke();
      }
    } else if (action === "recycle") {
      ctx.strokeStyle = "#9a6b3a";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(22, 12);
      ctx.lineTo(42, -10);
      ctx.stroke();
      ctx.fillStyle = "#d5a45d";
      ctx.strokeStyle = "#3b2a1b";
      ctx.lineWidth = 3;
      ctx.fillRect(34, -20, 27, 16);
      ctx.strokeRect(34, -20, 27, 16);
    } else if (!["fists", "tool", "recycle"].includes(action)) {
      ctx.strokeStyle = "rgba(187,232,255,.9)";
      ctx.fillStyle = "rgba(81,154,184,.28)";
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(23, -18, 34, 36);
      ctx.strokeRect(23, -18, 34, 36);
      ctx.setLineDash([]);
    }
    ctx.fillStyle = player.hurtFlash > 0 ? "#ffffff" : "#d9b783";
    ctx.strokeStyle = "#392f24";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fffdf1";
    ctx.beginPath();
    ctx.ellipse(10, -9, 7, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(10, 9, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1d2821";
    ctx.beginPath();
    ctx.arc(13, -9, 3.5, 0, Math.PI * 2);
    ctx.arc(13, 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
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
