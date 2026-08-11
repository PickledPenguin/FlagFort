import { browserStorage } from "./storage";
import type { Vec2 } from "./types";

export const SOUND_IDS = [
  "ui-hover",
  "ui-click",
  "ui-confirm",
  "ui-cancel",
  "ui-invalid",
  "card-select",
  "card-mutation",
  "card-reroll",
  "upgrade-unlock",
  "countdown-tick",
  "countdown-final-tick",
  "countdown-zero",
  "night-start",
  "dawn-start",
  "wave-cleared",
  "player-footstep-grass",
  "player-punch-swing",
  "player-punch-impact",
  "sword-swing",
  "sword-hit",
  "player-hurt",
  "player-heal",
  "player-death",
  "bow-fire",
  "arrow-impact",
  "wood-hit",
  "stone-hit",
  "gold-hit",
  "diamond-hit",
  "resource-depleted",
  "resource-collected",
  "structure-place",
  "structure-upgrade",
  "structure-repair",
  "structure-recycle",
  "structure-damaged",
  "structure-destroyed",
  "turret-fire",
  "harvester-swing",
  "portal-ambient",
  "portal-spawn",
  "portal-destroyed",
  "zombie-attack",
  "zombie-death",
  "zombie-hurt",
  "breaker-smash",
  "ice-shatter",
  "jumper-jump",
  "summoner-cast",
  "gremlin-sabotage",
  "splitter-split",
  "popper-burst",
  "archer-bow-fire",
  "archer-arrow-impact",
  "acidslinger-fire",
  "acidslinger-impact",
  "rammer-charge",
  "rammer-rush",
  "rammer-impact",
  "flag-damaged",
  "boss-roar",
  "boss-acid-spit",
  "boss-death",
] as const;

export type SoundId = typeof SOUND_IDS[number];
type SoundBus = "effects" | "ambience";
export type SoundPositioning = "centered" | "spatial";
type ConcurrencyGroup =
  | "ui-hover"
  | "zombie-voices"
  | "zombie-attacks"
  | "resource-impacts"
  | "structure-impacts"
  | "turrets"
  | "harvesters";

interface SoundConfig {
  bus: SoundBus;
  volume: number;
  positioning: SoundPositioning;
  cooldown?: number;
  concurrencyGroup?: ConcurrencyGroup;
  variation?: { pitch: number; volume: number };
}

const effect = (
  volume: number,
  options: Partial<Omit<SoundConfig, "bus" | "volume">> = {},
): SoundConfig => ({ bus: "effects", volume, positioning: "centered", ...options });

