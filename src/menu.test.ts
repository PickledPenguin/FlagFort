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

  it("keeps the controls mouse icon legible against the dark guide panel", () => {
    expect(stylesSource).toMatch(
      /img\.icon\.mouse-glyph\s*\{[\s\S]*filter:\s*none/,
    );
  });

  it("uses the full portrait viewport and reserves space for menu chrome", () => {
    expect(stylesSource).toContain(
      "@media (orientation: portrait) and (max-width: 680px)",
    );
    expect(stylesSource).toMatch(
      /#overlay:has\(> \.menu-screen\)\s*\{[\s\S]*width:\s*100vw;[\s\S]*height:\s*100vh;/,
    );
    expect(stylesSource).toMatch(
      /\.menu-screen:has\(> \.daily-reward\)\s*\{[\s\S]*padding-top:\s*226px;/,
    );
  });

  it("keeps investment amounts and actions in clean, unbroken rows", () => {
    expect(stylesSource).toMatch(
      /\.investment-preview > span,\s*\.coin-settlement > span\s*\{/,
    );
    expect(stylesSource).not.toMatch(
      /\.investment-preview span,\s*\.coin-settlement span\s*\{/,
    );
    expect(stylesSource).toMatch(
      /\.investment-modal \.result-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
  });

  it("keeps menu panel actions reachable in short landscape viewports", () => {
    expect(stylesSource).toMatch(
      /\.menu-modal\s*\{[\s\S]*padding:\s*9px;/,
    );
    expect(stylesSource).toMatch(
      /\.menu-modal > \.modal\s*\{[\s\S]*max-height:\s*100%;[\s\S]*overflow-y:\s*auto;/,
    );
  });
});
