# Flagfall visual asset map

## Build bar

The build bar loads its editable SVGs through `src/build-bar-icons.ts`. That typed registry is the only place where build-bar asset paths are defined.

- Actions: `public/images/ui/build-bar/actions`
- Structures: `public/images/ui/build-bar/structures`
- Indicators: `public/images/ui/build-bar/indicators`

The SVGs contain only base artwork. CSS in `src/styles.css` continues to own hover, selection, disabled, affordability, tutorial highlighting, and material-tier color. Disabled buttons intentionally reuse the same icon at reduced opacity because there was no distinct disabled drawing in the original UI.

The nighttime bow is a separate action asset because it replaces the repair wrench during the night. The locked, selected-tier, upgrade-arrow, and material-tier badge files are separate because their geometry is visually distinct.

## Gameplay artwork

`src/assets.ts` owns the production gameplay registry.

- Enemy portraits: `public/images/enemies`
- Independent enemy bodies and hands: `public/images/gameplay/enemies`
- Player body, tier-colored hands, and held tools: `public/images/gameplay/player`
- Flag, portal, projectile, and cursor parts: `public/images/gameplay`
- Placement, turret-range, harvester-reach, and resource-target overlays: `public/images/gameplay/previews`
- Per-tier structure bodies: `public/images/structures/<kind>/<tier>.svg`
- Independently rotating turret barrels and harvester arms: `public/images/structures/turret` and `public/images/structures/harvester`

The renderer preloads these SVGs once and only applies position, rotation, scale, opacity, flash filtering, and contextual tinting. Player and zombie hands remain separate so their existing attack animations remain independent.

Repair and recycle cursor indicators load the same SVG paths as the production build bar. Runtime tinting communicates allowed, blocked, and contextual hover states without copying either icon.

Structure placement overlays are transparent SVGs composed by the renderer at world coordinates. Allowed and blocked placement, current and upgraded turret range, harvester reach, and supported and unsupported resource targets each have descriptive editable groups. The renderer changes only position and scale, so the game still owns validation, affordability, targeting, and upgrade behavior.

The flag healing aura, flag build-protection boundary, portal no-build zone, and tutorial arena fade and boundary also use shared SVG overlays. Their animation is preserved by applying the original Canvas scale transforms to the SVGs.

## Card and interface artwork

All 41 unlock, upgrade, and mutation cards use files under `public/images/cards`. `src/content.ts` resolves those files through the shared helpers in `src/assets.ts`. Missing definitions now fail explicitly instead of falling back to CSS shapes, generic arrows, game symbols, or text glyphs.

Tutorial illustrations, challenge icons, resources, generic interface icons, and the build bar follow the same centralized path convention. Challenge icons are editable static SVGs rather than runtime-generated Lucide markup. CSS still owns layout, hover, focus, selection, enabled, disabled, and responsive presentation.

## Structure reference sheet

`public/images/reference/structure-reference-sheet.svg` remains a side-by-side editing reference for the production per-tier SVGs.

| Structure | Reference groups | Appearance inputs |
| --- | --- | --- |
| Wall | `wall-wood` through `wall-diamond` | Radius, tier fill, braces |
| Spikes | `spikes-wood` through `spikes-diamond` | Radius, 12 alternating points, tier fill |
| Door | `door-wood` through `door-diamond` | Radius, studs, proximity opacity |
| Harvester | `harvester-wood` through `harvester-diamond` | Radius, tier fill, tier arm length |
| Turret | `turret-wood` through `turret-diamond` | Radius, tier fill, rotating barrel |

Run `npm run visual:validate` after changing geometry, palette constants, build-bar markup, or SVGs. The validator checks every migrated gameplay asset, rejects embedded raster content and editor metadata, verifies reference groups, and detects obsolete Canvas artwork.

## Intentionally retained Canvas rendering

FlagFort remains a single high-frequency Canvas game renderer. The following visuals intentionally stay procedural because replacing them with DOM SVGs or a large matrix of pre-rendered assets would reduce fidelity, deterministic behavior, or performance:

| Retained Canvas visual | Reason |
| --- | --- |
| Frame clearing, camera transform, shake, tutorial arena clipping, and device-pixel-ratio sizing | These operations define the render surface and world viewport. They are not artwork and must update with every frame and resize. |
| Seeded ground clearings and high-count foliage | Position, radius, shade, and culling come from the deterministic world seed. Drawing the small primitives in one batch avoids hundreds of SVG image instances and preserves exact seed output. |
| Tutorial target markers | Their radius and line width pulse continuously and their target is selected from live task state. The static arena fade and boundary have been migrated, while these per-frame markers remain telemetry. |
| Enemy attack, boss smash, and acid telegraph arcs | Each is a continuously changing partial arc driven by windup progress and aim angle. A static SVG cannot represent the same fractional sweep without runtime path generation. |
| Burning aura and transient particles | Radius, opacity, position, color, lifetime, and optional text change every frame. Resource particle icons already reuse SVG assets. |
| Health bars, boss health segments, and live numeric labels | Width, segment count, values, and colors reflect current simulation state every frame. These are live meters and text, not reusable illustrations. |
| Structure crack clipping mask | Crack artwork is SVG. Canvas retains only the live circular or spike-shaped clipping region needed to keep the selected damage stage inside each structure silhouette. |
| Placement labels, upgrade labels, HP readouts, and world-space cost panels | Their text, resource rows, affordability colors, refund prefix, and camera-edge clamping are generated from live state. All resource artwork inside them is SVG. |
| Navigation diagnostics | Routes, clearances, and invalid gaps are developer-only geometry generated directly from the current navigation graph. |
| Day warning tint and night vignette | These are full-viewport, continuously varying state overlays that resize with the logical canvas. |
| Minimap | It is a live projection of a variable number of resources, portals, enemies, the flag, and the player. Rebuilding an SVG scene every frame would add allocation and DOM overhead without improving editability. |
| Portal, flag, and boss countdown text | Values and labels change directly with the deterministic simulation clock and spawn state. Their surrounding artwork is SVG. |

Canvas `drawImage` remains the composition mechanism for SVG assets so all entities stay in the existing world coordinate, culling, layering, and timing pipeline. No DOM nodes participate in gameplay rendering.