export const SOUND_CONFIG: Record<SoundId, SoundConfig> = {
  "ui-hover": effect(0.18, { cooldown: 0.055, concurrencyGroup: "ui-hover" }),
  "ui-click": effect(0.32, { cooldown: 0.025 }),
  "ui-confirm": effect(0.55),
  "ui-cancel": effect(0.42),
  "ui-invalid": effect(0.62, { cooldown: 0.12 }),
  "card-select": effect(0.58),
  "card-mutation": effect(0.58),
  "card-reroll": effect(0.52),
  "upgrade-unlock": effect(0.66),
  "countdown-tick": effect(0.48),
  "countdown-final-tick": effect(0.72),
  "countdown-zero": effect(0.88),
  "night-start": effect(0.82),
  "dawn-start": effect(0.72),
  "wave-cleared": effect(0.72),
  "player-footstep-grass": effect(0.27, {
    cooldown: 0.18,
    positioning: "centered",
    variation: { pitch: 0.035, volume: 0.08 },
  }),
  "player-punch-swing": effect(0.15, {
    cooldown: 0.07,
    positioning: "centered",
    variation: { pitch: 0.025, volume: 0.06 },
  }),
  "player-punch-impact": effect(0.62, {
    cooldown: 0.055,
    positioning: "spatial",
    variation: { pitch: 0.025, volume: 0.06 },
  }),
  "sword-swing": effect(0.48, {
    cooldown: 0.1,
    positioning: "centered",
  }),
  "sword-hit": effect(0.7, {
    cooldown: 0.055,
    positioning: "spatial",
  }),
  "player-hurt": effect(0.92, { cooldown: 0.09, positioning: "centered" }),
  "player-heal": effect(0.55, { cooldown: 0.8, positioning: "centered" }),
  "player-death": effect(1, { positioning: "centered" }),
  "bow-fire": effect(0.56, { cooldown: 0.08, positioning: "centered" }),
  "arrow-impact": effect(0.5, { cooldown: 0.04, positioning: "spatial" }),
  "wood-hit": effect(0.48, {
    cooldown: 0.045,
    concurrencyGroup: "resource-impacts",
    positioning: "spatial",
    variation: { pitch: 0.035, volume: 0.08 },
  }),
  "stone-hit": effect(0.5, {
    cooldown: 0.045,
    concurrencyGroup: "resource-impacts",
    positioning: "spatial",
    variation: { pitch: 0.035, volume: 0.08 },
  }),
  "gold-hit": effect(0.48, {
    cooldown: 0.045,
    concurrencyGroup: "resource-impacts",
    positioning: "spatial",
    variation: { pitch: 0.035, volume: 0.08 },
  }),
  "diamond-hit": effect(0.48, {
    cooldown: 0.045,
    concurrencyGroup: "resource-impacts",
    positioning: "spatial",
    variation: { pitch: 0.035, volume: 0.08 },
  }),
  "resource-depleted": effect(0.58, { cooldown: 0.08, positioning: "spatial" }),
  "resource-collected": effect(0.4, { cooldown: 0.06, positioning: "spatial" }),
  "structure-place": effect(0.82, { positioning: "centered" }),
  "structure-upgrade": effect(0.82, { positioning: "centered" }),
  "structure-repair": effect(0.52, { positioning: "centered" }),
  "structure-recycle": effect(0.56, { positioning: "centered" }),
  "structure-damaged": effect(0.55, {
    cooldown: 0.13,
    concurrencyGroup: "structure-impacts",
    positioning: "spatial",
  }),
  "structure-destroyed": effect(0.78, { cooldown: 0.09, positioning: "spatial" }),
  "turret-fire": effect(0.42, {
    cooldown: 0.035,
    concurrencyGroup: "turrets",
    positioning: "spatial",
    variation: { pitch: 0.025, volume: 0.05 },
  }),
  "harvester-swing": effect(0.32, {
    cooldown: 0.2,
    concurrencyGroup: "harvesters",
    positioning: "spatial",
    variation: { pitch: 0.025, volume: 0.06 },
  }),
  "portal-ambient": { bus: "ambience", volume: 0.3, positioning: "spatial" },
  "portal-spawn": effect(0.66, { cooldown: 0.12, positioning: "spatial" }),
  "portal-destroyed": effect(0.78, { cooldown: 0.08, positioning: "spatial" }),
  "zombie-attack": effect(0.5, {
    cooldown: 0.035,
    concurrencyGroup: "zombie-attacks",
    positioning: "spatial",
    variation: { pitch: 0.04, volume: 0.08 },
  }),
  "zombie-death": effect(0.52, {
    cooldown: 0.045,
    concurrencyGroup: "zombie-voices",
    positioning: "spatial",
    variation: { pitch: 0.25, volume: 0.08 },
  }),
  "zombie-hurt": effect(0.42, {
    cooldown: 0.045,
    concurrencyGroup: "zombie-voices",
    positioning: "spatial",
  }),
  "breaker-smash": effect(0.78, {
    cooldown: 0.1,
    concurrencyGroup: "zombie-attacks",
    positioning: "spatial",
  }),
  "ice-shatter": effect(0.92, {
    cooldown: 0.08,
    positioning: "spatial",
    variation: { pitch: 0.025, volume: 0.04 },
  }),
  "jumper-jump": effect(0.62, { cooldown: 0.08, positioning: "spatial" }),
  "summoner-cast": effect(0.7, { cooldown: 0.12, positioning: "spatial" }),
  "gremlin-sabotage": effect(0.66, { cooldown: 0.09, positioning: "spatial" }),
  "splitter-split": effect(0.7, { cooldown: 0.08, positioning: "spatial" }),
  "popper-burst": effect(0.78, { cooldown: 0.1, positioning: "spatial" }),
  "archer-bow-fire": effect(0.52, { cooldown: 0.08, positioning: "spatial" }),
  "archer-arrow-impact": effect(0.48, { cooldown: 0.04, positioning: "spatial" }),
  "acidslinger-fire": effect(0.62, { cooldown: 0.1, positioning: "spatial" }),
  "acidslinger-impact": effect(0.58, { cooldown: 0.08, positioning: "spatial" }),
  "rammer-charge": effect(0.82, { cooldown: 0.2, positioning: "spatial" }),
  "rammer-rush": effect(0.68, { cooldown: 0.2, positioning: "spatial" }),
  "rammer-impact": effect(0.92, { cooldown: 0.1, positioning: "spatial" }),
  "flag-damaged": effect(1.18, { cooldown: 0.45 }),
  "boss-roar": effect(1.02, { positioning: "spatial" }),
  "boss-acid-spit": effect(0.9, { cooldown: 0.12, positioning: "spatial" }),
  "boss-death": effect(1.08, { positioning: "spatial" }),
};

