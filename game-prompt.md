Build a complete browser game for the GMTK Game Jam 2026 theme Count Down.

Work inside the current standalone project folder. Implement the full game, not merely a prototype, mockup, design document, or partial foundation. Work through the milestones below in order, verify each milestone, and continue until every system and acceptance criterion is complete.

Do not stop after planning. Do not ask questions unless progress is genuinely blocked. Make reasonable implementation and balance decisions where details are unspecified, document them, and keep all important values easy to tune.

## Technology

Use:

* TypeScript
* HTML5 Canvas for gameplay rendering
* HTML and CSS for menus and interface overlays
* Vite for development and production builds
* Vitest or an equivalent lightweight test runner
* Browser APIs only
* No backend or external runtime services
* No heavy game framework unless the existing project already contains one and using it is clearly beneficial

The production build must:

* Run in current desktop browsers
* Support desktop window resizing
* Preserve the intended aspect ratio and scale cleanly
* Remain playable at common laptop and desktop resolutions
* Work with keyboard and mouse
* Produce a dist folder suitable for itch.io
* Place index.html at the root of the uploaded build
* Be hostable later as a normal static website

Use a fixed logical gameplay resolution with responsive Canvas scaling. Convert pointer coordinates correctly between displayed and logical coordinates.

Do not create generative AI art or audio. GMTK prohibits generated art and audio. Draw all current placeholder visuals procedurally through Canvas using simple flat vector shapes. Do not generate audio assets. Provide clean hooks for manually created art and audio to be added later.

## Game concept

Create a fast single-player top-down survival and base-defense game inspired mechanically by the useful parts of Starve.io without copying its assets, branding, code, map, or exact presentation.

The player gathers resources during a strict 60-second day, builds defenses around a flag in the center of the forest, and survives a 60-second zombie attack at night.

The run lasts 10 nights. Night 10 includes a boss alongside the ordinary wave. The player wins only after the Night 10 timer reaches zero and the boss has been killed.

The run ends immediately if the player dies or flag health reaches zero.

The theme Count Down must be central and highly visible:

* A prominent clock counts down until night during the day
* The clock counts down until dawn during the night
* The flag displays its remaining health as a large physical number
* Portals display countdowns before spawning zombies
* The boss displays 10 large health segments that count down
* Additional countdowns should appear physically in the world wherever they improve clarity
* Day and night always begin when their countdowns reach zero
* The player may optionally end daytime early through the confirmed Skip to Night action

## Run sequence

Use this sequence:

1. Show the main menu
2. Select Easy, Normal, Hard, or Impossible
3. Enter an optional seed or leave it blank for a random seed
4. Generate the forest and place the flag at the center
5. Begin Day 1
6. Begin Night 1 when the 60-second timer reaches zero or Skip to Night is confirmed
7. At dawn, remove all ordinary zombies in a visible puff of smoke and flame
8. Pause gameplay and show three sequential selection screens
9. First select one unlock paired with one mutation
10. Then select one upgrade paired with one mutation
11. Then select a second upgrade paired with one mutation
12. Apply all three selected benefits and all three paired enemy mutations
13. Warn the player if a new zombie type becomes available
14. Generate new portal locations
15. Begin the next 60-second day only after all selections are complete
16. Repeat through Night 10
17. After Night 10 reaches zero and the boss is dead, go directly to victory without another selection phase

Pause all game simulation and timers while selection screens, pause menus, tutorials, victory screens, or defeat screens are open.

## Difficulty

Add four pre-run difficulty options using centralized modifiers:

* Easy
* Normal
* Hard
* Impossible

Difficulty may modify enemy health, damage, attack speed, spawn count, and flag durability. It must not change the 60-second day or 60-second night.

Choose reasonable initial values and store them in centralized balance configuration. Make each difficulty meaningfully distinct while keeping Easy approachable and Impossible intentionally extreme.

There is no score or high-score system. Record and show:

