import {
  EQUIPMENT_ORDER,
  META_BALANCE,
  PERMANENT_UPGRADES,
  permanentUpgradeCost,
  type EquipmentKind,
  type EquipmentTier,
  type EyeStyle,
  type PermanentUpgradeId,
} from "./meta-balance";
import {
  createEquipmentInventory,
  equipmentUpgradePrice,
  nextEquipmentTier,
  type EquipmentInventory,
} from "./equipment";
import type { KeyValueStore } from "./platform";
import type { CoinSettlement, XpRewardBreakdown } from "./rewards";
import { isCampaignTierId, type CampaignTierId, type RunRecord } from "./types";
import {
  CAMPAIGN_TIERS,
  earnedCampaignMilestones,
  isCampaignTierUnlocked,
  type CampaignMilestone,
} from "./campaign";

export interface PendingRunSettlement {
  id: string;
  investment: number;
  startedAt: string;
}

export interface ProfileProgress {
  totalNightsSurvived: number;
  campaignWins: number;
  totalRuns: number;
  bestStructureScore: number;
}

export interface PlayerProfile {
  schemaVersion: number;
  lifetimeXp: number;
  spendableXp: number;
  playerLevel: number;
  coins: number;
  lastDailyRewardDate: string | null;
  dailyRewardStreak: number;
  dailyRewardEligibleDate: string | null;
  permanentUpgrades: Record<PermanentUpgradeId, number>;
  equipment: EquipmentInventory;
  playerColor: string;
  eyeStyle: EyeStyle;
  progress: ProfileProgress;
  campaign: {
    defeatedTierIds: CampaignTierId[];
    claimedRewardIds: string[];
  };
  pendingRunSettlement: PendingRunSettlement | null;
  completedSettlementIds: string[];
  recentRuns: RunRecord[];
}

export interface DailyRewardResult {
  granted: boolean;
  amount: number;
  date: string;
}

export interface DailyRewardStatus {
  available: boolean;
  day: number;
  amount: number;
  today: string;
  lastClaimDate: string | null;
  streak: number;
  reset: boolean;
}

export interface RunSettlementResult {
  id: string;
  xp: XpRewardBreakdown;
  coins: CoinSettlement;
  previousLifetimeXp: number;
  newLifetimeXp: number;
  previousSpendableXp: number;
  newSpendableXp: number;
  previousCoins: number;
  newCoins: number;
  previousLevel: number;
  newLevel: number;
  newlyUnlockedTierIds?: CampaignTierId[];
  grantedCampaignRewards?: CampaignMilestone[];
}

export interface RunSettlementProgress {
  nightsSurvived: number;
  victory: boolean;
  structureScore: number;
  campaignTierId?: CampaignTierId;
}

export interface PermanentUpgradePurchase {
  level: number;
  cost: number;
}

export interface EquipmentPurchase {
  tier: EquipmentTier;
  cost: number;
}

export function nextPermanentUpgradePurchase(
  profile: PlayerProfile,
  id: PermanentUpgradeId,
): PermanentUpgradePurchase | null {
  const level = profile.permanentUpgrades[id] + 1;
  if (level > META_BALANCE.permanentUpgrade.maximumLevel) return null;
  return { level, cost: permanentUpgradeCost(level) };
}

export function canAffordAnyPermanentUpgrade(profile: PlayerProfile): boolean {
  return PERMANENT_UPGRADES.some(({ id }) => {
    const purchase = nextPermanentUpgradePurchase(profile, id);
    return purchase !== null && purchase.cost <= profile.spendableXp;
  });
}

export function nextEquipmentPurchase(
  profile: PlayerProfile,
  kind: EquipmentKind,
): EquipmentPurchase | null {
  const tier = nextEquipmentTier(profile.equipment[kind].tier);
  const cost = equipmentUpgradePrice(profile.equipment[kind].tier);
  return tier && cost !== null ? { tier, cost } : null;
}

export function canAffordAnyEquipment(profile: PlayerProfile): boolean {
  return EQUIPMENT_ORDER.some((kind) => {
    const purchase = nextEquipmentPurchase(profile, kind);
    return purchase !== null
      && purchase.cost <= profile.coins - META_BALANCE.coinSafetyMinimum;
  });
}

function createPermanentUpgrades(): Record<PermanentUpgradeId, number> {
  return Object.fromEntries(
    PERMANENT_UPGRADES.map(({ id }) => [id, 0]),
  ) as Record<PermanentUpgradeId, number>;
}

