import { describe, expect, it, vi } from "vitest";
import {
  MUSIC_TRACKS,
  MusicManager,
  musicContextForState,
  type MusicContext,
} from "./music";

class FakeAudio extends EventTarget {
  currentTime = 0;
  loop = false;
  paused = true;
  preload = "";
  volume = 1;
  playCalls = 0;
  pauseCalls = 0;
  rejectPlayback = false;

  constructor(readonly src: string) {
    super();
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.rejectPlayback) return Promise.reject(new Error("missing"));
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }
}

describe("music contexts", () => {
  it.each([
    ["day", { phase: "menu", timer: 0, night: 1, tutorialMode: false, bossNight: false }],
    ["day", { phase: "day", timer: 60, night: 1, tutorialMode: true, bossNight: false }],
    ["day", { phase: "day", timer: 11, night: 1, tutorialMode: false, bossNight: false }],
    ["countdown", { phase: "day", timer: 10, night: 1, tutorialMode: false, bossNight: false }],
    ["night", { phase: "night", timer: 11, night: 2, tutorialMode: false, bossNight: false }],
    ["countdown", { phase: "night", timer: 10, night: 2, tutorialMode: false, bossNight: false }],
    ["countdown", { phase: "night", timer: 10, night: 10, tutorialMode: false, bossNight: true }],
    ["night", { phase: "night", timer: 0, night: 10, tutorialMode: false, bossNight: true }],
    ["upgrade", { phase: "dawn", timer: 0, night: 2, tutorialMode: false, bossNight: false }],
    [null, { phase: "victory", timer: 0, night: 10, tutorialMode: false, bossNight: false }],
    [null, { phase: "defeat", timer: 0, night: 4, tutorialMode: false, bossNight: false }],
    ["night", { phase: "night", timer: 22, night: 11, tutorialMode: false, bossNight: false }],
    ["day", { phase: "day", timer: 22, night: 11, tutorialMode: false, bossNight: false }],
  ] as const)("selects %s", (expected, state) => {
    expect(musicContextForState(state)).toBe(expected);
  });

  it("has exactly the day, night, upgrade, and countdown tracks", () => {
    const contexts: MusicContext[] = ["day", "night", "upgrade", "countdown"];
    expect(Object.keys(MUSIC_TRACKS).sort()).toEqual([...contexts].sort());
    expect(Object.values(MUSIC_TRACKS).map((track) => track.file).sort()).toEqual([
      "./music/day.ogg",
      "./music/night.ogg",
      "./music/ticking.ogg",
      "./music/upgrade.ogg",
    ]);
  });
});

describe("music manager", () => {
  it("does not duplicate playback when the same state is entered repeatedly", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    const created: FakeAudio[] = [];
    const manager = new MusicManager((file) => {
      const audio = new FakeAudio(file);
      created.push(audio);
      return audio as unknown as HTMLAudioElement;
    }, 0);
    manager.setContext("day");
    manager.setContext("day");
    await Promise.resolve();
    expect(created).toHaveLength(1);
    expect(created[0]?.playCalls).toBe(1);
    vi.unstubAllGlobals();
  });

  it("crossfades cleanly and follows volume and mute settings", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    const created: FakeAudio[] = [];
    const manager = new MusicManager((file) => {
      const audio = new FakeAudio(file);
      created.push(audio);
      return audio as unknown as HTMLAudioElement;
    }, 0);
    manager.setSettings(0.5, 0.2, false);
    manager.setContext("day");
    await Promise.resolve();
    manager.setContext("night");
    await Promise.resolve();
    expect(created[0]?.pauseCalls).toBe(1);
    expect(created[1]?.volume).toBeCloseTo(MUSIC_TRACKS.night.volume * 0.5);
    manager.setSettings(0.5, 0.2, true);
    expect(created[1]?.volume).toBe(0);
    vi.unstubAllGlobals();
  });

  it("retires stale tracks across rapid phase changes", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const created: FakeAudio[] = [];
    const manager = new MusicManager((file) => {
      const audio = new FakeAudio(file);
      created.push(audio);
      return audio as unknown as HTMLAudioElement;
    }, 0);

    manager.setContext("night");
    await Promise.resolve();
    await Promise.resolve();
    manager.setContext("upgrade");
    await Promise.resolve();
    await Promise.resolve();
    manager.setContext("day");
    await Promise.resolve();
    await Promise.resolve();

    expect(created).toHaveLength(3);
    expect(created[0]?.paused).toBe(true);
    expect(created[1]?.paused).toBe(false);
    expect(created[2]?.paused).toBe(false);
    for (const frame of [...frames]) frame(performance.now() + 1000);
    expect(created[1]?.paused).toBe(true);
    expect(created[2]?.paused).toBe(false);
    expect(manager.getCurrentContext()).toBe("day");
    vi.unstubAllGlobals();
  });

  it("mixes the final countdown on its independent quieter channel", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    const created: FakeAudio[] = [];
    const manager = new MusicManager((file) => {
      const audio = new FakeAudio(file);
      created.push(audio);
      return audio as unknown as HTMLAudioElement;
    }, 0);
    manager.setSettings(0.8, 0.25, false);
    manager.setContext("countdown");
    await Promise.resolve();
    expect(created[0]?.volume).toBeCloseTo(MUSIC_TRACKS.countdown.volume * 0.25);
    vi.unstubAllGlobals();
  });

  it("treats a missing track as a safe silent fallback", async () => {
    const manager = new MusicManager((file) => {
      const audio = new FakeAudio(file);
      audio.rejectPlayback = true;
      return audio as unknown as HTMLAudioElement;
    });
    expect(() => manager.setContext("upgrade")).not.toThrow();
    await Promise.resolve();
    expect(manager.getCurrentContext()).toBe("upgrade");
  });

  it("stops music on result screens", async () => {
    const created: FakeAudio[] = [];
    const manager = new MusicManager((file) => {
      const audio = new FakeAudio(file);
      created.push(audio);
      return audio as unknown as HTMLAudioElement;
    }, 0);
    manager.setContext("night");
    await Promise.resolve();
    manager.setContext(null);
    expect(created[0]?.pauseCalls).toBe(1);
    expect(manager.getCurrentContext()).toBeNull();
  });
});