* Difficulty
* Seed
* Nights survived
* Victory or defeat
* Basic run statistics such as resources gathered, structures built, zombies defeated, and elapsed time

The only primary progress measurement is nights survived.

Do not add permanent upgrades or mechanical progression between runs.

## World generation

Generate one seeded square forest map per run.

Requirements:

* The same seed and difficulty reproduce all gameplay randomness for the entire run
* This includes terrain, resource positions, portal positions, upgrade offerings, mutations, enemy composition, and other random choices
* Use a dedicated deterministic seeded pseudorandom number generator
* Never use Math.random for gameplay-affecting decisions
* Display the seed when the run begins
* Display the seed on victory and defeat screens
* Allow the seed to be copied
* Allow a seed to be entered from the main menu
* A blank seed generates a new valid seed

The map should take roughly 10 seconds for the player to travel from the center to an edge.

Generate visually and mechanically varied forest clearings, resource clusters, and natural passages. Keep generation readable and useful for base building.

The flag always spawns in the exact central area. Maintain a generous clear zone around it:

* No resources or portals inside the protected generation radius
* No player structures inside the smaller marked no-build radius
* Visually mark the no-build radius around the flag
* Keep the surrounding area open enough to construct a complete base
* Do not generate resource density that makes building frustrating

Resource nodes act as indestructible natural obstacles. Zombies pathfind around them unless attacking another valid constructed obstruction. Depleting a node does not remove its collision.

## Camera and minimap

Use a smooth camera centered on the player with enough zoom to understand nearby threats and base layout.

Add a minimap that shows:

* Player
* Flag
* Map boundary
* Resource regions or nodes
* Active portals
* Important threats during the night

Keep the minimap readable without revealing unnecessary fine detail.

## Player

Use a simple circular body with:

* Two eyes facing the mouse
* Two detached circular hands
* Smooth WASD movement
* Mouse aiming
* Flat vector visuals
* Clear damage, healing, attack, harvesting, and building feedback

The player can move while attacking.

The player begins with wooden gloves.

Player health:

* Display a clear health bar
* Do not add hunger, thirst, temperature, or survival meters
* Slowly heal while near the flag
* Show visible healing particles or pulses
* Fully restore health at dawn
* Death immediately ends the run

## Controls

Use:

* WASD for movement
* Mouse position for facing and aiming
* Left mouse button for the selected action
* Hold left mouse button to repeat attacks, harvesting, repairing, shooting, or placement at the applicable rate
* Number keys 1 through 7 to select toolbar slots
* Escape to pause
* No right-click requirement
* No backpack
* No inventory grid
* No Shift mode
* No structure rotation because structures and hitboxes are circular

Add a concise in-game tutorial or instruction overlay.

## Toolbar and resources

Display running totals for wood, stone, gold, and diamond along the right side of the screen.

Place the building and action toolbar at the top:

1. Fists
2. Daytime repair hammer or nighttime bow
3. Wall
4. Spikes
5. Door
6. Harvester
7. Turret

For structure slots:

* Clicking the slot opens a compact variant dropdown
* Show every unlocked material tier
* Show locked tiers clearly
* Selecting a tier makes it the default for that category
* Display the complete resource cost
* Display whether the player can afford it
* Number keys select the category while retaining its chosen tier
* Disable all building and repair actions at night

Slot 2 automatically changes:

* During the day it is the repair hammer
* During the night it is the bow
* Nothing can be repaired, built, upgraded, or dismantled at night

## Punching and targeting

Fists perform a visible punch using the detached hands. Behind the visual, use a short directional hitbox.

Fists can:

* Damage zombies
* Harvest resources
* Damage portals
* Open or close doors
* Deal more close-range damage than the bow

When targets overlap, prioritize:

1. Zombie
2. Portal
3. Door
4. Resource
5. Empty-space punch

The player must face and stand within range. Do not automatically walk toward clicked targets.

Holding the mouse button repeatedly punches according to the attack rate.

## Resources and gloves

Include:

