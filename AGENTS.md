# FlagFort agent guidance

- FlagFort is a polished deterministic single-player browser game targeting CrazyGames. Do not implement multiplayer yet.
- Preserve deterministic gameplay. Use `SeededRng` from `src/rng.ts` with stable, purpose-specific seeds for gameplay-affecting randomness.
- Keep balance in `src/config.ts` and `src/meta-balance.ts`, challenges in `src/challenges.ts`, equipment derivation in `src/equipment.ts`, assets in `src/assets.ts`, and audio events/assets in `src/audio.ts` and `scripts/audio-pipeline.mjs`. Avoid duplicate systems.
- Stable visible artwork should generally be editable SVG under `public/images/`. Preserve valid metadata, IDs, layers, groups, transforms, pivots, accessibility content, and editor structure. Never destructively optimize manually edited SVGs unless a verified compatibility or security problem requires it.
- Keep player-originated sounds centered and spatialize world-originated sounds through the shared audio event system.
- Preserve per-player ownership for structures, attacks, projectiles, kills, repairs, and equipment.
- Preserve profile/save migration behavior in `src/profile.ts` and `src/storage.ts`. Avoid unrelated rewrites.
- The audio files that are currently assigned to audio events are the canonical sound effects, do not change them. Audio effects can be added if needed but existing audio should not be changed or updated without explicit permission.
- Validate with `npm test`, `npm run build`, `npm run visual:validate`, and relevant browser checks at CrazyGames iframe sizes. Rebuild canonical audio with `npm run audio:build` after changing audio selections.
