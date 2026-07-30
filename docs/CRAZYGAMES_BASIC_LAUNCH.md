# CrazyGames Basic Launch

Flag Fort integrates the CrazyGames HTML5 SDK v3 through `src/platform.ts`. No
gameplay system calls `window.CrazyGames` directly. The adapter supports
`local`, `crazygames`, `disabled`, and SDK-unavailable environments, deduplicates
lifecycle events, and keeps disabled environments playable.

## Submission settings

In the CrazyGames Developer Portal submission flow, set **Progress Save** to
**Yes, using the Data Module from the CrazyGames SDK**. The Data module is the
authoritative profile store for both guests and signed-in users on CrazyGames.
Do not select automatic localStorage backup as a substitute.

Basic Launch intentionally contains no ads, multiplayer, lobbies, chat,
networking, or game-specific authentication. Identity, username, avatar, and
the login prompt come from the CrazyGames User module.

## Loading and lifecycle

`src/main.ts` shows the loading screen, loads and awaits
`https://sdk.crazygames.com/crazygames-sdk-v3.js`, initializes the SDK, creates
the profile store, and then starts the game. It reports:

- `loadingStart` after SDK initialization while game systems are prepared
- `loadingStop` when the menu is interactive
- `gameplayStart` for active day and night simulation
- `gameplayStop` for menus, dawn choices, pause, victory, and defeat
- campaign progress at survived-night milestones and 100 percent for Night 10
- `happytime` only for the Night 10 campaign victory

SDK `muteAudio` is held separately from the player's audio preference and
always wins. Settings changes take effect without modifying the saved in-game
preference. Run context contains only seed, difficulty, night, phase, player
level, and equipped item tiers, and is cleared outside active gameplay.

## Local SDK testing

Run:

```bash
npm run dev
```

Use `localhost` or `127.0.0.1`. The SDK enters its local environment. Useful
User module query parameters include:

- `?user_response=logged_out`
- `?user_response=user1`
- `?user_response=user2`
- `?user_account_available=false`
- `?show_auth_prompt_response=user1`
- `?show_auth_prompt_response=user_cancelled`
- `?muteAudio=true`

For the closest production test, upload the production `dist/` contents to a
game entry in the CrazyGames Developer Portal and use its Preview tool. Verify
guest and signed-in profiles separately because the Data module changes the
active data set on account changes. Login automatically synchronizes guest
progress when the account has no prior game data. Logout returns to guest data.

## Save schema and migration

The profile schema and validation live in `src/profile.ts`; constants live in
`src/meta-balance.ts`. The current storage key is `flagfort-profile-v2` and the
schema version is `2`.

The persisted profile contains:

- lifetime XP, spendable XP, derived player level, and coins
- last UTC CrazyGames calendar reward date
- all permanent upgrade levels
- equipment tiers and equipped state
- player color and eye style
- highest night, wins, run count, best structure score, and recent run records
- one pending settlement and the last 100 completed settlement IDs

Every load validates types, ranges, enum values, and dates. Missing fields
receive defaults. Invalid JSON recovers to a safe default profile. Older partial
profiles are migrated field by field. The legacy `countdown-forest-records`
value is imported when the versioned profile has no recent records.

Daily rewards use an injected/testable `Date`, convert it to `YYYY-MM-DD` with
UTC ISO semantics, and save the claim before presenting it. The initial reward
is 10 coins. A refresh on the same UTC date cannot grant it again.

Run investments are deducted once when a pending settlement is created.
Settlement requires the same pending ID and investment, records the ID before
another settlement can occur, and updates XP, coins, and records in one
controlled profile save. A stale pending run is closed as a zero-night loss
when a different new run begins.

## Balance and formulas

- `src/config.ts`: original run, enemy, structure, challenge, and temporary-card balance
- `src/meta-balance.ts`: daily reward, levels, permanent upgrades, equipment,
  XP categories, and the complete campaign and Endless investment tables
- `src/rewards.ts`: pure XP and coin formulas
- `src/modifiers.ts`: effective-stat order and cooldown helpers
- `src/equipment.ts`: equipment tier transitions, mitigation, free repairs,
  and sword lookup

The effective percentage order is base, permanent upgrades, equipment,
challenge, temporary upgrades, mutations, and contextual effects, followed by
temporary flat additions. Percentage layers are additive. Existing temporary
flat bonuses and cooldown reductions retain their original increments.

Night investment returns are explicitly 0, 20, 40, 60, 80, 100, 120, 140,
160, 180, and 200 percent for zero through ten nights survived. Positive coin
returns use `Math.round`. Endless returns use the explicit 205 through 225
percent extension and cap at 225 percent.

## Adding permanent upgrades

1. Add the typed ID to `PermanentUpgradeId` in `src/meta-balance.ts`.
2. Add one `PERMANENT_UPGRADES` registry entry and reuse the matching temporary
   card SVG.
3. Add its default/migration field through the registry-driven profile helpers.
4. Apply it at the relevant effective-stat call using the owning player ID.
5. Add formula, owner, stacking, and UI tests.

Permanent levels are always zero through five and grant 10 percent each. Costs
are based on the configurable 1,000 XP typical campaign victory target.

## Adding equipment

1. Add the category to `EquipmentKind`, `EQUIPMENT_ORDER`, and the data registry
   in `src/meta-balance.ts`.
2. Add one reusable editable SVG under `public/images/equipment/`.
3. Add pure effect logic to `src/equipment.ts`.
4. Render the equipped asset only for its relevant player action.
5. Attribute attacks, projectiles, repairs, and owned structures to a player ID.
6. Add all tier boundary and deterministic RNG tests.

Wood unlocks an item. Stone, Gold, and Diamond upgrade it sequentially.

## SVG and Canvas boundary

All new stable visuals are editable SVGs: player body and eye parts, helmet,
wrench, sword, shop artwork, and upgrade nodes. They use transparent
backgrounds, editable IDs, and valid viewBoxes. The same assets are shared by
menus and gameplay.

Canvas remains the compositor for world transforms, rotation, camera movement,
runtime tinting, minimap projection, health bars, targeting/range previews,
particles, procedural forest placement, and transient damage/resource text.
These visuals change continuously or are generated from live state, so separate
static SVG files would not improve editability.

## Future multiplayer boundaries

Single player uses `local-player`. Players, structures, projectiles, attacks,
kills, repairs, and equipment effects carry or resolve a player ID. Structure
bonuses are derived from the structure owner's profile snapshot. Platform
identity is isolated in `GamePlatform`.

There is intentionally no transport, replication, server authority, room,
invite, lobby, chat, or multiplayer UI. A future multiplayer implementation can
replace the player/profile resolver and add networking outside the deterministic
simulation without changing the CrazyGames adapter or economy formulas.