export const AUDIO_CONCURRENCY_LIMITS: Record<ConcurrencyGroup, number> = {
  "zombie-voices": 5,
  "zombie-attacks": 6,
  "resource-impacts": 4,
  "structure-impacts": 4,
  turrets: 5,
  "ui-hover": 1,
  harvesters: 3,
};

export interface AudioCueDetail {
  cue: SoundId;
  position?: Vec2;
  delayMs?: number;
  volumeMultiplier?: number;
}

export interface AudioSpatialStateDetail {
  listener: Vec2;
  portals: Array<Vec2 & { id: number }>;
  active: boolean;
}

export interface AudioSettings {
  master: number;
  effects: number;
  ambience: number;
  music: number;
  countdown: number;
  muted: boolean;
}

export type AudioVolumeChannel = Exclude<keyof AudioSettings, "muted">;

export const AUDIO_SPATIAL_BALANCE = {
  maximumAudibleDistance: 1250,
  referenceDistance: 130,
  rolloffFactor: 1.35,
  nearbySourceShare: 0.6,
  fullSeparationDistanceRatio: 0.8,
  smoothingTimeConstant: 0.025,
} as const;

export interface SpatialStereoInput {
  horizontalDirection: number;
  sourceDistance: number;
  maximumAudibleDistance: number;
  positioning: SoundPositioning;
}

export interface SpatialStereoResult {
  pan: number;
  leftGain: number;
  rightGain: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));

/**
 * Converts desired speaker share to the calibrated StereoPanner equal-power pan.
 * A 60/40 share is therefore not treated as a raw pan value of 0.2.
 */
export function calculateSpatialStereo(input: SpatialStereoInput): SpatialStereoResult {
  const direction = clamp(input.horizontalDirection, -1, 1);
  const maximum = Math.max(0, Number.isFinite(input.maximumAudibleDistance)
    ? input.maximumAudibleDistance
    : 0);
  if (input.positioning === "centered" || maximum === 0 || direction === 0) {
    return { pan: 0, leftGain: Math.SQRT1_2, rightGain: Math.SQRT1_2 };
  }
  const normalizedDistance = clamp(input.sourceDistance / maximum, 0, 1);
  const separationProgress = clamp(
    normalizedDistance / AUDIO_SPATIAL_BALANCE.fullSeparationDistanceRatio,
    0,
    1,
  );
  const sourceShare = AUDIO_SPATIAL_BALANCE.nearbySourceShare
    + (1 - AUDIO_SPATIAL_BALANCE.nearbySourceShare) * separationProgress;
  const panMagnitude = sourceShare >= 1
    ? 1
    : 4 * Math.atan(sourceShare / (1 - sourceShare)) / Math.PI - 1;
  const pan = clamp(Math.sign(direction) * Math.abs(direction) * panMagnitude, -1, 1);
  const angle = (pan + 1) * Math.PI / 4;
  return {
    pan,
    leftGain: Math.cos(angle),
    rightGain: Math.sin(angle),
  };
}

