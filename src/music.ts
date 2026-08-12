import type { Phase } from "./types";

export type MusicContext =
  | "day"
  | "night"
  | "upgrade"
  | "countdown";

export interface MusicTrack {
  file: string;
  loop: boolean;
  volume: number;
}

/**
 * Assign music by changing only the `file` value for a context below.
 * Files live in `public/music` and are served from `./music`.
 */
export const MUSIC_TRACKS: Readonly<Record<MusicContext, MusicTrack>> = {
  day: { file: "./music/day.ogg", loop: true, volume: 0.72 },
  night: { file: "./music/night.ogg", loop: true, volume: 0.8 },
  upgrade: { file: "./music/upgrade.ogg", loop: true, volume: 0.74 },
  countdown: { file: "./music/ticking.ogg", loop: true, volume: 0.72 },
};

export interface MusicGameState {
  phase: Phase;
  timer: number;
  night: number;
  tutorialMode: boolean;
  bossNight: boolean;
}

export function musicContextForState(state: MusicGameState): MusicContext | null {
  if (state.tutorialMode || state.phase === "menu") return "day";
  if (state.phase === "dawn") return "upgrade";
  if (state.phase === "day" || state.phase === "night") {
    if (state.timer > 0 && state.timer <= 10) return "countdown";
    return state.phase;
  }
  return null;
}

type AudioFactory = (file: string) => HTMLAudioElement;

interface ActiveTrack {
  context: MusicContext;
  audio: HTMLAudioElement;
  targetVolume: number;
}

export class MusicManager {
  private active: ActiveTrack | null = null;
  private readonly tracks = new Set<ActiveTrack>();
  private context: MusicContext | null = null;
  private musicVolume = 1;
  private countdownVolume = 0.35;
  private muted = false;
  private transitionToken = 0;
  private readonly crossfadeMs: number;
  private readonly createAudio: AudioFactory;

  constructor(
    createAudio: AudioFactory = (file) => new Audio(file),
    crossfadeMs = 650,
  ) {
    this.createAudio = createAudio;
    this.crossfadeMs = crossfadeMs;
  }

  initialize(): void {
    if (typeof window === "undefined") return;
    const retry = (): void => {
      const audio = this.active?.audio;
      if (audio?.paused) void audio.play().catch(() => undefined);
    };
    window.addEventListener("pointerdown", retry, { passive: true });
    window.addEventListener("keydown", retry);
  }

  setSettings(
    musicVolume: number,
    countdownVolume: number,
    muted: boolean,
  ): void {
    this.musicVolume = Math.max(0, Math.min(1, musicVolume));
    this.countdownVolume = Math.max(0, Math.min(1, countdownVolume));
    this.muted = muted;
    for (const track of this.tracks) {
      track.audio.volume = this.effectiveVolume(track.targetVolume, track.context);
    }
  }

  setContext(context: MusicContext | null): void {
    if (this.context === context) return;
    if (context === null) {
      this.stop();
      return;
    }
    this.context = context;
    const definition = MUSIC_TRACKS[context];
    const audio = this.createAudio(definition.file);
    audio.loop = definition.loop;
    audio.preload = "auto";
    audio.volume = 0;
    const incoming: ActiveTrack = {
      context,
      audio,
      targetVolume: definition.volume,
    };
    const outgoing = this.active;
    this.tracks.add(incoming);
    for (const track of this.tracks) {
      if (track !== outgoing && track !== incoming) this.retire(track);
    }
    this.active = incoming;
    const token = ++this.transitionToken;
    const fallback = (missingFile: boolean): void => {
      if (token !== this.transitionToken || this.active !== incoming) {
        this.retire(incoming);
        return;
      }
      if (outgoing && this.tracks.has(outgoing)) {
        this.retire(incoming);
        this.active = outgoing;
        outgoing.audio.volume = this.effectiveVolume(
          outgoing.targetVolume,
          outgoing.context,
        );
      } else if (missingFile) {
        this.retire(incoming);
        this.active = null;
      } else {
        incoming.audio.volume = this.effectiveVolume(
          incoming.targetVolume,
          incoming.context,
        );
      }
    };
    audio.addEventListener("error", () => {
      fallback(true);
    }, { once: true });
    void audio.play()
      .then(() => this.crossfade(outgoing, incoming, token))
      .catch(() => fallback(false));
  }

  getCurrentContext(): MusicContext | null {
    return this.context;
  }

  stop(): void {
    this.transitionToken += 1;
    this.context = null;
    for (const track of [...this.tracks]) this.retire(track);
    this.active = null;
  }

  private crossfade(
    outgoing: ActiveTrack | null,
    incoming: ActiveTrack,
    token: number,
  ): void {
    const startedAt = performance.now();
    const outgoingStart = outgoing?.audio.volume ?? 0;
    const step = (): void => {
      if (token !== this.transitionToken || this.active !== incoming) return;
      const elapsed = performance.now() - startedAt;
      const progress = this.crossfadeMs <= 0 ? 1 : Math.min(1, elapsed / this.crossfadeMs);
      incoming.audio.volume = this.effectiveVolume(
        incoming.targetVolume,
        incoming.context,
      ) * progress;
      if (outgoing) outgoing.audio.volume = outgoingStart * (1 - progress);
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      if (outgoing) this.retire(outgoing);
    };
    requestAnimationFrame(step);
  }

  private effectiveVolume(trackVolume: number, context: MusicContext): number {
    const channelVolume = context === "countdown"
      ? this.countdownVolume
      : this.musicVolume;
    return this.muted
      ? 0
      : Math.max(0, Math.min(1, trackVolume * channelVolume));
  }

  private retire(track: ActiveTrack): void {
    track.audio.pause();
    track.audio.currentTime = 0;
    this.tracks.delete(track);
  }
}

export const musicManager = new MusicManager();