export function createDefaultProfile(): PlayerProfile {
  return {
    schemaVersion: META_BALANCE.profileSchemaVersion,
    lifetimeXp: 0,
    spendableXp: 0,
    playerLevel: 1,
    coins: META_BALANCE.coinSafetyMinimum,
    lastDailyRewardDate: null,
    dailyRewardStreak: 0,
    dailyRewardEligibleDate: null,
    permanentUpgrades: createPermanentUpgrades(),
    equipment: createEquipmentInventory(),
    playerColor: META_BALANCE.customization.colors[0],
    eyeStyle: "round",
    progress: {
      totalNightsSurvived: 0,
      campaignWins: 0,
      totalRuns: 0,
      bestStructureScore: 0,
    },
    campaign: {
      defeatedTierIds: [],
      claimedRewardIds: [],
    },
    pendingRunSettlement: null,
    completedSettlementIds: [],
    recentRuns: [],
  };
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function xpForNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return META_BALANCE.levels.baseXp + (safeLevel - 1) * META_BALANCE.levels.growthXp;
}

export function lifetimeXpAtLevel(level: number): number {
  let total = 0;
  for (let current = 1; current < Math.max(1, Math.floor(level)); current += 1) {
    total += xpForNextLevel(current);
  }
  return total;
}

export function derivePlayerLevel(lifetimeXp: number): number {
  const xp = finiteNonNegative(lifetimeXp);
  let level = 1;
  let threshold = xpForNextLevel(level);
  let consumed = 0;
  while (xp >= consumed + threshold && level < 999) {
    consumed += threshold;
    level += 1;
    threshold = xpForNextLevel(level);
  }
  return level;
}

export function levelProgress(lifetimeXp: number): {
  level: number;
  current: number;
  required: number;
  ratio: number;
} {
  const level = derivePlayerLevel(lifetimeXp);
  const current = Math.max(0, finiteNonNegative(lifetimeXp) - lifetimeXpAtLevel(level));
  const required = xpForNextLevel(level);
  return { level, current, required, ratio: Math.min(1, current / required) };
}

