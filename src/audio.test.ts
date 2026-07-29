// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}

import { beforeEach, describe, expect, it } from "vitest";
import manifest from "../public/audio/audio-attribution.json";
import {
  AUDIO_CONCURRENCY_LIMITS,
  AudioManager,
  emitAudioCue,
  selectAudiblePortals,
  SOUND_CONFIG,
  SOUND_IDS,
  type AudioCueDetail,
} from "./audio";

describe("audio asset coverage", () => {
  it("assigns every canonical sound exactly once", () => {
    expect(SOUND_IDS).toHaveLength(50);
    expect(new Set(SOUND_IDS).size).toBe(50);
    expect(Object.keys(SOUND_CONFIG).sort()).toEqual([...SOUND_IDS].sort());
    expect(manifest.canonicalSoundCount).toBe(50);
    expect(manifest.assignedSoundCount).toBe(50);
    expect(manifest.missingSounds).toEqual([]);
    expect(manifest.entries.map((entry) => entry.canonicalFilename).sort())
      .toEqual(SOUND_IDS.map((id) => `${id}.ogg`).sort());
  });

  it("keeps one source copy per canonical destination", () => {
    const sourcePaths = manifest.entries.map((entry) => entry.originalSourcePath);
    expect(new Set(sourcePaths).size).toBe(sourcePaths.length);
    expect(manifest.entries.every((entry) => entry.sourceSha256.length === 64)).toBe(true);
  });

  it("uses the requested horde and repeated-effect limits", () => {
    expect(AUDIO_CONCURRENCY_LIMITS["zombie-voices"]).toBe(5);
    expect(AUDIO_CONCURRENCY_LIMITS["zombie-attacks"]).toBe(6);
    expect(AUDIO_CONCURRENCY_LIMITS["resource-impacts"]).toBe(4);
    expect(AUDIO_CONCURRENCY_LIMITS["structure-impacts"]).toBe(4);
    expect(AUDIO_CONCURRENCY_LIMITS.turrets).toBe(5);
    expect(AUDIO_CONCURRENCY_LIMITS["ui-hover"]).toBe(1);
    expect(SOUND_CONFIG["portal-ambient"].spatial).toBe(true);
    expect(SOUND_CONFIG["flag-damaged"].volume)
      .toBeGreaterThan(SOUND_CONFIG["zombie-attack"].volume);
  });

  it("selects at most the two nearest in-range portal ambience loops", () => {
    const state = {
      listener: { x: 100, y: 100 },
      portals: [
        { id: 1, x: 900, y: 100 },
        { id: 2, x: 300, y: 100 },
        { id: 3, x: 500, y: 100 },
        { id: 4, x: 1500, y: 100 },
      ],
      active: true,
    };
    expect(selectAudiblePortals(state).map((portal) => portal.id)).toEqual([2, 3]);
    expect(selectAudiblePortals({ ...state, active: false })).toEqual([]);
  });
});

describe("audio events and preferences", () => {
  const stored = new Map<string, string>();

  beforeEach(() => {
    stored.clear();
    Object.defineProperty(document.defaultView, "localStorage", {
      configurable: true,
      value: {
        clear: () => stored.clear(),
        getItem: (key: string) => stored.get(key) ?? null,
        removeItem: (key: string) => stored.delete(key),
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });
  });

  it("dispatches typed gameplay cues without requiring Web Audio", () => {
    let received: AudioCueDetail | null = null;
    window.addEventListener("flagfall-audio-cue", (event) => {
      received = (event as CustomEvent<AudioCueDetail>).detail;
    }, { once: true });
    expect(() => emitAudioCue({
      cue: "structure-place",
      position: { x: 120, y: 240 },
    })).not.toThrow();
    expect(received).toEqual({
      cue: "structure-place",
      position: { x: 120, y: 240 },
    });
  });

  it("persists master, effects, ambience, music, countdown, and mute settings", () => {
    const manager = new AudioManager();
    manager.setVolume("master", 0.64);
    manager.setVolume("effects", 0.73);
    manager.setVolume("ambience", 0.41);
    manager.setVolume("music", 0.52);
    manager.setVolume("countdown", 0.28);
    manager.setMuted(true);

    const restored = new AudioManager().getSettings();
    expect(restored).toEqual({
      master: 0.64,
      effects: 0.73,
      ambience: 0.41,
      music: 0.52,
      countdown: 0.28,
      muted: true,
    });
  });

  it("clamps persisted volume values", () => {
    const manager = new AudioManager();
    manager.setVolume("master", 2);
    manager.setVolume("effects", -1);
    expect(manager.getSettings().master).toBe(1);
    expect(manager.getSettings().effects).toBe(0);
  });

  it("defaults the final countdown below the effects volume", () => {
    const settings = new AudioManager().getSettings();
    expect(settings.countdown).toBeLessThan(settings.effects);
  });
});
