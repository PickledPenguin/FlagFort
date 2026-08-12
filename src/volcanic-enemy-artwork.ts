const volcanicEnemyImage = (name: string): string => `enemies/${name}`;

export const VOLCANIC_ENEMY_ARTWORK = {
  cinderburst: volcanicEnemyImage("cinderburst-zombie"),
  magmaSpitter: volcanicEnemyImage("magma-spitter-zombie"),
  obsidianCharger: volcanicEnemyImage("obsidian-charger-zombie"),
} as const;