export function calculateDistanceAttenuation(sourceDistance: number): number {
  const distance = clamp(
    sourceDistance,
    AUDIO_SPATIAL_BALANCE.referenceDistance,
    AUDIO_SPATIAL_BALANCE.maximumAudibleDistance,
  );
  const denominator = AUDIO_SPATIAL_BALANCE.referenceDistance
    + AUDIO_SPATIAL_BALANCE.rolloffFactor
      * (distance - AUDIO_SPATIAL_BALANCE.referenceDistance);
  return clamp(AUDIO_SPATIAL_BALANCE.referenceDistance / denominator, 0, 1);
}

export function selectAudiblePortals(
  state: AudioSpatialStateDetail,
): Array<Vec2 & { id: number }> {
  if (!state.active) return [];
  return [...state.portals]
    .map((portal) => ({
      portal,
      distance: Math.hypot(portal.x - state.listener.x, portal.y - state.listener.y),
    }))
    .filter((entry) => entry.distance <= AUDIO_SPATIAL_BALANCE.maximumAudibleDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2)
    .map((entry) => entry.portal);
}

interface ActivePlayback {
  source: AudioBufferSourceNode;
  group?: ConcurrencyGroup;
}

interface ActiveLoop {
  source: AudioBufferSourceNode;
  panner: StereoPannerNode;
  gain: GainNode;
  distanceGain: GainNode;
}

const AUDIO_SETTINGS_KEY = "flagfall-audio-settings";
const DEFAULT_SETTINGS: AudioSettings = {
  master: 0.82,
  effects: 0.86,
  ambience: 0.56,
  music: 0.58,
  countdown: 0.35,
  muted: false,
};

const clampVolume = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function emitAudioCue(detail: AudioCueDetail): void {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  window.dispatchEvent(new CustomEvent<AudioCueDetail>("flagfall-audio-cue", { detail }));
}

export function emitAudioSpatialState(detail: AudioSpatialStateDetail): void {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  window.dispatchEvent(new CustomEvent<AudioSpatialStateDetail>("flagfall-audio-spatial-state", { detail }));
}

export class AudioManager {
  private initialized = false;
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private settings = this.loadSettings();
  private platformMuted = false;
  private encoded = new Map<SoundId, Promise<ArrayBuffer | null>>();
  private buffers = new Map<SoundId, Promise<AudioBuffer | null>>();
  private cooldowns = new Map<SoundId, number>();
  private activeByGroup = new Map<ConcurrencyGroup, Set<ActivePlayback>>();
  private loops = new Map<string, ActiveLoop>();
  private pending: AudioCueDetail[] = [];
  private listener: Vec2 = { x: 0, y: 0 };
  private latestSpatialState: AudioSpatialStateDetail | null = null;
  private variationState = 0x6d2b79f5;
  private debugElement: HTMLOutputElement | null = null;
  private decodedCount = 0;
  private lastPlayed: SoundId | "none" = "none";

  initialize(): void {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;
    window.addEventListener("flagfall-audio-cue", this.onCue as EventListener);
    window.addEventListener("flagfall-audio-spatial-state", this.onSpatialState as EventListener);
    window.addEventListener("pointerdown", this.unlockFromInteraction, { capture: true, passive: true });
    window.addEventListener("keydown", this.unlockFromInteraction, { capture: true });
    window.addEventListener("touchstart", this.unlockFromInteraction, { capture: true, passive: true });
    window.addEventListener("pagehide", this.cleanup);
    if (new URLSearchParams(window.location.search).has("audioDebug")) {
      this.debugElement = document.createElement("output");
      this.debugElement.className = "audio-debug";
      this.debugElement.setAttribute("aria-label", "Audio diagnostics");
      document.body.append(this.debugElement);
      this.updateDebug();
    }
    this.preload();
  }

