# Flagfall visual asset map

## Build bar

The build bar loads its editable SVGs through `src/build-bar-icons.ts`. That typed registry is the only place where build-bar asset paths are defined.

- Actions: `public/images/ui/build-bar/actions`
- Structures: `public/images/ui/build-bar/structures`
- Indicators: `public/images/ui/build-bar/indicators`

The SVGs contain only base artwork. CSS in `src/styles.css` continues to own hover, selection, disabled, affordability, tutorial highlighting, and material-tier color. Disabled buttons intentionally reuse the same icon at reduced opacity because there was no distinct disabled drawing in the original UI.

The nighttime bow is a separate action asset because it replaces the repair wrench during the night. The locked, selected-tier, upgrade-arrow, and material-tier badge files are separate because their geometry is visually distinct.

## Structure reference sheet

`public/images/reference/structure-reference-sheet.svg` is a reference-only translation of `Renderer.drawStructure` in `src/renderer.ts`.

| Canvas branch | Reference groups | Appearance inputs |
| --- | --- | --- |
| `structure.kind === "wall"` | `wall-wood` through `wall-diamond` | `BALANCE.structure.radius.wall`, `BALANCE.tierColors` |
| `structure.kind === "spikes"` | `spikes-wood` through `spikes-diamond` | `BALANCE.structure.radius.spikes`, 12-point alternating-radius loop, `BALANCE.tierColors` |
| `structure.kind === "door"` | `door-wood` through `door-diamond` | `BALANCE.structure.radius.door`, stud positions, `BALANCE.ui.doorFadeRadius`, `BALANCE.ui.doorFadedOpacity` |
| `structure.kind === "harvester"` | `harvester-wood` through `harvester-diamond` | `BALANCE.structure.radius.harvester`, `BALANCE.structure.harvesterArm`, `BALANCE.tierColors` |
| `structure.kind === "turret"` | `turret-wood` through `turret-diamond` | `BALANCE.structure.radius.turret`, barrel rectangle and hub circle, `BALANCE.tierColors` |

The sheet uses neutral rotation, full health, and no flash. Damage cracks, placement tint, selection rings, range circles, and the offset gameplay shadow are excluded because they are temporary effects rather than base structure artwork. The separate door example shows the renderer's minimum proximity opacity of `0.38`.

Gameplay structures still render through Canvas. Editing the reference SVG does not update `Renderer.drawStructure`, and editing the Canvas renderer does not update the SVG automatically.

Run `npm run visual:validate` after changing structure geometry, palette constants, build-bar markup, or SVGs. The validator checks required assets and groups, rejects raster or base64 content, detects obsolete manual icon drawing, and fails when the documented renderer constants drift.
