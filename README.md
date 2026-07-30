# Flag Fall

Flag Fall is a fast top-down survival and base-defense game built for the GMTK Game Jam 2026 theme, Count Down. Gather resources during the day, fortify the flag, and survive 30-second zombie attacks across ten nights. Optional deterministic challenges can modify every layer of a run.

Game artwork uses original editable SVG assets composited by Canvas for world transforms and runtime state. The project contains no generated art or generated audio. Generic interface symbols use selected Lucide Icons paths under the ISC License. Licensed sound effects are bundled locally for reliable browser playback.

## Feature goals

Mandatory foundations come first:

- One shared, editable SVG source for every reusable resource and sprite.
- Permanent flag damage, true nighttime boss overtime, and 30-second standard nights.
- Exact resource deltas in build, upgrade, repair, recycle, and reroll interfaces.
- Deterministic content definitions, capacities, rerolls, and reliable navigation recovery.

Numbered improvements follow only after those foundations:

1. Expand challenge combinations and Endless Mode balance.
2. Add further card sets through the centralized definitions.
3. Continue visual polish without duplicating asset sources.

## SVG asset inventory

All editable vectors live under `public/images/` and are served by the same relative paths in Vite development and production builds.

- `images/resources`: the canonical wood log, stone, gold, and diamond UI icons.
- `images/world`: active and depleted resource-node states.
- `images/enemies`: complete enemy sprites, including the unique countdown boss.
- `images/gameplay`: independently animated enemy, player, flag, portal, projectile, and cursor parts.
- `images/structures`: per-tier wall, door, spikes, harvester, and turret assets, with moving arms and barrels split out.
- `images/tutorial`: one illustration for each Field Guide stage.
- `images/cards/unlocks`: unlock-card illustrations.
- `images/cards/upgrades`: repeatable-upgrade illustrations.
- `images/cards/mutations`: enemy-mutation illustrations.
- `images/actions`, `images/challenges`, and `images/ui`: reserved for reusable action, challenge, and interface illustrations.

`src/assets.ts` is the typed asset registry. Reuse its paths instead of introducing inline SVG strings or interface-specific copies.

## Editing cards and tutorial stages

Card gameplay and presentation metadata is centralized in `src/content.ts`. Each definition has a stable ID, category, exact effect text, accumulated-value formatter, illustration path, prerequisites, stack limit, weight, introduction night, and compatibility list. Add or edit definitions there without changing the dawn renderer.

Tutorial stages are ordered in `TUTORIAL_STAGES` in the same file. Each stage has a stable ID, title, concise instructions, illustration path, optional controls, and explicit order. Add the matching editable SVG under `public/images/tutorial/`.

## Controls

- `WASD`: move
- Mouse: aim
- Left mouse: use the selected action
- `1`: fists
- `2`: repair wrench during the day, bow during the night
- `3`: recycle
- `4`: walls
- `5`: spikes
- `6`: doors
- `7`: harvesters
- `8`: turrets
- `Escape`: pause or resume

The large bottom toolbar is fully mouse-selectable, and structure slots open a material panel on the left. Punch and bow actions repeat while held. Repair and recycle require a deliberate click. Player-only doors always let the player pass while blocking zombies. Structure tier selections remain selected when changing toolbar slots. Building, upgrading, repair, and recycling are disabled at night.

## The day and night loop

Each day lasts exactly 60 seconds. Gather wood, stone, gold, and diamond, destroy or relocate portals, build, upgrade, repair, and recycle before the count reaches zero. The optional Skip to Night action can end the day early after confirmation without granting a reward.

Each standard night lasts exactly 30 seconds. Slot 2 becomes the bow and portals release their complete assigned wave during the first 15 seconds. If the full wave is spawned and every zombie is eliminated, dawn begins early through the normal transition. Surviving ordinary zombies ignite only after the game truly enters the next day. Sunlight halves their movement speed and deals escalating damage while the new day continues. Player health is restored and every non-destroyed resource node replenishes.

After Nights 1 through 9, the game pauses for three forced choices:

1. One unlock paired with an enemy mutation
2. One upgrade paired with an enemy mutation
3. A second upgrade paired with an enemy mutation