  preload(): void {
    if (typeof fetch === "undefined") return;
    for (const id of SOUND_IDS) {
      if (this.encoded.has(id)) continue;
      this.encoded.set(id, fetch(`./audio/${id}.ogg`)
        .then((response) => response.ok ? response.arrayBuffer() : null)
        .catch(() => null));
    }
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setVolume(
    channel: AudioVolumeChannel,
    value: number,
  ): void {
    this.settings[channel] = clampVolume(value);
    this.applySettings();
    this.saveSettings();
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.applySettings();
    this.saveSettings();
    this.updateDebug();
  }

  setPlatformMuted(muted: boolean): void {
    this.platformMuted = muted;
    this.applySettings();
    this.updateDebug();
  }

  isEffectivelyMuted(): boolean {
    return this.settings.muted || this.platformMuted;
  }

  toggleMuted(): void {
    this.setMuted(!this.settings.muted);
  }

  play(cue: SoundId, options: Omit<AudioCueDetail, "cue"> = {}): void {
    if (!this.initialized) return;
    const detail: AudioCueDetail = { cue, ...options };
    if (detail.delayMs && detail.delayMs > 0) {
      window.setTimeout(() => this.play(cue, { ...options, delayMs: 0 }), detail.delayMs);
      return;
    }
    if (!this.context || this.context.state !== "running") {
      if (this.pending.length < 16) this.pending.push(detail);
      void this.unlock();
      return;
    }
    void this.playReady(detail);
  }

  stopAllLoops(): void {
    for (const loop of this.loops.values()) {
      try {
        loop.source.stop();
      } catch {
        // A loop that ended while the scene changed is already stopped.
      }
    }
    this.loops.clear();
    this.updateDebug();
  }

  private readonly onCue = (event: CustomEvent<AudioCueDetail>): void => {
    this.play(event.detail.cue, event.detail);
  };

  private readonly onSpatialState = (event: CustomEvent<AudioSpatialStateDetail>): void => {
    this.latestSpatialState = event.detail;
    this.listener = event.detail.listener;
    if (!event.detail.active) {
      this.stopAllLoops();
      this.updateDebug();
      return;
    }
    this.syncPortalAmbience(event.detail);
  };

  private readonly unlockFromInteraction = (): void => {
    void this.unlock();
  };

  private readonly cleanup = (): void => {
    this.stopAllLoops();
    this.pending = [];
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
  };

  private async unlock(): Promise<void> {
    if (!this.initialized || typeof window === "undefined") return;
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      try {
        this.context = new AudioContextConstructor();
        this.masterGain = this.context.createGain();
        this.effectsGain = this.context.createGain();
        this.ambienceGain = this.context.createGain();
        this.effectsGain.connect(this.masterGain);
        this.ambienceGain.connect(this.masterGain);
        this.masterGain.connect(this.context.destination);
        this.applySettings();
        this.updateDebug();
        for (const id of SOUND_IDS) void this.getBuffer(id);
      } catch {
        this.context = null;
        return;
      }
    }
    if (this.context.state === "suspended") {
      try {
        await this.context.resume();
      } catch {
        return;
      }
    }
    this.updateDebug();
    const queued = this.pending.splice(0);
    for (const detail of queued) void this.playReady(detail);
    if (this.latestSpatialState?.active) this.syncPortalAmbience(this.latestSpatialState);
  }

  private async getBuffer(id: SoundId): Promise<AudioBuffer | null> {
    if (!this.context) return null;
    const cached = this.buffers.get(id);
    if (cached) return cached;
    const encoded = this.encoded.get(id);
    if (!encoded) return null;
    const context = this.context;
    const decoded = encoded.then(async (data) => {
      if (!data) return null;
      try {
        const buffer = await context.decodeAudioData(data.slice(0));
        this.decodedCount += 1;
        this.updateDebug();
        return buffer;
      } catch {
        return null;
      }
    });
    this.buffers.set(id, decoded);
    return decoded;
  }

