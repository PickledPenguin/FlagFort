import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uiSource = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("main menu presentation", () => {
  it("uses a single-line title without the decorative side scene", () => {
    expect(uiSource).toContain("<h1>FLAG <span>FORT</span></h1>");
    expect(uiSource).not.toContain('<div class="menu-scene"');
    expect(stylesSource).toMatch(/\.menu-card h1\s*\{[\s\S]*white-space:\s*nowrap/);
  });

  it("gives the title a subtle two-second bounce", () => {
    expect(stylesSource).toMatch(
      /\.menu-card h1\s*\{[\s\S]*animation:\s*menu-title-bounce 2s ease-in-out infinite/,
    );
    expect(stylesSource).toContain("@keyframes menu-title-bounce");
  });
});