Benefits and mutations both apply and stack. New enemy types receive a warning panel before the next day.

Night 10 includes a boss with ten visible health segments. If the timer reaches zero first, ordinary zombies disappear while the boss remains. Victory requires a zero timer and a defeated boss.

## Resources and gloves

Wooden gloves are available at the start. Stone, gold, and diamond gloves must be unlocked in order. Better gloves gather more material per hit and unlock tougher resources. Resource nodes keep partial damage, remain solid when depleted, and fully replenish at dawn.

## Structures

Walls, doors, spikes, harvesters, and turrets are available in wood, stone, gold, and diamond tiers. Wood and stone structures begin unlocked. Higher tiers use cumulative costs, so a directly placed diamond structure includes every earlier stage. Upgrading a weaker matching structure charges only the difference and preserves its health percentage.

- Walls provide high durability.
- Doors use a circular four-dot design, always let the player pass, and block zombies like walls.
- Spikes damage zombies that attack them.
- Turrets automatically aim and fire tier-colored arrows.
- Harvesters rotate an arm and gather every resource node it touches.

Daytime structure repairs are instant. A full repair costs the ceiling of each cumulative construction resource multiplied by the missing-health fraction, and consumes nothing unless the complete repair is affordable. Flag damage is permanent and the flag is never a repair target. Recycling returns 50 percent of the paid cumulative cost.

Portals project visible no-build zones while a structure action is selected. Placement validation and portal relocation both keep structures outside these zones.

## Tutorial

The tutorial is a separate nine-section interactive training forest available from the main menu. Each room gates tools, materials, targets, placement areas, and resources to the current task. Steps advance from real gameplay events, while section endings support replay, skip, exit, and progression. Tutorial activity never changes run records, unlock progression, highest night, challenges, or saved seeds.

## Difficulty

Easy, Normal, Hard, and Impossible use centralized modifiers for enemy health, damage, speed, attack rate, wave size, and flag durability. Difficulty never changes the 60-second day or 30-second standard night. Easy is approachable, while Impossible is intentionally extreme.

There is no score or permanent mechanical progression. Local run records contain the difficulty, seed, nights survived, outcome, resources gathered, structures built, zombies defeated, and elapsed time.

## Seeded runs

Enter an optional seed on the main menu or leave it blank for a new browser-generated seed. A dedicated deterministic pseudorandom generator controls terrain, resources, portals, choices, mutations, waves, enemy composition, and other gameplay decisions. `Math.random` is not used.

The same seed, difficulty, choices, and player inputs reproduce the same run. Seeds are shown in-game and on result screens, and can be copied or restarted directly.

## Local development

Requirements: a current Node.js release and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Tests

```bash
npm test
npm run typecheck
```

The Vitest suite covers deterministic world and choice generation, different-seed variation, cumulative costs, upgrade differences, recycle refunds, proportional and unaffordable structure repairs, permanent flag damage, portal placement restrictions, resource-obstacle routing, sunlight state and escalation, toolbar mouse selection, horizontal tier selection, stable DOM identity, UI input isolation, unlock prerequisites, capacity upgrades, reroll costs, upgrade and mutation stacking, phase transitions, the Night 10 overtime rule, dawn replenishment, difficulty configuration, and cost reduction clamping.

## Production build

```bash
npm run build
npm run preview
```

The static production build is written to `dist/`. `npm run preview` serves that output for a local production check. The build contains `index.html` at its root and uses relative asset paths, so it can run on itch.io or a normal static host.

## Exact itch.io upload steps

1. Run `npm run build`.
2. Open the generated `dist/` folder.
3. Create a zip whose root contains `index.html` and the `assets/` folder. Do not zip the parent folder itself.
4. Create or edit the itch.io project.
5. Set the project kind to `HTML`.
6. Upload the zip and mark it as playable in the browser.
7. Enable fullscreen support.
8. Use a 16:9 viewport such as 1280 by 720, or allow itch.io to launch fullscreen.
9. Save the page and test the uploaded build in a desktop browser.

## Project structure