export function crazyGamesCalendarDate(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new Error("Invalid daily reward date");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day"): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function calendarDayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

export function migrateProfile(raw: unknown): PlayerProfile {
  const defaults = createDefaultProfile();
  const source = recordObject(raw);
  const permanentSource = recordObject(source.permanentUpgrades);
  const equipmentSource = recordObject(source.equipment);
  const progressSource = recordObject(source.progress);
  const campaignSource = recordObject(source.campaign);
  const lifetimeXp = finiteNonNegative(source.lifetimeXp);
  const spendableXp = Math.min(lifetimeXp, finiteNonNegative(source.spendableXp, lifetimeXp));

  const permanentUpgrades = createPermanentUpgrades();
  for (const definition of PERMANENT_UPGRADES) {
    permanentUpgrades[definition.id] = Math.min(
      META_BALANCE.permanentUpgrade.maximumLevel,
      finiteNonNegative(permanentSource[definition.id]),
    );
  }
  permanentUpgrades.structureHealth = Math.min(
    META_BALANCE.permanentUpgrade.maximumLevel,
    Math.max(
      permanentUpgrades.structureHealth,
      finiteNonNegative(permanentSource.wallHealth),
    ),
  );

  const equipment = createEquipmentInventory();
  for (const kind of EQUIPMENT_ORDER) {
    const item = recordObject(equipmentSource[kind]);
    const tier = typeof item.tier === "string"
      && ["wood", "stone", "gold", "diamond"].includes(item.tier)
      ? item.tier as EquipmentTier
      : null;
    equipment[kind] = { tier, equipped: tier !== null && item.equipped !== false };
  }

  const pendingSource = recordObject(source.pendingRunSettlement);
  const pendingRunSettlement = typeof pendingSource.id === "string"
    && typeof pendingSource.startedAt === "string"
    ? {
        id: pendingSource.id.slice(0, 96),
        investment: Math.min(
          META_BALANCE.investment.maximum,
          finiteNonNegative(pendingSource.investment),
        ),
        startedAt: pendingSource.startedAt,
      }
    : null;

  const playerColor = typeof source.playerColor === "string"
    && META_BALANCE.customization.colors.includes(source.playerColor as typeof META_BALANCE.customization.colors[number])
    ? source.playerColor
    : defaults.playerColor;
  const eyeStyle = typeof source.eyeStyle === "string"
    && META_BALANCE.customization.eyeStyles.includes(source.eyeStyle as EyeStyle)
    ? source.eyeStyle as EyeStyle
    : defaults.eyeStyle;
  const recentRuns = Array.isArray(source.recentRuns)
    ? source.recentRuns.filter((record): record is RunRecord =>
      Boolean(record && typeof record === "object"
        && typeof (record as RunRecord).seed === "string"
        && typeof (record as RunRecord).date === "string")).slice(0, 10)
      .map((record) => ({
        ...record,
        difficulty: (record.difficulty as string) === "impossible"
          ? "extreme" as const
          : record.difficulty,
      }))
    : [];
  const knownRecentNights = recentRuns.reduce(
    (total, record) => total + finiteNonNegative(record.nightsSurvived),
    0,
  );
  const migratedTotalNights = Math.max(
    finiteNonNegative(progressSource.totalNightsSurvived),
    knownRecentNights,
    finiteNonNegative(progressSource.highestNight),
  );
  const defeatedTierIds: CampaignTierId[] = Array.isArray(campaignSource.defeatedTierIds)
    ? [...new Set(campaignSource.defeatedTierIds.filter(isCampaignTierId))]
    : finiteNonNegative(progressSource.campaignWins) > 0 ? ["forest" as const] : [];
  const claimedRewardIds = Array.isArray(campaignSource.claimedRewardIds)
    ? [...new Set(campaignSource.claimedRewardIds.filter(
      (id): id is string => typeof id === "string",
    ))].slice(-200)
    : [];

  return {
    schemaVersion: META_BALANCE.profileSchemaVersion,
    lifetimeXp,
    spendableXp,
    playerLevel: derivePlayerLevel(lifetimeXp),
    coins: Math.max(META_BALANCE.coinSafetyMinimum, finiteNonNegative(source.coins)),
    lastDailyRewardDate: typeof source.lastDailyRewardDate === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(source.lastDailyRewardDate)
      ? source.lastDailyRewardDate
      : null,
    dailyRewardStreak: Math.min(
      META_BALANCE.dailyRewards.repeatingDay,
      finiteNonNegative(source.dailyRewardStreak,
        typeof source.lastDailyRewardDate === "string" ? 1 : 0),
    ),
    dailyRewardEligibleDate: typeof source.dailyRewardEligibleDate === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(source.dailyRewardEligibleDate)
      ? source.dailyRewardEligibleDate
      : null,
    permanentUpgrades,
    equipment,
    playerColor,
    eyeStyle,
    progress: {
      totalNightsSurvived: migratedTotalNights,
      campaignWins: finiteNonNegative(progressSource.campaignWins),
      totalRuns: finiteNonNegative(progressSource.totalRuns),
      bestStructureScore: finiteNonNegative(progressSource.bestStructureScore),
    },
    campaign: { defeatedTierIds, claimedRewardIds },
    pendingRunSettlement,
    completedSettlementIds: Array.isArray(source.completedSettlementIds)
      ? [...new Set(source.completedSettlementIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.slice(0, 96)))].slice(-100)
      : [],
    recentRuns,
  };
}

export function parseProfile(serialized: string | null): PlayerProfile {
  if (!serialized) return createDefaultProfile();
  try {
    return migrateProfile(JSON.parse(serialized));
  } catch {
    return createDefaultProfile();
  }
}

export class ProfileManager {
  profile: PlayerProfile;
  private readonly listeners = new Set<(profile: PlayerProfile) => void>();

  constructor(private storage: KeyValueStore) {
    this.profile = parseProfile(storage.getItem(META_BALANCE.profileStorageKey));
    if (this.profile.recentRuns.length === 0) {
      try {
        const legacy = storage.getItem(META_BALANCE.legacyRecordsKey);
        if (legacy) {
          const records = JSON.parse(legacy) as unknown;
          if (Array.isArray(records)) {
            this.profile.recentRuns = records.slice(0, 10) as RunRecord[];
            const knownLegacyNights = this.profile.recentRuns.reduce(
              (total, record) => total + finiteNonNegative(record.nightsSurvived),
              0,
            );
            this.profile.progress.totalNightsSurvived = Math.max(
              this.profile.progress.totalNightsSurvived,
              knownLegacyNights,
            );
          }
        }
      } catch {
        // A corrupt legacy record list must not affect the profile.
      }
    }
    this.refreshDailyRewardEligibility();
    this.save();
  }

