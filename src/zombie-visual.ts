import type { EnemyKind } from "./types";

const ENEMY_COLORS: Record<EnemyKind, string> = {
  basic: "#70ad4c",
  runner: "#a0d653",
  breaker: "#4f7e3d",
  jumper: "#62c87b",
  summoner: "#7f6abe",
  boss: "#3e6d38",
};

export interface ZombieVisualState {
  kind: EnemyKind;
  radius: number;
  angle: number;
  attackWindup?: number;
  flash?: number;
  bossImage?: CanvasImageSource | null;
}

/**
 * Draws the production zombie body at the canvas origin. Gameplay and
 * introduction portraits both use this function so their visuals cannot drift.
 */
export function drawZombieBody(
  ctx: CanvasRenderingContext2D,
  state: ZombieVisualState,
): void {
  const {
    kind,
    radius,
    angle,
    attackWindup = 0,
    flash = 0,
    bossImage = null,
  } = state;
  ctx.save();
  ctx.rotate(angle);

  if (kind === "boss" && bossImage) {
    const size = radius * 2.65;
    ctx.drawImage(bossImage, -size / 2, -size / 2, size, size);
    ctx.restore();
    return;
  }

  const handReach = radius + 11 + attackWindup * 10;
  ctx.fillStyle = flash > 0 ? "#ffffff" : ENEMY_COLORS[kind];
  ctx.beginPath();
  ctx.arc(handReach, -radius * 0.55, radius * 0.35, 0, Math.PI * 2);
  ctx.arc(handReach, radius * 0.55, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  if (kind === "breaker") {
    ctx.fillStyle = "#4c5051";
    ctx.beginPath();
    ctx.arc(-3, -7, radius * 0.78, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  if (kind === "summoner") {
    ctx.strokeStyle = "#c6a9ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "#f2f0d9";
  ctx.beginPath();
  ctx.ellipse(8, -9, 7, 5, 0.45, 0, Math.PI * 2);
  ctx.ellipse(8, 9, 7, 5, -0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8e241f";
  ctx.beginPath();
  ctx.arc(11, -8, 3, 0, Math.PI * 2);
  ctx.arc(11, 8, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#263c29";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-9, -7);
  ctx.lineTo(2, -2);
  ctx.moveTo(-7, 11);
  ctx.lineTo(4, 5);
  ctx.stroke();
  ctx.restore();
}
