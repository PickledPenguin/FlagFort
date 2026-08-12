const volcanicEnemyImage = (name: string): string => `enemies/${name}`;

export const VOLCANIC_ENEMY_ARTWORK = {
  cinderburst: volcanicEnemyImage("cinderburst-zombie"),
  magmaSpitter: volcanicEnemyImage("magma-spitter-zombie"),
  obsidianCharger: {
    armored: volcanicEnemyImage("obsidian-charger-zombie"),
    broken: volcanicEnemyImage("obsidian-charger-zombie-broken"),
  },
  calderaSovereign: {
    armored: volcanicEnemyImage("caldera-sovereign"),
    broken: volcanicEnemyImage("caldera-sovereign-broken"),
  },
} as const;