* Wood from trees
* Stone from stone nodes
* Gold from gold nodes
* Diamond from diamond nodes

Award resources per successful harvesting hit.

Use these harvesting values:

| Gloves | Wood | Stone | Gold | Diamond |
| Bare hands | 1 | 0 | 0 | 0 |
| Wood | 2 | 1 | 0 | 0 |
| Stone | 4 | 2 | 1 | 0 |
| Gold | 8 | 4 | 2 | 1 |
| Diamond | 16 | 8 | 4 | 2 |

Only collect a resource if the current gloves can harvest it.

Gloves are unlocks:

* Start with wooden gloves
* Stone gloves require wooden gloves
* Gold gloves require stone gloves
* Diamond gloves require gold gloves

Resource node behavior:

* Nodes have finite harvest health
* Partial harvesting progress persists when the player walks away
* A fully depleted node becomes visibly gray
* A depleted node remains solid
* Depleted nodes cannot provide more resources that day
* Every node fully replenishes at dawn
* Partially depleted nodes also return to full at dawn
* Show clear hit and depletion feedback

## Building

Building should feel immediate and similar in convenience to Starve.io:

* Select a structure category and material tier
* Show a translucent placement preview near the mouse
* Placement is limited to short player reach
* Clearly show valid and invalid placement
* Left click places instantly when valid and affordable
* Crafting is instant
* There is no build placement cooldown
* Building is allowed only during the day

Prevent overlap with:

* Flag no-build zone
* Existing structures unless performing a valid same-category upgrade
* Player
* Zombies
* Map boundary

Allow structures to be placed over resource nodes as requested, but preserve stable collision and harvesting behavior. Ensure this does not trap the player or corrupt pathfinding.

All structures have circular hitboxes. Their visuals may still communicate walls, doors, spikes, machinery, and tier.

Include these categories at wood, stone, gold, and diamond tiers:

* Walls
* Doors
* Spikes
* Turrets
* Harvesters

Wood and stone variants are unlocked at the start.

Gold and diamond variants must be unlocked during dawn choices.

## Cumulative structure costs

A higher-tier structure includes the complete cumulative cost of every prior tier.

For example:

* Stone cost includes wood-stage cost plus stone-stage cost
* Gold cost includes wood, stone, and gold-stage costs
* Diamond cost includes wood, stone, gold, and diamond-stage costs

Centralize every stage cost.

If placing a stronger version over a weaker structure of the same category:

* Upgrade the existing structure
* Preserve its position and relevant state
* Charge only the difference between the current and selected cumulative costs
* Preserve its health percentage unless centralized balance intentionally defines a fairer upgrade rule
* Show an upgrade preview instead of a new-placement preview

The player may place a stronger tier directly on empty ground by paying its full cumulative cost.

## Structure behavior

Walls:

* Block players and zombies
* Have high durability
* Do not deal damage

Doors:

* Cost approximately twice as much as the corresponding wall tier
* Block movement while closed
* Allow movement while open
* Open or close when punched by the player
* Zombies may attack closed doors
* Communicate open and closed states clearly

Spikes:

* Block movement
* Have less health than walls
* Damage zombies slightly whenever zombies damage them
* Can be destroyed by sustained attacks

Turrets:

* Automatically find and shoot valid zombies in range
* Fire wooden, stone, gold, or diamond arrows matching their tier
* Higher tiers improve useful stats such as damage, range, or fire rate
* Are solid obstacles
* Are priority zombie targets
* Use clear range, aiming, and firing feedback

Harvesters:

* Have a rotating arm that continuously swings around the structure
* Harvest every resource node touched by the rotating arm
* May strike multiple nodes during one rotation
* Use harvesting amounts equivalent to the matching glove tier
* Begin with a slow rotation rate
* Rotation speed can be improved through upgrades
* Are solid obstacles
* Are priority zombie targets

## Repairing and dismantling

Nothing can be repaired at night.

During the day, the repair hammer can repair damaged structures and the flag.

Structure repair:

* Uses only the primary resource matching the structure tier
* Wood repairs wood
* Stone repairs stone
* Gold repairs gold
* Diamond repairs diamond
* Repair occurs at a limited rate
* Repair efficiency can be upgraded
* Display cost, health restored, and repair feedback

Flag repair restores one health by spending the highest available valid resource in this priority order:

1. One diamond
2. Two gold
3. Four stone
4. Eight wood

Use the first resource type in that order for which the player has enough. Do not combine resource types for one health point.

Allow structures to be dismantled only during the day:

* Provide a clear deliberate input that does not conflict with ordinary repair
* Return 50 percent of cumulative construction cost
* Round resource returns consistently
* Never allow the flag to be dismantled
* Never dismantle something through an accidental ordinary click

## Flag

Place the flag at the center of every map.

The flag:

* Is the primary zombie target
* Has a conventional health value balanced against enemy and structure damage
* Displays remaining health as a large physical number
* Has a visible health bar if useful
* Creates a healing radius for the player
* Has a clearly marked no-build radius
* Can be repaired only during the day
* Cannot move
* Cannot be destroyed or damaged by the player
* Ends the run immediately at zero health

Centralize flag health and tune it per difficulty.

## Day and night

Day:

* Lasts exactly 60 seconds
* Supports harvesting, punching, building, upgrading, repairing, dismantling, and portal destruction
* Shows the countdown prominently
* Gradually communicates approaching darkness
* Allows only the confirmed optional Skip to Night action to start night early

Night:

* Lasts exactly 60 seconds except for the boss condition
* Disables building, upgrading, repairing, and dismantling
* Replaces the repair hammer with the bow
* Spawns zombies from portals
* Shows the countdown prominently
* Ends at zero during Nights 1 through 9
* Instantly removes remaining ordinary zombies at dawn with smoke and flame
* Fully restores player health at dawn
* Replenishes all resources at dawn

Night 10:

* Spawn the boss alongside the regular wave
* If the boss dies before zero, continue until the timer reaches zero
* If the timer reaches zero before the boss dies, remove ordinary zombies but keep the boss
* Freeze the clock at zero and continue the night until the boss dies
* Victory requires both a zero timer and a dead boss

## Bow and arrows

During the night, toolbar slot 2 becomes a bow.

The player can switch freely between fists and bow.

Bow requirements:

* Fire toward the cursor
* Use a reasonable centralized fire rate
* Deal less damage than close-range punches
* Provide clear aiming, firing, impact, and cooldown feedback
* Do not consume crafted ammunition unless later balance configuration enables it
* Have finite range

Player and turret arrows:

* Pass over or through walls
* Pass through doors
* Pass through spikes
* Pass through turrets
* Pass through harvesters
* Pass through the flag
* Pass through the player
* Disappear when hitting a zombie
* Disappear when hitting a tree, stone, gold, or diamond node
* Disappear after reaching maximum range
* Never continue forever
* Use swept or otherwise reliable collision detection to avoid tunneling

## Portals

Spawn portals toward the map edges at every dawn, including initial run setup.

Portal count:

* Two initially
* Three beginning around Night 4
* Four beginning around Night 7

Portal placement must:

* Be deterministic from the seed
* Stay outside the flag safety radius
* Avoid structures and resources
* Avoid map boundaries by a suitable margin
* Avoid spawning too close to the player
* Be visibly marked during the day
* Display a countdown indicating when the night wave begins

The player may punch and destroy portals during the day.

When destroyed:

* Relocate the portal to another valid random position toward the map edge
* Do not reduce total wave size
* Do not remove its assigned zombies
* Give better gloves more portal damage
* Show strong destruction and relocation feedback

Portals cannot be permanently eliminated.

## Zombies

Use simple flat vector zombies based on the player silhouette:

* Green circular body
* Detached hands
* Evil eyes
* Damage marks
* Scars
* Optional exposed-brain detail
* Equipment such as helmets to communicate mutations or durability
* Clear attack telegraphs
* Damage only when the attack animation lands
* No contact damage

