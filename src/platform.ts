export type PlatformEnvironment = "local" | "crazygames" | "disabled" | "unavailable";

export interface PlatformUser {
  id: string;
  username: string;
  profilePictureUrl: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PlatformGameContext {
  seed: string;
  difficulty: string;
  night: number;
  phase: string;
  playerLevel: number;
  equipment: string;
}

export interface GamePlatform {
  readonly environment: PlatformEnvironment;
  readonly user: PlatformUser | null;
  readonly userAccountAvailable: boolean;
  readonly storage: KeyValueStore;
  readonly platformMuted: boolean;
  initialize(): Promise<void>;
  onUserChange(listener: (user: PlatformUser | null) => void): () => void;
  onMuteChange(listener: (muted: boolean) => void): () => void;
  showAuthPrompt(): Promise<PlatformUser | null>;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  reportProgress(percent: number): void;
  happytime(): void;
  setGameContext(context: PlatformGameContext): void;
  clearGameContext(): void;
}

interface CrazyGamesUser {
  __dangerousUserId: string;
  username: string;
  profilePictureUrl: string;
}

interface CrazyGamesSdk {
  init(): Promise<void>;
  environment: "local" | "crazygames" | "disabled";
  data: KeyValueStore;
  user: {
    isUserAccountAvailable: boolean;
    getUser(): Promise<CrazyGamesUser | null>;
    showAuthPrompt(): Promise<CrazyGamesUser>;
    addAuthListener(listener: (user: CrazyGamesUser) => void): void;
    removeAuthListener(listener: (user: CrazyGamesUser) => void): void;
  };
  game: {
    settings: { muteAudio?: boolean };
    addSettingsChangeListener(listener: (settings: { muteAudio?: boolean }) => void): void;
    removeSettingsChangeListener(listener: (settings: { muteAudio?: boolean }) => void): void;
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    reportGameCompletedPercentage(percent: number): void;
    happytime(): void;
    setGameContext(context: Record<string, string | number>): void;
    clearGameContext(): void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSdk };
  }
}

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function localFallback(): KeyValueStore {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // Sandboxed browsers may deny localStorage access.
  }
  return new MemoryStore();
}

function normalizeUser(user: CrazyGamesUser | null): PlatformUser | null {
  if (!user) return null;
  return {
    id: user.__dangerousUserId,
    username: user.username,
    profilePictureUrl: user.profilePictureUrl,
  };
}

export class CrazyGamesPlatformAdapter implements GamePlatform {
  environment: PlatformEnvironment = "unavailable";
  user: PlatformUser | null = null;
  userAccountAvailable = false;
  storage: KeyValueStore = localFallback();
  platformMuted = false;

  private sdk: CrazyGamesSdk | null = null;
  private initialized = false;
  private loading = false;
  private playing = false;
  private readonly userListeners = new Set<(user: PlatformUser | null) => void>();
  private readonly muteListeners = new Set<(muted: boolean) => void>();

  private readonly authListener = (user: CrazyGamesUser): void => {
    this.user = normalizeUser(user);
    for (const listener of this.userListeners) listener(this.user);
  };

  private readonly settingsListener = (settings: { muteAudio?: boolean }): void => {
    const muted = settings.muteAudio === true;
    if (muted === this.platformMuted) return;
    this.platformMuted = muted;
    for (const listener of this.muteListeners) listener(muted);
  };

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const sdk = await this.loadSdk();
      if (!sdk) return;
      await sdk.init();
      this.sdk = sdk;
      this.environment = sdk.environment;
      this.userAccountAvailable = sdk.environment !== "disabled"
        && sdk.user.isUserAccountAvailable === true;
      this.platformMuted = sdk.game.settings.muteAudio === true;
      sdk.game.addSettingsChangeListener(this.settingsListener);
      if (sdk.environment === "disabled") {
        this.storage = new MemoryStore();
        return;
      }
      this.storage = sdk.data;
      this.user = normalizeUser(await sdk.user.getUser());
      sdk.user.addAuthListener(this.authListener);
    } catch (error) {
      this.sdk = null;
      this.environment = "unavailable";
      this.storage = localFallback();
      console.warn("CrazyGames SDK unavailable; continuing with local persistence.", error);
    }
  }

  onUserChange(listener: (user: PlatformUser | null) => void): () => void {
    this.userListeners.add(listener);
    return () => this.userListeners.delete(listener);
  }

  onMuteChange(listener: (muted: boolean) => void): () => void {
    this.muteListeners.add(listener);
    return () => this.muteListeners.delete(listener);
  }

  async showAuthPrompt(): Promise<PlatformUser | null> {
    if (!this.sdk || !this.userAccountAvailable || this.environment === "disabled") return null;
    try {
      const user = normalizeUser(await this.sdk.user.showAuthPrompt());
      this.user = user;
      for (const listener of this.userListeners) listener(user);
      return user;
    } catch {
      return null;
    }
  }

  loadingStart(): void {
    if (this.loading || !this.canCallSdk()) return;
    this.loading = true;
    this.safeGameCall((game) => game.loadingStart());
  }

  loadingStop(): void {
    if (!this.loading) return;
    this.loading = false;
    this.safeGameCall((game) => game.loadingStop());
  }

  gameplayStart(): void {
    if (this.playing || !this.canCallSdk()) return;
    this.playing = true;
    this.safeGameCall((game) => game.gameplayStart());
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.safeGameCall((game) => game.gameplayStop());
  }

  reportProgress(percent: number): void {
    const progress = Math.max(0, Math.min(100, Math.round(percent)));
    this.safeGameCall((game) => game.reportGameCompletedPercentage(progress));
  }

  happytime(): void {
    this.safeGameCall((game) => game.happytime());
  }

  setGameContext(context: PlatformGameContext): void {
    this.safeGameCall((game) => game.setGameContext({ ...context }));
  }

  clearGameContext(): void {
    this.safeGameCall((game) => game.clearGameContext());
  }

  private canCallSdk(): boolean {
    return Boolean(this.sdk && this.environment !== "disabled");
  }

  private safeGameCall(call: (game: CrazyGamesSdk["game"]) => void): void {
    if (!this.sdk || this.environment === "disabled") return;
    try {
      call(this.sdk.game);
    } catch (error) {
      console.warn("CrazyGames game event was ignored.", error);
    }
  }

  private async loadSdk(): Promise<CrazyGamesSdk | null> {
    if (typeof window === "undefined") return null;
    if (window.CrazyGames?.SDK) return window.CrazyGames.SDK;
    await new Promise<void>((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>("script[data-crazygames-sdk]");
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => resolve(), { once: true });
        window.setTimeout(resolve, 4500);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
      script.async = true;
      script.dataset.crazygamesSdk = "v3";
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => resolve(), { once: true });
      document.head.append(script);
      window.setTimeout(resolve, 4500);
    });
    return window.CrazyGames?.SDK ?? null;
  }
}

export const platform = new CrazyGamesPlatformAdapter();
