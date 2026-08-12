const mireEnemyImage = (name: string): string => `enemies/${name}`;

export const MIRE_ENEMY_ARTWORK = {
  mireLurker: mireEnemyImage("mire-lurker-zombie"),
  sporecaster: mireEnemyImage("sporecaster-zombie"),
  drownedBulwark: mireEnemyImage("drowned-bulwark-zombie"),
} as const;