Zombies do not drop items or resources.

Base targeting priority:

1. Flag
2. Player
3. Turrets
4. Harvesters
5. Walls, doors, and spikes equally, with closest winning ties

Targeting behavior:

* The flag position is known globally
* With no local target, move toward the flag
* Scan for targets within a limited detection radius at controlled intervals
* Local detectable targets may override the global flag target according to priority
* Commit to a chosen target until it is destroyed, leaves detection range, or becomes unreachable
* Avoid constant target switching
* If a constructed structure blocks the route, attack it
* Pathfind around indestructible resource nodes and natural obstacles
* Recalculate paths efficiently when buildings change
* Do not recalculate every path every frame
* Prevent large groups from occupying exactly the same position
* Keep behavior deterministic when possible

Implement these types:

Basic zombie:

* Available on Night 1
* Balanced general-purpose enemy

Runner:

* Introduced on Night 2
* Faster movement
* Faster attacks
* Lower or moderate health

Breaker:

* Introduced on Night 3
* Slow
* High health
* High structure damage

Jumper:

* Introduced on Night 5
* Lower health
* Detects valuable targets through constructed walls
* When an ordinary zombie would attack a blocking constructed structure, hop over it instead
* Hop over one blocking structure at a time
* Use a visible telegraphed jump
* Use a jump cooldown
* Deal no damage while airborne
* Attack only after landing
* Cannot land directly on the flag

Summoner:

* Introduced on Night 7
* Periodically summons basic zombies
* May have at most three living summoned zombies at once
* Killing the summoner does not kill its summoned zombies
* Clearly telegraph summoning

When each special type first becomes available, pause before the following day and explain its behavior visually and concisely.

## Boss

Spawn one boss during Night 10 alongside the normal wave.

The boss:

* Is a very large zombie
* Has high health
* Moves slowly
* Prioritizes the flag
* Has a telegraphed area smash that damages nearby structures
* Summons several basic zombies upon reaching 50 percent health
* Displays 10 large health segments that count down as damage thresholds are crossed
* May also use a conventional underlying health bar
* Must die before the run can end in victory
* Remains after the night timer reaches zero
* Keeps Night 10 active until killed

Balance the boss so a prepared base, player attacks, and turrets all matter.

## Dawn unlocks, upgrades, and mutations

After every successful night except Night 10, present three sequential forced selections.

Selection 1:

* Show three unlock cards
* Each unlock is randomly paired with one enemy mutation
* Player selects exactly one
* Apply both the unlock and mutation

Selection 2:

* Show three upgrade cards
* Each upgrade is randomly paired with one enemy mutation
* Player selects exactly one
* Apply both

Selection 3:

* Show three different upgrade cards
* Each upgrade is randomly paired with one enemy mutation
* Player selects exactly one
* Apply both

Rules:

* Show the benefit and downside together clearly
* The player cannot refuse a choice
* Do not offer duplicate benefits during the same dawn
* Mutations may repeat in one dawn if paired with different benefits
* Already unlocked content cannot be offered again
* Upgrades and mutations can stack across the run
* Show accumulated values, not merely the latest increment
* Example display: All zombies deal 15 percent more damage
* If the unlock pool is exhausted, replace the unlock screen with another upgrade screen
* Enforce prerequisites
* Use deterministic seeded selection
* Avoid choices that have no remaining gameplay effect
* Avoid offering bow or repair upgrades immediately before victory if they cannot matter

Unlock pool:

* Stone gloves
* Gold gloves
* Diamond gloves
* Gold wall
* Diamond wall
* Gold spikes
* Diamond spikes
* Gold door
* Diamond door
* Gold harvester
* Diamond harvester
* Gold turret
* Diamond turret

Wood and stone structure variants begin unlocked.

Prerequisites:

* Each glove tier requires the preceding tier
* Gold structures require the matching stone structure
* Diamond structures require the matching gold structure

Upgrade pool should include useful stackable improvements such as:

