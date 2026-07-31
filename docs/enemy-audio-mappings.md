# Enemy audio mappings

The enemy registry owns replaceable action-to-cue mappings. All actions are world-originated and use the existing spatial audio path, cooldowns, volume controls, pause behavior, mute behavior, and CrazyGames lifecycle handling.

| Enemy action | Registered cue | Selected source character |
| --- | --- | --- |
| Gremlin sabotage | `gremlin-sabotage` | Heavy metal sabotage impact |
| Splitter split | `splitter-split` | Sharp glass-like separation |
| Popper acid burst | `popper-burst` | Heavy soft burst |
| Archer fire / impact | `archer-bow-fire` / `archer-arrow-impact` | Separate spatial bow slice and tin impact |
| Acidslinger fire / impact | `acidslinger-fire` / `acidslinger-impact` | Wet launch and liquid impact |
| Rammer charge-up / movement / collision | `rammer-charge` / `rammer-rush` / `rammer-impact` | Charged creature vocal, air rush, and heavy plate collision |

The committed player `bow-fire`, player `arrow-impact`, standard `zombie-attack`, and standard `zombie-death` selections remain unchanged. New enemy actions use dedicated spatial cues so their cooldowns and concurrency cannot suppress those custom sounds. No source files were duplicated and no audio was generated. A mapping can be replaced in `ENEMY_REGISTRY` without changing combat behavior.