  setStorage(storage: KeyValueStore): void {
    this.storage = storage;
    this.reload();
  }

  reload(): void {
    this.profile = parseProfile(this.storage.getItem(META_BALANCE.profileStorageKey));
    this.refreshDailyRewardEligibility();
    this.save();
    this.emit();
  }

  subscribe(listener: (profile: PlayerProfile) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getDailyRewardStatus(now = new Date()): DailyRewardStatus {
    const today = crazyGamesCalendarDate(now);
    const lastClaimDate = this.profile.lastDailyRewardDate;
    const difference = lastClaimDate
      ? calendarDayNumber(today) - calendarDayNumber(lastClaimDate)
      : Number.POSITIVE_INFINITY;
    const available = difference > 0;
    const reset = Boolean(lastClaimDate && difference > 1);
    const day = available
      ? reset || !lastClaimDate
        ? 1
        : Math.min(META_BALANCE.dailyRewards.repeatingDay, this.profile.dailyRewardStreak + 1)
      : Math.max(1, this.profile.dailyRewardStreak);
    const amount = META_BALANCE.dailyRewards.coinsByDay[day - 1]
      ?? META_BALANCE.dailyRewards.coinsByDay.at(-1)
      ?? 0;
    return {
      available,
      day,
      amount,
      today,
      lastClaimDate,
      streak: this.profile.dailyRewardStreak,
      reset,
    };
  }

  refreshDailyRewardEligibility(now = new Date()): DailyRewardStatus {
    const status = this.getDailyRewardStatus(now);
    this.profile.dailyRewardEligibleDate = status.available ? status.today : null;
    return status;
  }

  claimDailyReward(now = new Date()): DailyRewardResult {
    const status = this.getDailyRewardStatus(now);
    if (!status.available) return { granted: false, amount: 0, date: status.today };
    this.profile.lastDailyRewardDate = status.today;
    this.profile.dailyRewardStreak = status.day;
    this.profile.dailyRewardEligibleDate = null;
    this.profile.coins += status.amount;
    this.commit();
    return { granted: true, amount: status.amount, date: status.today };
  }

  grantCoins(amount: number): number {
    const granted = Math.max(0, Math.floor(amount));
    if (granted === 0) return 0;
    this.profile.coins += granted;
    this.commit();
    return granted;
  }

  beginRunSettlement(id: string, requestedInvestment: number, startedAt = new Date()): boolean {
    const runId = id.trim().slice(0, 96);
    if (!runId || this.profile.completedSettlementIds.includes(runId)) return false;
    if (this.profile.pendingRunSettlement?.id === runId) return true;
    if (this.profile.pendingRunSettlement) {
      this.completeSettlementId(this.profile.pendingRunSettlement.id);
      this.profile.pendingRunSettlement = null;
      this.profile.coins = Math.max(META_BALANCE.coinSafetyMinimum, this.profile.coins);
    }
    const investment = Math.min(
      META_BALANCE.investment.maximum,
      Math.max(0, Math.floor(requestedInvestment)),
      this.profile.coins,
    );
    this.profile.coins -= investment;
    this.profile.pendingRunSettlement = {
      id: runId,
      investment,
      startedAt: startedAt.toISOString(),
    };
    this.commit();
    return true;
  }

  settleRun(
    id: string,
    xp: XpRewardBreakdown,
    coins: CoinSettlement,
    progress: RunSettlementProgress,
  ): RunSettlementResult | null {
    if (this.profile.completedSettlementIds.includes(id)) return null;
    const pending = this.profile.pendingRunSettlement;
    if (!pending || pending.id !== id || pending.investment !== coins.investment) return null;

    const previousLifetimeXp = this.profile.lifetimeXp;
    const previousSpendableXp = this.profile.spendableXp;
    const previousCoins = this.profile.coins;
    const previousLevel = derivePlayerLevel(previousLifetimeXp);
    const previouslyUnlocked = new Set(CAMPAIGN_TIERS.filter((tier) =>
      isCampaignTierUnlocked(tier, {
        level: previousLevel,
        defeatedTierIds: this.profile.campaign.defeatedTierIds,
      })).map((tier) => tier.id));
    this.profile.lifetimeXp += xp.total;
    this.profile.spendableXp += xp.total;
    this.profile.coins += coins.totalReturn;
    this.profile.coins = Math.max(META_BALANCE.coinSafetyMinimum, this.profile.coins);
    this.profile.playerLevel = derivePlayerLevel(this.profile.lifetimeXp);
    this.profile.progress.totalNightsSurvived += Math.max(
      0,
      Math.floor(progress.nightsSurvived),
    );
    this.profile.progress.campaignWins += progress.victory ? 1 : 0;
    this.profile.progress.totalRuns += 1;
    this.profile.progress.bestStructureScore = Math.max(
      this.profile.progress.bestStructureScore,
      progress.structureScore,
    );
    if (progress.victory && progress.campaignTierId
      && !this.profile.campaign.defeatedTierIds.includes(progress.campaignTierId)) {
      this.profile.campaign.defeatedTierIds.push(progress.campaignTierId);
    }
    const grantedCampaignRewards = progress.campaignTierId
      ? earnedCampaignMilestones(
          this.profile.playerLevel,
          this.profile.campaign.claimedRewardIds,
        )
      : [];
    for (const milestone of grantedCampaignRewards) {
      if (milestone.reward.kind === "coins") this.profile.coins += milestone.reward.amount;
      this.profile.campaign.claimedRewardIds.push(milestone.id);
    }
    this.profile.campaign.claimedRewardIds = [...new Set(this.profile.campaign.claimedRewardIds)].slice(-200);
    const newlyUnlockedTierIds = CAMPAIGN_TIERS.filter((tier) =>
      !previouslyUnlocked.has(tier.id)
      && isCampaignTierUnlocked(tier, {
        level: this.profile.playerLevel,
        defeatedTierIds: this.profile.campaign.defeatedTierIds,
      })).map((tier) => tier.id);
    this.profile.pendingRunSettlement = null;
    this.completeSettlementId(id);
    this.commit();

    return {
      id,
      xp,
      coins,
      previousLifetimeXp,
      newLifetimeXp: this.profile.lifetimeXp,
      previousSpendableXp,
      newSpendableXp: this.profile.spendableXp,
      previousCoins,
      newCoins: this.profile.coins,
      previousLevel,
      newLevel: this.profile.playerLevel,
      newlyUnlockedTierIds,
      grantedCampaignRewards,
    };
  }

  buyPermanentUpgrade(id: PermanentUpgradeId): boolean {
    const purchase = nextPermanentUpgradePurchase(this.profile, id);
    if (!purchase || this.profile.spendableXp < purchase.cost) return false;
    this.profile.spendableXp -= purchase.cost;
    this.profile.permanentUpgrades[id] += 1;
    this.commit();
    return true;
  }

  buyEquipment(kind: EquipmentKind): boolean {
    const item = this.profile.equipment[kind];
    const purchase = nextEquipmentPurchase(this.profile, kind);
    if (!purchase
      || this.profile.coins - purchase.cost < META_BALANCE.coinSafetyMinimum) return false;
    this.profile.coins -= purchase.cost;
    item.tier = purchase.tier;
    item.equipped = true;
    this.commit();
    return true;
  }

  toggleEquipment(kind: EquipmentKind): boolean {
    const item = this.profile.equipment[kind];
    if (!item.tier) return false;
    item.equipped = !item.equipped;
    this.commit();
    return true;
  }

  saveCustomization(color: string, eyeStyle: EyeStyle): boolean {
    if (!META_BALANCE.customization.colors.includes(color as typeof META_BALANCE.customization.colors[number])
      || !META_BALANCE.customization.eyeStyles.includes(eyeStyle)) return false;
    this.profile.playerColor = color;
    this.profile.eyeStyle = eyeStyle;
    this.commit();
    return true;
  }

  saveRunRecords(records: readonly RunRecord[]): void {
    this.profile.recentRuns = [...records].slice(0, 10);
    this.commit();
  }

  private completeSettlementId(id: string): void {
    this.profile.completedSettlementIds = [
      ...this.profile.completedSettlementIds.filter((value) => value !== id),
      id,
    ].slice(-100);
  }

  private commit(): void {
    this.profile.playerLevel = derivePlayerLevel(this.profile.lifetimeXp);
    this.save();
    this.emit();
  }

  private save(): void {
    try {
      this.storage.setItem(META_BALANCE.profileStorageKey, JSON.stringify(this.profile));
    } catch (error) {
      console.warn("Profile save failed; progress remains available for this session.", error);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.profile);
  }
}