  private async playReady(detail: AudioCueDetail): Promise<void> {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const config = SOUND_CONFIG[detail.cue];
    const now = context.currentTime;
    const availableAt = this.cooldowns.get(detail.cue) ?? 0;
    if (now < availableAt) return;
    if (config.cooldown) this.cooldowns.set(detail.cue, now + config.cooldown);
    if (config.concurrencyGroup && !this.hasConcurrency(config.concurrencyGroup)) return;
    const buffer = await this.getBuffer(detail.cue);
    if (!buffer || !this.context || this.context !== context) return;
    if (config.concurrencyGroup && !this.hasConcurrency(config.concurrencyGroup)) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    const variation = config.variation;
    const volumeVariation = variation ? 1 + (this.nextVariation() * 2 - 1) * variation.volume : 1;
    const pitchVariation = variation ? 1 + (this.nextVariation() * 2 - 1) * variation.pitch : 1;
    source.playbackRate.value = pitchVariation;
    gain.gain.value = config.volume
      * volumeVariation
      * (detail.volumeMultiplier ?? 1);
    source.connect(gain);
    const bus = config.bus === "ambience" ? this.ambienceGain : this.effectsGain;
    if (!bus) return;
    if (config.positioning === "spatial" && detail.position) {
      const { panner, distanceGain } = this.createSpatialNodes(detail.position);
      gain.connect(distanceGain);
      distanceGain.connect(panner);
      panner.connect(bus);
    } else {
      gain.connect(bus);
    }
    const playback: ActivePlayback = { source, group: config.concurrencyGroup };
    if (config.concurrencyGroup) {
      const active = this.activeByGroup.get(config.concurrencyGroup) ?? new Set();
      active.add(playback);
      this.activeByGroup.set(config.concurrencyGroup, active);
    }
    source.addEventListener("ended", () => this.removePlayback(playback), { once: true });
    source.start();
    this.lastPlayed = detail.cue;
    this.updateDebug();
  }

  private hasConcurrency(group: ConcurrencyGroup): boolean {
    const active = this.activeByGroup.get(group);
    return !active || active.size < AUDIO_CONCURRENCY_LIMITS[group];
  }

  private removePlayback(playback: ActivePlayback): void {
    if (!playback.group) return;
    const active = this.activeByGroup.get(playback.group);
    active?.delete(playback);
    if (active?.size === 0) this.activeByGroup.delete(playback.group);
  }

  private createSpatialNodes(position: Vec2): {
    panner: StereoPannerNode;
    distanceGain: GainNode;
  } {
    if (!this.context) throw new Error("Audio context is unavailable");
    const panner = this.context.createStereoPanner();
    const distanceGain = this.context.createGain();
    this.updateSpatialNodes(panner, distanceGain, position, false);
    return { panner, distanceGain };
  }

  private updateSpatialNodes(
    panner: StereoPannerNode,
    distanceGain: GainNode,
    position: Vec2,
    smooth: boolean,
  ): void {
    if (!this.context) return;
    const horizontal = position.x - this.listener.x;
    const vertical = position.y - this.listener.y;
    const sourceDistance = Math.hypot(horizontal, vertical);
    const stereo = calculateSpatialStereo({
      horizontalDirection: sourceDistance > 0 ? horizontal / sourceDistance : 0,
      sourceDistance,
      maximumAudibleDistance: AUDIO_SPATIAL_BALANCE.maximumAudibleDistance,
      positioning: "spatial",
    });
    const attenuation = calculateDistanceAttenuation(sourceDistance);
    if (smooth) {
      panner.pan.setTargetAtTime(
        stereo.pan,
        this.context.currentTime,
        AUDIO_SPATIAL_BALANCE.smoothingTimeConstant,
      );
      distanceGain.gain.setTargetAtTime(
        attenuation,
        this.context.currentTime,
        AUDIO_SPATIAL_BALANCE.smoothingTimeConstant,
      );
    } else {
      panner.pan.value = stereo.pan;
      distanceGain.gain.value = attenuation;
    }
  }

