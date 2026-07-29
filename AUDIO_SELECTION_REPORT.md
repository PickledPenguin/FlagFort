# Flagfall audio selection report

## Source search

The recursive search covered `/Users/aiagents/Documents/GMTK/Audio`.

Accessible candidate groups:

- Kenney Impact Sounds, Interface Sounds, RPG Audio, and UI SFX Set
- Sonniss GDC Game Audio Bundle Part 9, sections 1 through 5
- An unlabeled `Audio/zombies` folder

All listed source folders were accessible. Source audio was read only. The conversion pipeline records a SHA-256 hash before conversion and verifies the same hash afterward.

## Rights review

- The four Kenney packs include local license files granting CC0 1.0 use.
- Each Sonniss bundle section includes the local Part 9 readme and license. The bundle grants royalty-free personal and commercial use without required attribution.
- The unlabeled `Audio/zombies` folder had no creator, pack, source, or license information and was rejected in full.
- No generative-AI audio was used.

## Selection and processing

All 50 canonical sounds are assigned. There are no missing sounds.

The complete per-sound source mapping is in `public/audio/audio-attribution.json`. Every entry includes:

- Canonical destination filename
- Original absolute source path and filename
- Creator, pack, and license
- Original SHA-256 hash
- Source codec, sample rate, channels, duration, loudness, mean level, and peak
- Conversion and editing details
- Connected gameplay events

The pipeline performs restrained processing:

- Removes only leading and trailing audio below -55 dB for non-looping effects
- Preserves the portal ambience loop boundaries
- Uses fixed gain adjustment instead of dynamic-range compression
- Caps gain to keep peaks below -1.25 dBFS
- Resamples to 48 kHz stereo
- Encodes OGG Opus at 80 kbps variable bitrate for effects and 64 kbps for ambience
- Limits a small number of long source files to a clean first event where recorded in the manifest

The complete production audio directory is approximately 1.2 MB.

## Important rejected candidates

- `Audio/zombies/*.wav`: rejected because rights and provenance are unclear.
- `WATRMisc_Water, Liquid Impact, Bubble, Sci Fi, Hit 04...wav`: rejected for `boss-acid-spit` after waveform review because it reads as several impacts, not a clean launch. A 0.52-second isolated spray was selected instead.
- `SWSH_SWING IMPACTS Quick Heavy Weapon Swing To Thud Impact Var 01...wav`: rejected for punch and machinery cues because the 61.8-second file contains many variants and unrelated impacts.
- `EffectiveTrailer_Alarms...wav`: rejected for flag damage because the 30-second alarms are too long and would obscure combat.
- `VOXFutz_Announcer Vocal Male Wet Countdown Ten Kills Remaining...wav`: rejected because spoken wording conflicts with the phase timer.
- Long city, crowd, storm, train, factory, and room-tone recordings: rejected as unrelated to the forest-defense actions.
- Human character dialogue, laughter, crying, and police-radio recordings: rejected because they add an unsupported character identity or unrelated speech.
- Multi-hit antique clock recordings: rejected for countdown playback because the short Kenney ticks provide cleaner one-event timing.

## Cohesion notes

The set uses short Kenney UI and material impacts for frequent actions, with selected Sonniss game, fantasy, creature, and transition sounds for distinctive phase, portal, zombie, and boss moments. Repeated effects remain brief and are varied at playback. Major countdown, flag, transition, and boss cues are not randomized.