* Player movement speed
* Player maximum health
* Punch attack speed
* Punch damage
* Bow fire rate
* Bow damage
* Harvest speed
* Repair efficiency
* Structure durability
* Structure cost reduction
* Turret damage
* Turret fire rate
* Turret range
* Harvester rotation speed
* Flag maximum health or durability

If maximum health increases, apply a clearly documented fair rule for current health. Clamp percentage-based cost reductions to prevent free or negative costs.

Mutation pool should include:

* Increased basic-zombie spawn weighting
* Increased runner spawn weighting
* Increased breaker spawn weighting
* Increased jumper spawn weighting after Night 5
* Increased summoner spawn weighting after Night 7
* Increased global zombie health
* Increased global zombie damage
* Increased global movement speed
* Increased global attack speed
* Increased structure damage
* Increased wave size

Repeated mutations increase the accumulated value.

Special zombie spawn mutations cannot appear before that type becomes available.

Every introduced zombie type should have a small base spawn chance. Mutations increase its relative chance rather than being required to enable it.

The day and night durations never change through upgrades, mutations, or difficulty.

## Interface

Create a polished, cohesive placeholder interface using HTML and CSS overlays where appropriate.

Include:

* Main menu
* Difficulty selection
* Optional seed input
* Start button
* Instructions
* Pause menu
* Day and night clock
* Current night from 1 through 10
* Player health
* Flag health
* Resource totals
* Top toolbar
* Structure tier dropdowns
* Build cost and affordability
* Minimap
* Portal countdowns
* Dawn selection cards
* New-enemy warning panels
* Victory screen
* Defeat screen
* Run record and seed
* Restart with same seed
* Restart with new seed
* Return to main menu

Clearly distinguish:

* Day from night
* Valid from invalid placement
* Locked from unlocked tiers
* Affordable from unaffordable structures
* Selected toolbar action
* Damage, healing, repair, harvesting, and upgrades
* Enemy types and mutations

## Visual direction

Use simple original flat vector shapes:

* Forest-green ground
* Visually varied clearings and foliage
* Circular resource nodes with readable material colors
* Circular player and zombie bodies
* Detached circular hands
* Minimal expressive faces
* Strong silhouettes
* Clear tier colors for wood, stone, gold, and diamond
* Simple particles for hits, harvesting, healing, smoke, flame, construction, and destruction
* Subtle camera shake for major impacts
* No copied Starve.io assets
* No generated images
* No generated audio

Keep gameplay readable when many zombies and structures are present.

## Architecture

Organize the code into focused systems rather than one large file.

Use clear modules for concepts such as:

* Game state and phase transitions
* Main loop and fixed timestep updates
* Input
* Rendering
* Responsive viewport and camera
* Entities and components
* Collision
* Spatial queries
* Pathfinding
* Player
* Resources
* Structures
* Projectiles
* Portals
* Zombies and enemy types
* Boss
* Procedural generation
* Seeded randomness
* Unlocks
* Upgrades
* Mutations
* Difficulty
* User interface
* Saveable run records
* Balance configuration

Use a fixed simulation timestep with interpolated or smooth rendering where practical.

Use spatial partitioning for collision, target scanning, harvesting, arrows, and enemy queries so the game remains responsive during large waves.

Keep gameplay state separate from rendering and DOM presentation.

## Centralized balance data

Store all tunable values in centralized typed configuration:

* Phase durations
* Map dimensions
* Clear radii
* Player statistics
* Flag statistics
* Resource node health and density
* Harvest values
* Structure stage costs
* Structure health
* Repair costs and rates
* Arrow statistics
* Turret statistics
* Harvester statistics
* Portal counts and placement rules
* Enemy statistics
* Spawn composition
* Boss statistics
* Difficulty modifiers
* Unlock prerequisites
* Upgrade increments
* Mutation increments
* Introduction nights

Do not scatter unexplained numeric constants throughout gameplay code.

Add comments only where they explain non-obvious behavior or design decisions.