  private syncPortalAmbience(state: AudioSpatialStateDetail): void {
    const nearest = selectAudiblePortals(state);
    const desiredKeys = new Set(nearest.map((portal) => `portal:${portal.id}`));
    for (const [key, loop] of this.loops) {
      if (desiredKeys.has(key)) continue;
      try {
        loop.source.stop();
      } catch {
        // The source already ended.
      }
      this.loops.delete(key);
      this.updateDebug();
    }
    for (const portal of nearest) {
      const key = `portal:${portal.id}`;
      const current = this.loops.get(key);
      if (current) {
        this.updateSpatialNodes(current.panner, current.distanceGain, portal, true);
      } else {
        void this.startPortalLoop(key, portal);
      }
    }
  }

  private async startPortalLoop(key: string, position: Vec2): Promise<void> {
    const context = this.context;
    if (!context || this.loops.has(key) || !this.ambienceGain) return;
    const buffer = await this.getBuffer("portal-ambient");
    if (!buffer || !this.context || this.context !== context || this.loops.has(key)) return;
    const spatialState = this.latestSpatialState;
    const desiredKeys = spatialState
      ? selectAudiblePortals(spatialState).map((portal) => `portal:${portal.id}`)
      : [];
    if (!desiredKeys.includes(key)) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const { panner, distanceGain } = this.createSpatialNodes(position);
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = SOUND_CONFIG["portal-ambient"].volume;
    source.connect(gain);
    gain.connect(distanceGain);
    distanceGain.connect(panner);
    panner.connect(this.ambienceGain);
    const loop: ActiveLoop = { source, panner, gain, distanceGain };
    this.loops.set(key, loop);
    source.addEventListener("ended", () => {
      if (this.loops.get(key) === loop) this.loops.delete(key);
    }, { once: true });
    source.start();
    this.lastPlayed = "portal-ambient";
    this.updateDebug();
  }

  private applySettings(): void {
    if (!this.context || !this.masterGain || !this.effectsGain || !this.ambienceGain) return;
    const now = this.context.currentTime;
    this.masterGain.gain.setTargetAtTime(this.isEffectivelyMuted() ? 0 : this.settings.master, now, 0.015);
    this.effectsGain.gain.setTargetAtTime(this.settings.effects, now, 0.015);
    this.ambienceGain.gain.setTargetAtTime(this.settings.ambience, now, 0.015);
  }

  private nextVariation(): number {
    this.variationState = (Math.imul(this.variationState ^ (this.variationState >>> 15), 1 | this.variationState)
      + 0x6d2b79f5) | 0;
    const value = Math.imul(this.variationState ^ (this.variationState >>> 7), 61 | this.variationState);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  private loadSettings(): AudioSettings {
    try {
      const raw = browserStorage()?.getItem(AUDIO_SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        master: clampVolume(parsed.master ?? DEFAULT_SETTINGS.master),
        effects: clampVolume(parsed.effects ?? DEFAULT_SETTINGS.effects),
        ambience: clampVolume(parsed.ambience ?? DEFAULT_SETTINGS.ambience),
        music: clampVolume(parsed.music ?? DEFAULT_SETTINGS.music),
        countdown: clampVolume(parsed.countdown ?? DEFAULT_SETTINGS.countdown),
        muted: parsed.muted === true,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings(): void {
    try {
      browserStorage()?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Audio preferences remain usable for this session when storage is unavailable.
    }
  }

  private updateDebug(): void {
    if (!this.debugElement) return;
    const state = this.context?.state ?? "locked";
    this.debugElement.value = [
      `AUDIO ${state}`,
      `${this.decodedCount}/${SOUND_IDS.length} decoded`,
      `last ${this.lastPlayed}`,
      `loops ${this.loops.size}`,
      this.isEffectivelyMuted() ? (this.platformMuted ? "platform-muted" : "muted") : "audible",
    ].join(" · ");
  }
}

export const audioManager = new AudioManager();
