import { describe, expect, it } from "vitest";
import { ENEMY_REGISTRY, ROSTER_TIERS, introducedRosterEnemies, rosterMilestones, selectEnemyRoster } from "./enemy-registry";

describe("deterministic enemy roster", () => {
  it("selects exactly one configured enemy per tier from a dedicated stable stream", () => {
    const first = selectEnemyRoster("fort-seed");
    const repeated = selectEnemyRoster("fort-seed");
    expect(first).toEqual(repeated);
    expect(Object.keys(first)).toHaveLength(ROSTER_TIERS.length);
    expect(first[1]).toBe("basic");
    expect(first[2]).toBe("runner");
    for (const tier of ROSTER_TIERS) {
      expect(ENEMY_REGISTRY[first[tier]].tier).toBe(tier);
      expect(ENEMY_REGISTRY[first[tier]].selectionWeight).toBeGreaterThan(0);
    }
  });

  it("uses the same roster for introductions and unlocked spawn candidates", () => {
    const roster = selectEnemyRoster("shared-roster");
    const milestones = rosterMilestones(roster);
    for (const tier of ROSTER_TIERS) {
      const selected = roster[tier];
      const introduction = ENEMY_REGISTRY[selected].introductionNight;
      expect(milestones.find((item) => item.night === introduction)?.enemy).toBe(selected);
      expect(introducedRosterEnemies(roster, introduction)).toContain(selected);
      const alternatives = Object.values(ENEMY_REGISTRY)
        .filter((item) => item.rosterEligible && item.tier === tier && item.id !== selected);
      for (const alternative of alternatives) {
        expect(introducedRosterEnemies(roster, 99)).not.toContain(alternative.id);
      }
    }
  });

  it("centralizes safety, behavior, assets, threat, XP, and weights for every enemy", () => {
    for (const definition of Object.values(ENEMY_REGISTRY)) {
      expect(definition.assets.portrait).toMatch(/^enemies\//);
      expect(definition.base.health).toBeGreaterThan(0);
      expect(definition.caps.perWave).toBeGreaterThan(0);
      expect(definition.caps.simultaneous).toBeGreaterThan(0);
      expect(definition.threat).toBeGreaterThanOrEqual(0);
      expect(definition.xp).toBeGreaterThanOrEqual(0);
      expect(definition.targeting.mode).toBeTruthy();
      expect(definition.attack.mode).toBeTruthy();
      expect(definition.death.mode).toBeTruthy();
      if (definition.render) {
        expect(definition.render.aspectRatio).toBeGreaterThan(0);
        expect(definition.render.height).toBeGreaterThan(0);
        expect(definition.render.width ?? definition.render.height).toBeGreaterThan(0);
      }
      if (definition.death.mode === "split") {
        expect(definition.death.childKind).toBeTruthy();
        expect(definition.death.splitCount).toBeGreaterThan(0);
        expect(definition.death.childHealth).toBeGreaterThan(0);
        expect(definition.death.childDamage).toBeGreaterThan(0);
        expect(definition.death.childSize).toBeGreaterThan(0);
        expect(definition.death.particleColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.death.particleCount).toBeGreaterThan(0);
        expect(definition.death.popupText).toBeTruthy();
      }
      if (definition.death.mode === "acid-burst") {
        expect(definition.death.burstInnerRadius).toBeGreaterThan(0);
        expect(definition.death.burstOuterRadius)
          .toBeGreaterThan(definition.death.burstInnerRadius ?? 0);
        expect(definition.death.burstTargets?.length).toBeGreaterThan(0);
        expect(definition.death.particleColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.death.particleCount).toBeGreaterThan(0);
        expect(definition.death.popupText).toBeTruthy();
        expect(definition.death.screenShake).toBeGreaterThanOrEqual(0);
      }
      if (definition.armor) {
        expect(definition.armor.health).toBeGreaterThan(0);
        expect(definition.armor.projectileResistance).toBeGreaterThanOrEqual(0);
        expect(definition.armor.projectileResistance).toBeLessThan(1);
        expect(definition.armor.barColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.armor.label).toBeTruthy();
        expect(definition.armor.brokenSprite).toMatch(/^enemies\//);
        expect(definition.armor.breakShardCount).toBeGreaterThan(0);
        expect(definition.armor.breakShardColors.length).toBeGreaterThan(0);
        for (const color of definition.armor.breakShardColors) {
          expect(color.value).toMatch(/^#[0-9a-f]{6}$/i);
          expect(color.weight).toBeGreaterThan(0);
        }
        expect(definition.armor.breakAudio).toBeTruthy();
        expect(definition.armor.breakShake).toBeGreaterThanOrEqual(0);
        if (definition.armor.breakStatusPulse) {
          const pulse = definition.armor.breakStatusPulse;
          expect(pulse.radius).toBeGreaterThan(0);
          expect(pulse.duration).toBeGreaterThan(0);
          expect(pulse.statusEffect.duration).toBeGreaterThan(0);
          expect(pulse.statusEffect.targets.length).toBeGreaterThan(0);
          expect(pulse.particleColor).toMatch(/^#[0-9a-f]{6}$/i);
          expect(pulse.particleCount).toBeGreaterThan(0);
          expect(pulse.popupText).toBeTruthy();
          expect(pulse.popupTextColor).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
      if (definition.summon) {
        expect(definition.summon.initialCooldown.minimum).toBeGreaterThanOrEqual(0);
        expect(definition.summon.initialCooldown.maximum)
          .toBeGreaterThanOrEqual(definition.summon.initialCooldown.minimum);
        expect(definition.summon.cooldown).toBeGreaterThan(0);
        expect(definition.summon.cappedRetryCooldown).toBeGreaterThan(0);
        expect(definition.summon.maximumLiving).toBeGreaterThan(0);
        expect(definition.summon.kinds?.length ?? 1).toBeGreaterThan(0);
        expect(definition.summon.particleColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.summon.particleCount).toBeGreaterThan(0);
        expect(definition.summon.popupText).toBeTruthy();
        expect(definition.audio.charge).toBeTruthy();
      }
      if (definition.leap) {
        expect(definition.leap.range).toBeGreaterThan(definition.base.radius * 2);
        expect(definition.leap.cooldown).toBeGreaterThanOrEqual(0);
        expect(definition.leap.duration).toBeGreaterThan(0);
        expect(definition.leap.arcHeight).toBeGreaterThan(0);
        expect(definition.leap.landingClearance).toBeGreaterThanOrEqual(0);
        expect(definition.leap.landingDistancePadding).toBeGreaterThanOrEqual(0);
        expect(definition.leap.landingAttempts).toBeGreaterThan(0);
        expect(definition.leap.failedRetryCooldown).toBeGreaterThan(0);
        expect(definition.leap.particleColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.leap.launchParticleCount).toBeGreaterThan(0);
        expect(definition.leap.landingParticleCount).toBeGreaterThan(0);
        expect(definition.leap.launchPopupText).toBeTruthy();
        expect(definition.leap.landingPopupText).toBeTruthy();
        expect(definition.audio.move).toBeTruthy();
      }
      if (definition.ram) {
        expect(definition.ram.targetRadius).toBeGreaterThan(0);
        expect(definition.ram.damage).toBeGreaterThan(0);
        expect(definition.ram.distance).toBeGreaterThan(0);
        expect(definition.ram.speed).toBeGreaterThan(0);
        expect(definition.ram.loadSeconds).toBeGreaterThan(0);
        expect(definition.ram.targetKinds.length).toBeGreaterThan(0);
        expect(definition.ram.telegraphColor).toBeTruthy();
        expect(definition.ram.telegraphLength).toBeGreaterThan(0);
        expect(definition.ram.healthBarWidth).toBeGreaterThan(0);
        expect(definition.ram.chargeBurst.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.ram.chargeBurst.count).toBeGreaterThan(0);
        expect(definition.ram.chargeBurst.popupText).toBeTruthy();
        expect(definition.ram.breachBurst.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.ram.breachBurst.count).toBeGreaterThan(0);
        expect(definition.ram.breachBurst.popupText).toBeTruthy();
      }
      if (definition.areaStrike) {
        expect(definition.areaStrike.appearance.shape).toBe("spike");
        for (const color of Object.entries(definition.areaStrike.appearance)
          .filter(([key]) => key !== "shape")
          .map(([, value]) => value)) {
          expect(color).toMatch(/^(?:#[0-9a-f]{6}|rgba?\()/i);
        }
        expect(definition.areaStrike.rngSeedKey).toBeTruthy();
        expect(definition.areaStrike.initialCooldown).toBeGreaterThanOrEqual(0);
        expect(definition.areaStrike.cooldown).toBeGreaterThan(0);
        expect(definition.areaStrike.activationRadius).toBeGreaterThan(0);
        expect(definition.areaStrike.randomStrikeCount).toBeGreaterThanOrEqual(0);
        expect(definition.areaStrike.placementMinimumRadius).toBeGreaterThanOrEqual(0);
        expect(definition.areaStrike.placementMaximumRadius)
          .toBeGreaterThanOrEqual(definition.areaStrike.placementMinimumRadius);
        expect(definition.areaStrike.placementAngleJitter).toBeGreaterThanOrEqual(0);
        expect(definition.areaStrike.strikeAngleJitter).toBeGreaterThanOrEqual(0);
        expect(definition.areaStrike.warningDuration).toBeGreaterThan(0);
        expect(definition.areaStrike.eruptionDuration).toBeGreaterThan(0);
        expect(definition.areaStrike.radius).toBeGreaterThan(0);
        expect(definition.areaStrike.playerDamage).toBeGreaterThan(0);
        expect(definition.areaStrike.structureDamage).toBeGreaterThan(0);
        expect(definition.areaStrike.damageSource).toBeTruthy();
        expect(definition.areaStrike.statusEffect?.duration ?? 1).toBeGreaterThan(0);
        expect(definition.areaStrike.impactColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.areaStrike.impactParticleCount).toBeGreaterThan(0);
        expect(definition.areaStrike.screenShake).toBeGreaterThanOrEqual(0);
        expect(definition.areaStrike.impactAudio).toBeTruthy();
      }
      if (definition.phaseSlam) {
        expect(definition.phaseSlam.triggerHealthRatio).toBeGreaterThan(0);
        expect(definition.phaseSlam.triggerHealthRatio).toBeLessThan(1);
        expect(definition.phaseSlam.chargeDuration).toBeGreaterThan(0);
        expect(ENEMY_REGISTRY[definition.phaseSlam.reinforcementKind]).toBeTruthy();
        expect(definition.phaseSlam.reinforcementCount).toBeGreaterThan(0);
        expect(definition.phaseSlam.radius).toBeGreaterThan(0);
        expect(definition.phaseSlam.playerDamage).toBeGreaterThan(0);
        expect(definition.phaseSlam.flagDamage).toBeGreaterThan(0);
        expect(definition.phaseSlam.structureDamage).toBeGreaterThan(0);
        expect(definition.phaseSlam.waveDuration).toBeGreaterThan(0);
        expect(definition.phaseSlam.particleColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.phaseSlam.particleCount).toBeGreaterThan(0);
        expect(definition.phaseSlam.popupText).toBeTruthy();
        expect(definition.phaseSlam.telegraphColor).toBeTruthy();
        expect(definition.phaseSlam.screenShake).toBeGreaterThanOrEqual(0);
        expect(definition.phaseSlam.impactAudio).toBeTruthy();
      }
    }
  });
});