## Automated tests

Add useful automated tests for deterministic and rules-heavy logic.

At minimum test:

* Same seed produces identical world generation
* Same seed produces identical choice offerings
* Different seeds produce meaningful differences
* Cumulative structure costs
* Upgrade cost differences
* Fifty-percent dismantling refunds
* Flag repair resource priority
* Unlock prerequisites
* Upgrade stacking
* Mutation stacking
* No special-zombie mutation before introduction
* Phase transitions
* Night 10 boss completion rule
* Resource replenishment at dawn
* Difficulty configuration
* Structure cost reduction clamping

Keep browser gameplay testing manual where automated tests would add little value.

## Milestones

Complete and verify all milestones:

### Milestone 1

* Project scaffolding
* Responsive Canvas
* Main loop
* Input
* Camera
* Player movement and aiming
* Main menu
* Difficulty and seed selection

### Milestone 2

* Seeded forest generation
* Flag and clear zones
* Resources
* Harvesting
* Gloves
* Resource HUD
* Minimap

### Milestone 3

* Toolbar
* Placement previews
* Cumulative costs
* Walls
* Doors
* Spikes
* Repair
* Dismantling
* Upgrading in place

### Milestone 4

* Day and night phases
* Countdown presentation
* Portals
* Base zombies
* Combat
* Bow
* Arrows
* Dawn removal effects

### Milestone 5

* Turrets
* Harvesters
* Efficient collision
* Target priorities
* Pathfinding
* Structure obstruction behavior

### Milestone 6

* Unlock screens
* Upgrade screens
* Mutation pairings
* Prerequisites
* Stacking
* Special-zombie introductions

### Milestone 7

* Runners
* Breakers
* Jumpers
* Summoners
* New-enemy warnings
* Difficulty balancing

### Milestone 8

* Night 10 boss
* Victory and defeat
* Run records
* Same-seed restart
* Complete 10-night loop

### Milestone 9

* Automated tests
* Performance pass
* Responsive layout pass
* Browser compatibility
* Visual feedback
* Tutorial
* Accessibility and readability
* Production build
* Itch.io packaging instructions

After each milestone:

* Run relevant tests
* Run type checking
* Build the project
* Fix errors before continuing
* Manually inspect the game in a browser when available

## Documentation

Create a concise README covering:

* Game premise
* Controls
* Day and night loop
* Resources and structures
* Unlock and mutation system
* Difficulty
* Seeded runs
* Local development
* Tests
* Production build
* Exact itch.io upload steps
* Project structure
* How to tune balance values
* How to replace placeholder visuals
* How to add manually created audio later
* Known limitations, only if any remain

Also include a short attribution section ready for future manually sourced assets. Do not invent asset credits.

## Completion criteria

The work is complete only when:

* A run can start from the main menu
* All four difficulties work
* Random and manually entered seeds work
* The player can complete a deterministic 10-night run
* The day is exactly 60 seconds
* The night is exactly 60 seconds except while waiting for the boss to die
* The player can start night early only through the confirmed Skip to Night action
* The player can harvest all four resources with correct gloves
* Resources visibly deplete and replenish at dawn
* Every structure category and tier works
* Building, repair, upgrades, and dismantling are disabled at night
* Fists and bow work as specified
* Turrets and harvesters work
* Portals relocate when destroyed
* Zombie priorities and pathfinding work
* Every special zombie behaves distinctly
* Three dawn selections occur after Nights 1 through 9
* Benefits and paired mutations both apply
* Stacking values display correctly
* Night 10 includes the boss and obeys both completion conditions
* Flag or player death ends the run
* Victory, defeat, run record, seed display, and restarts work
* Desktop resizing works
* The minimap works
* Automated tests pass
* Type checking passes
* Production build succeeds
* The dist output runs as a static browser game
* No generated art or audio is included

Finish by reporting:

* What was implemented
* Important architectural decisions
* Tests and verification performed
* Exact development and build commands
* Location of the production build
* Any remaining limitations