```text
src/
  audio.ts        Centralized preloading, playback, mixing, spatial audio, limits, and persisted settings
  choices.ts      Deterministic dawn offerings and unlock application
  config.ts       Typed centralized balance values
  game.ts         Run state, phase transitions, and gameplay systems
  input.ts        Keyboard and logical pointer coordinate conversion
  pathfinding.ts  Controlled grid pathfinding around natural obstacles
  renderer.ts     Canvas compositing, SVG transforms, feedback, and minimap rendering
  rng.ts          Seed hashing and deterministic random generation
  rules.ts        Costs, refunds, repairs, stacking, and prerequisites
  spatial.ts      Spatial hash and reliable collision helpers
  storage.ts      Safe browser-local preference and run-record access
  types.ts        Shared game data types
  ui-icons.ts     Shared SVG markup for game and Lucide-derived UI symbols
  ui.ts           Menus, HUD, toolbar, choices, warnings, and records
  world.ts        Seeded forest and resource generation
  game.test.ts    Deterministic and rules-heavy automated tests
  ui.test.ts      Stable DOM, toolbar, tier, and input-isolation tests
```

Gameplay state is separate from Canvas rendering and DOM presentation. The fixed-timestep simulation runs at 60 updates per second. Spatial hashes limit nearby collision, targeting, harvesting, and projectile queries. The responsive Canvas uses a fixed 1280 by 720 logical resolution and converts displayed pointer coordinates back into that space.

## Tuning balance

All important values are in `src/config.ts` under `BALANCE`. This includes phase durations, map size, player and flag statistics, resource density and health, glove harvest values, stage costs, structure health, repair values, portal placement, enemy stats, waves, boss stats, difficulty modifiers, upgrade increments, mutation increments, and introduction nights.

Keep the standard day fixed at 60 seconds and the standard night fixed at 30 seconds.

## Editing gameplay visuals

Reusable gameplay artwork is registered in `src/assets.ts` and stored under `public/images/gameplay` and `public/images/structures`. Canvas is the compositor only: it positions, rotates, scales, tints, hides, and swaps SVG parts without recreating entity artwork from drawing primitives.

Keep independently moving parts separate, preserve each SVG viewBox and transparent background, and run `npm run visual:validate` after an asset change. Do not change collision rules to match decorative sprite bounds.

## Audio

The centralized Web Audio manager in `src/audio.ts` preloads 50 canonical OGG files from `public/audio/`. It supports one-shots, spatial world sounds, two-nearest portal ambience loops, master/effects/ambience buses, mute, browser autoplay unlocking, cooldowns, concurrency limits, subtle repeated-sound variation, and scene cleanup. Volume settings persist in local storage.

The typed music registry and crossfade manager live in `src/music.ts`. It uses
day, night, upgrade, and final-countdown tracks; day music also covers the main
menu and tutorial, while boss and endless nights reuse night music. The shared
countdown track has its own quieter persisted volume control. See
[docs/MUSIC_TRACKS.md](docs/MUSIC_TRACKS.md) for the exact file locations and
one-path replacement workflow.

Gameplay and interface systems dispatch typed `flagfall-audio-cue` events. Portal positions and the listener position use a separate spatial-state event, preserving the simulation/presentation boundary. Missing or undecodable files fail silently without interrupting gameplay.

Run `node scripts/audio-pipeline.mjs` after changing the source selection. The pipeline verifies source hashes, trims silence, applies fixed gain without dynamic-range compression, resamples to 48 kHz stereo, encodes OGG Opus, and regenerates `public/audio/audio-attribution.json`.

## Attribution

- Lucide Icons: selected generic interface icon paths, Copyright Lucide Contributors, [ISC License](https://lucide.dev/license)
- Kenney sound effects: CC0 1.0
- Sonniss GDC Game Audio Bundle Part 9 selections: royalty-free personal and commercial use
- Trebuchet MS and Impact: web-safe system font stacks; no font files are bundled or redistributed
- Complete canonical filenames, original absolute paths, creators, packs, licenses, source hashes, modifications, technical metadata, and gameplay events: `public/audio/audio-attribution.json`
