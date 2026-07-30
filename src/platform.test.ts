// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CrazyGamesPlatformAdapter } from "./platform";

class TestStore {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function fakeSdk(environment: "local" | "crazygames" | "disabled", signedIn: boolean) {
  const data = new TestStore();
  const calls: string[] = [];
  let authListener: ((user: unknown) => void) | null = null;
  return {
    data,
    calls,
    sdk: {
      environment,
      init: async () => undefined,
      data,
      user: {
        isUserAccountAvailable: true,
        getUser: async () => signedIn ? {
          __dangerousUserId: "user-1",
          username: "FlagFriend",
          profilePictureUrl: "https://example.com/avatar.png",
        } : null,
        showAuthPrompt: async () => ({
          __dangerousUserId: "user-2",
          username: "NewDefender",
          profilePictureUrl: "https://example.com/avatar2.png",
        }),
        addAuthListener: (listener: (user: unknown) => void) => { authListener = listener; },
        removeAuthListener: () => undefined,
      },
      game: {
        settings: { muteAudio: false },
        addSettingsChangeListener: () => undefined,
        removeSettingsChangeListener: () => undefined,
        loadingStart: () => calls.push("loadingStart"),
        loadingStop: () => calls.push("loadingStop"),
        gameplayStart: () => calls.push("gameplayStart"),
        gameplayStop: () => calls.push("gameplayStop"),
        reportGameCompletedPercentage: (value: number) => calls.push(`progress:${value}`),
        happytime: () => calls.push("happytime"),
        setGameContext: () => calls.push("context"),
        clearGameContext: () => calls.push("clearContext"),
      },
    },
    emitAuth(user: unknown) { authListener?.(user); },
  };
}

describe("CrazyGames platform adapter", () => {
  it.each([
    ["local", false],
    ["crazygames", true],
  ] as const)("uses Data persistence for %s guests and users", async (environment, signedIn) => {
    const fake = fakeSdk(environment, signedIn);
    window.CrazyGames = { SDK: fake.sdk as never };
    const adapter = new CrazyGamesPlatformAdapter();
    await adapter.initialize();
    adapter.storage.setItem("profile", "saved");
    expect(fake.data.getItem("profile")).toBe("saved");
    expect(adapter.user?.username ?? null).toBe(signedIn ? "FlagFriend" : null);
  });

  it("keeps disabled environments playable and ignores lifecycle calls safely", async () => {
    const fake = fakeSdk("disabled", false);
    window.CrazyGames = { SDK: fake.sdk as never };
    const adapter = new CrazyGamesPlatformAdapter();
    await adapter.initialize();
    adapter.loadingStart();
    adapter.gameplayStart();
    adapter.reportProgress(100);
    adapter.happytime();
    expect(adapter.environment).toBe("disabled");
    expect(fake.calls).toEqual([]);
    expect(() => adapter.storage.setItem("profile", "session-only")).not.toThrow();
  });

  it("deduplicates lifecycle boundaries and clamps progress", async () => {
    const fake = fakeSdk("local", false);
    window.CrazyGames = { SDK: fake.sdk as never };
    const adapter = new CrazyGamesPlatformAdapter();
    await adapter.initialize();
    adapter.loadingStart();
    adapter.loadingStart();
    adapter.loadingStop();
    adapter.loadingStop();
    adapter.gameplayStart();
    adapter.gameplayStart();
    adapter.gameplayStop();
    adapter.reportProgress(999);
    expect(fake.calls).toEqual([
      "loadingStart",
      "loadingStop",
      "gameplayStart",
      "gameplayStop",
      "progress:100",
    ]);
  });
});
