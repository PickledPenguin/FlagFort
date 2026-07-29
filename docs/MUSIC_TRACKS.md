# Flag Fall music assignment

Flag Fall ships with music hooks, but no music files are bundled.

Place licensed `.ogg` files in `public/music/`. Only four audio files are
needed:

- `day.ogg` - day gameplay, the main menu, and the tutorial
- `night.ogg` - every night, including the boss and endless nights
- `upgrade.ogg` - dawn upgrade choices
- `ticking.ogg` - the final ten seconds of both day and night

Victory and defeat screens are silent. The shared ticking track replaces the
day or night soundtrack while either timer is between ten seconds and zero.
Boss overtime returns to the night soundtrack after the timer reaches zero.
Players can set the clock independently with the **Final countdown** volume
control in Settings; its quieter default is configured in `DEFAULT_SETTINGS`
in `src/audio.ts`.

The typed registry is `MUSIC_TRACKS` in `src/music.ts`. To replace or rename a
track, change only that context's `file` value in the registry. For example:

```ts
day: { file: "./music/my-day-theme.ogg", loop: true, volume: 0.72 },
```

The music manager prevents duplicate playback when a state is emitted more than
once, crossfades between different contexts, follows the master, music, and mute
settings, and treats a missing or undecodable file as silence without affecting
gameplay.
