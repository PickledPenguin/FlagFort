export interface SnowPopupContrast {
  perceivedBrightnessThreshold: number;
  darkenMultiplier: number;
}

export function biomePopupColor(
  color: string,
  snowy: boolean,
  frostColor: string,
  contrast: SnowPopupContrast,
): string {
  if (!snowy || color.toLowerCase() === frostColor.toLowerCase()) return color;
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = match[1]!;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const brightness = channels[0]! * 0.299 + channels[1]! * 0.587 + channels[2]! * 0.114;
  if (brightness < contrast.perceivedBrightnessThreshold) return color;
  const darkened = channels
    .map((channel) => Math.round(channel * contrast.darkenMultiplier).toString(16).padStart(2, "0"))
    .join("");
  return `#${darkened}`;
}
