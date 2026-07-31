import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(projectRoot, "Audio");
const outputRoot = join(projectRoot, "public", "audio");
const manifestPath = join(outputRoot, "audio-attribution.json");
const sourceMapPath = join(projectRoot, "AUDIO_SOURCE_MAP.md");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";

const KENNEY_CC0 = {
  creator: "Kenney",
  license: "CC0 1.0",
};

const SONNISS_ROYALTY_FREE = {
  license: "Sonniss GDC Game Audio Bundle Part 9 royalty-free license",
};

const source = (relativePath) => join(sourceRoot, relativePath);

export const selections = [
  {
    id: "ui-hover",
    source: source("kenney_ui-audio/Audio/rollover2.ogg"),
    ...KENNEY_CC0,
    pack: "UI SFX Set",
    events: ["First entry into an enabled interactive hover state"],
  },
  {
    id: "ui-click",
    source: source("kenney_ui-audio/Audio/click2.ogg"),
    ...KENNEY_CC0,
    pack: "UI SFX Set",
    events: ["Ordinary toolbar, menu, and icon-button activation"],
  },
  {
    id: "ui-confirm",
    source: source("kenney_interface-sounds/Audio/confirmation_001.ogg"),
    ...KENNEY_CC0,
    pack: "Interface Sounds",
    events: ["Accepted confirmation actions"],
  },
  {
    id: "ui-cancel",
    source: source("kenney_interface-sounds/Audio/back_003.ogg"),
    ...KENNEY_CC0,
    pack: "Interface Sounds",
    events: ["Cancelled modals, back actions, and closing panels"],
  },
  {
    id: "ui-invalid",
    source: source("kenney_interface-sounds/Audio/error_004.ogg"),
    ...KENNEY_CC0,
    pack: "Interface Sounds",
    events: ["Unavailable actions, invalid placement, insufficient resources, and disabled controls"],
  },
  {
    id: "card-select",
    source: source("kenney_interface-sounds/Audio/select_004.ogg"),
    ...KENNEY_CC0,
    pack: "Interface Sounds",
    events: ["Benefit or unlock pair selected"],
  },
  {
    id: "card-mutation",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Cinematic Sound Design - System & UI Feedback Elements/Interface Sci-Fi Ping Down.wav"),
    creator: "Cinematic Sound Design",
    pack: "System & UI Feedback Elements",
    ...SONNISS_ROYALTY_FREE,
    events: ["Attached mutation applies"],
  },
  {
    id: "card-reroll",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Fantasy Game 2 - Sound Kit for Enchanted Realms/GAMEMisc_Source Card Tarot Deck Generic Neutral Dry Heavy Shuffle 01_ESM_FG2.wav"),
    creator: "Epic Stock Media",
    pack: "Fantasy Game 2 - Sound Kit for Enchanted Realms",
    ...SONNISS_ROYALTY_FREE,
    events: ["Reroll begins"],
  },
  {
    id: "upgrade-unlock",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Anime Game/DSGNStngr_Power Up Bright Positive Successful Light Saturation Crash Shimmer 05_ESM_AG.wav"),
    creator: "Epic Stock Media",
    pack: "Anime Game",
    ...SONNISS_ROYALTY_FREE,
    events: ["Upgrade or unlock successfully applies"],
  },
  {
    id: "countdown-tick",
    source: source("kenney_interface-sounds/Audio/tick_004.ogg"),
    ...KENNEY_CC0,
    pack: "Interface Sounds",
    events: ["Ordinary countdown seconds from ten through four"],
  },
  {
    id: "countdown-final-tick",
    source: source("kenney_impact-sounds/Audio/impactBell_heavy_004.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["Final urgent countdown seconds from three through one"],
  },
  {
    id: "countdown-zero",
    source: source("kenney_impact-sounds/Audio/impactBell_heavy_003.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["Phase timer reaches zero"],
  },
  {
    id: "night-start",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Cinematic Sound Design - Ultra Transitions & Impacts/Transition Braam Slow Dark Creepy.wav"),
    creator: "Cinematic Sound Design",
    pack: "Ultra Transitions & Impacts",
    ...SONNISS_ROYALTY_FREE,
    events: ["Transition into night"],
  },
  {
    id: "dawn-start",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Cinematic Sound Design - Hybrid Game & UI Elements/Game Entry Happy Short.wav"),
    creator: "Cinematic Sound Design",
    pack: "Hybrid Game & UI Elements",
    ...SONNISS_ROYALTY_FREE,
    events: ["Transition into day"],
  },
  {
    id: "wave-cleared",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Cinematic Sound Design - User Interface/Interface Plucks Happy.wav"),
    creator: "Cinematic Sound Design",
    pack: "User Interface",
    ...SONNISS_ROYALTY_FREE,
    events: ["Scheduled wave is eliminated early"],
  },
  {
    id: "player-footstep-grass",
    source: source("kenney_impact-sounds/Audio/footstep_grass_004.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["Player movement across forest ground at a controlled interval"],
  },
  {
    id: "player-punch-swing",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Cinematic Sound Design - Ultra Transitions & Impacts/Woosh Sweep Slide Infographics Basic.wav"),
    creator: "Cinematic Sound Design",
    pack: "Ultra Transitions & Impacts",
    ...SONNISS_ROYALTY_FREE,
    events: ["Alternating-hand punch begins"],
  },
  {
    id: "player-punch-impact",
    source: source("kenney_impact-sounds/Audio/impactPunch_medium_003.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["Punch hits a zombie or portal"],
  },
  {
    id: "sword-swing",
    source: source("kenney_rpg-audio/Audio/drawKnife1.ogg"),
    ...KENNEY_CC0,
    pack: "RPG Audio",
    events: ["Equipped player sword swing begins"],
  },
  {
    id: "sword-hit",
    source: source("kenney_rpg-audio/Audio/chop.ogg"),
    ...KENNEY_CC0,
    pack: "RPG Audio",
    events: ["Equipped player sword damages one or more valid targets in a sweep"],
  },
  {
    id: "player-hurt",
    source: source("kenney_impact-sounds/Audio/impactSoft_medium_001.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["Player receives actual damage"],
  },
  {
    id: "player-heal",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/CB_Sounddesign - Applicable Sounds - Organic UI and Building Games SFX/UIMisc_Kalimba 3 Up_CB Sounddesign_APPlicable Sounds.wav"),
    creator: "CB_Sounddesign",
    pack: "Applicable Sounds - Organic UI and Building Games SFX",
    ...SONNISS_ROYALTY_FREE,
    events: ["Player begins healing near the flag"],
  },
  {
    id: "player-death",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Cinematic Sound Design - Cartoon & Animation Vol 2/Cartoon Transition Bass Down.wav"),
    creator: "Cinematic Sound Design",
    pack: "Cartoon & Animation Vol 2",
    ...SONNISS_ROYALTY_FREE,
    events: ["Player dies"],
  },
  {
    id: "bow-fire",
    source: source("kenney_rpg-audio/Audio/knifeSlice2.ogg"),
    ...KENNEY_CC0,
    pack: "RPG Audio",
    events: ["Player arrow is successfully fired"],
  },
  {
    id: "arrow-impact",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Cinematic Sound Design - Cartoon Bloopers/Arrow Hit Rattle.wav"),
    creator: "Cinematic Sound Design",
    pack: "Cartoon Bloopers",
    ...SONNISS_ROYALTY_FREE,
    events: ["Player arrow hits a valid target or world obstacle"],
  },
  {
    id: "wood-hit",
    source: source("kenney_impact-sounds/Audio/impactWood_medium_002.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["Player or harvester successfully strikes a tree"],
  },
  {
    id: "stone-hit",
    source: source("kenney_impact-sounds/Audio/impactMining_002.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["Player or harvester successfully strikes stone"],
  },
  {
    id: "gold-hit",
    source: source("kenney_impact-sounds/Audio/impactMetal_medium_001.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["Player or harvester successfully strikes gold"],
  },
  {
    id: "diamond-hit",
    source: source("kenney_impact-sounds/Audio/impactGlass_light_003.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["Player or harvester successfully strikes diamond"],
  },
  {
    id: "resource-collected",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Cinematic Sound Design - UI Interaction Elements/Ting Coins.wav"),
    creator: "Cinematic Sound Design",
    pack: "UI Interaction Elements",
    ...SONNISS_ROYALTY_FREE,
    events: ["A resource amount is successfully added"],
  },
  {
    id: "resource-depleted",
    source: source("kenney_impact-sounds/Audio/impactSoft_heavy_002.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["A resource node becomes depleted"],
  },
  {
    id: "structure-place",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Tower Defense Game/ROBTMvmt_Tower Deploy Hitech Robot Motor Dark Thump Servo Whine 04_ESM_TDG.wav"),
    creator: "Epic Stock Media",
    pack: "Tower Defense Game",
    ...SONNISS_ROYALTY_FREE,
    events: ["A structure is successfully placed"],
  },
  {
    id: "structure-upgrade",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/CB_Sounddesign - Applicable Sounds - Organic UI and Building Games SFX/GAMEMisc_Magic Creation 23_CB Sounddesign_APPlicable Sounds.wav"),
    creator: "CB_Sounddesign",
    pack: "Applicable Sounds - Organic UI and Building Games SFX",
    ...SONNISS_ROYALTY_FREE,
    events: ["An existing structure is upgraded"],
  },
  {
    id: "structure-repair",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - HD Lock And Mechanism Sound Design Kit/MACHMech_Mechanism Counting Machine Interact Loose Container Short 01_ESM_HDLM.wav"),
    creator: "Epic Stock Media",
    pack: "HD Lock And Mechanism Sound Design Kit",
    ...SONNISS_ROYALTY_FREE,
    events: ["A damaged structure is repaired"],
  },
  {
    id: "structure-recycle",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Board Game - Sound Set Kit for Tabletop and Digital Games/GAMEBoard_Event Board Reset Organic Multiple Pieces Wood Small 02_ESM_BG.wav"),
    creator: "Epic Stock Media",
    pack: "Board Game - Sound Set Kit for Tabletop and Digital Games",
    ...SONNISS_ROYALTY_FREE,
    events: ["A structure is recycled"],
  },
  {
    id: "structure-damaged",
    source: source("kenney_impact-sounds/Audio/impactPlate_medium_002.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["A structure receives meaningful damage"],
  },
  {
    id: "structure-destroyed",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Alexander Kopeikin - 100 kHz Designed Ice/ice, block of ice crushed, heavy-015.wav"),
    creator: "Alexander Kopeikin",
    pack: "100 kHz Designed Ice",
    ...SONNISS_ROYALTY_FREE,
    events: ["A structure reaches zero health"],
  },
  {
    id: "turret-fire",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/David Dumais Audio - Melee Weapons Sound Effects Pack 2/WEAPWhip_WHIP Snap Crack 05_DDUMAIS_MWP2.wav"),
    creator: "David Dumais Audio",
    pack: "Melee Weapons Sound Effects Pack 2",
    ...SONNISS_ROYALTY_FREE,
    events: ["A turret successfully fires"],
  },
  {
    id: "harvester-swing",
    source: source("kenney_rpg-audio/Audio/drawKnife2.ogg"),
    ...KENNEY_CC0,
    pack: "RPG Audio",
    events: ["A harvester begins a new arm revolution"],
  },
  {
    id: "portal-ambient",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Strange Game Ambient Loops 3/DSGNSynth_Dark Loop Mystic Forest Tonal Steady Synth_ESM_SGA3.wav"),
    creator: "Epic Stock Media",
    pack: "Strange Game Ambient Loops 3",
    ...SONNISS_ROYALTY_FREE,
    ambience: true,
    events: ["Spatial loop near either of the two nearest active portals"],
  },
  {
    id: "portal-spawn",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Anime Game/DSGNMisc_Misc Monster Tentacle Modulated Creature Shadow Abstract Swept Wobble Lfo 02_ESM_AG.wav"),
    creator: "Epic Stock Media",
    pack: "Anime Game",
    ...SONNISS_ROYALTY_FREE,
    events: ["Portals appear or release a major spawn"],
  },
  {
    id: "portal-destroyed",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Tower Defense Game/ICEBrk_Skill Freeze Whoosh Break Impact Layered Movement Shatter 03_ESM_TDG.wav"),
    creator: "Epic Stock Media",
    pack: "Tower Defense Game",
    ...SONNISS_ROYALTY_FREE,
    events: ["A portal is destroyed before relocating"],
  },
  {
    id: "zombie-attack",
    source: source("Sonniss.com-GDC2026-GameAudioBundle5of5/SoundBits - Vox Bestiae - Source Elements/CREAHmn_Violent Humanoid Creature Exhale Short 4_SNDBTS_VB-SE.wav"),
    creator: "SoundBits",
    pack: "Vox Bestiae - Source Elements",
    ...SONNISS_ROYALTY_FREE,
    events: ["A standard zombie attack reaches its active strike"],
  },
  {
    id: "zombie-hurt",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Humanoid Creatures Vol 4 - Monstrous and Undead Creature Vocalization Sound Sets/HMNBrth_Construction Kit Male Screeching Breath Inhale Weak Squeal 05_ESM_HC4.wav"),
    creator: "Epic Stock Media",
    pack: "Humanoid Creatures Vol 4",
    ...SONNISS_ROYALTY_FREE,
    events: ["A zombie receives damage"],
  },
  {
    id: "zombie-death",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Humanoid Creatures Vol 4 - Monstrous and Undead Creature Vocalization Sound Sets/VOXReac_Construction Kit Male Flutter Death Vocal Stuttered Long 05_ESM_HC4.wav"),
    creator: "Epic Stock Media",
    pack: "Humanoid Creatures Vol 4",
    ...SONNISS_ROYALTY_FREE,
    maxDuration: 3,
    events: ["A standard zombie dies"],
  },
  {
    id: "breaker-smash",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Halloween Game - Haunted House and Horror Audio Scare Kit/GORESplt_Gore Designed Transient Heavy Impact Smash 01_ESM_HALG.wav"),
    creator: "Epic Stock Media",
    pack: "Halloween Game - Haunted House and Horror Audio Scare Kit",
    ...SONNISS_ROYALTY_FREE,
    events: ["A breaker performs its heavy attack"],
  },
  {
    id: "jumper-jump",
    source: source("Sonniss.com-GDC2026-GameAudioBundle1of5/344 Audio - Air Designed/AEROJet_Blast Off Clean_344 Audio_Air Designed.wav"),
    creator: "344 Audio",
    pack: "Air Designed",
    ...SONNISS_ROYALTY_FREE,
    maxDuration: 2.5,
    events: ["A jumper launches"],
  },
  {
    id: "summoner-cast",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Fantasy Game 2 - Sound Kit for Enchanted Realms/MAGAngl_Magic Light Spell Enchantment Potion Effect Tonal Bright 03_ESM_FG2.wav"),
    creator: "Epic Stock Media",
    pack: "Fantasy Game 2 - Sound Kit for Enchanted Realms",
    ...SONNISS_ROYALTY_FREE,
    maxDuration: 2.75,
    events: ["A summoner successfully summons zombies"],
  },
  {
    id: "gremlin-sabotage",
    source: source("kenney_impact-sounds/Audio/impactMetal_heavy_003.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["A Gremlin sabotages a harvester or blocking structure"],
  },
  {
    id: "splitter-split",
    source: source("kenney_impact-sounds/Audio/impactGlass_heavy_004.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["A Splitter divides after combat death"],
  },
  {
    id: "popper-burst",
    source: source("kenney_impact-sounds/Audio/impactSoft_heavy_004.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["A Popper releases its acid burst"],
  },
  {
    id: "archer-bow-fire",
    source: source("kenney_rpg-audio/Audio/knifeSlice.ogg"),
    ...KENNEY_CC0,
    pack: "RPG Audio",
    events: ["An Archer releases a charged arrow"],
  },
  {
    id: "archer-arrow-impact",
    source: source("kenney_impact-sounds/Audio/impactTin_medium_004.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["An Archer arrow hits its intended target"],
  },
  {
    id: "acidslinger-fire",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Tower Defense Game/WOODImpt_Hit Blood Spill Splat Wood Impact Light Hit Squelch Small Thump 03_ESM_TDG.wav"),
    creator: "Epic Stock Media",
    pack: "Tower Defense Game",
    ...SONNISS_ROYALTY_FREE,
    events: ["An Acidslinger launches a piercing acid shot"],
  },
  {
    id: "acidslinger-impact",
    source: source("Sonniss.com-GDC2026-GameAudioBundle1of5/344 Audio - Elemental Palette Designed Vol. 1/WATRMisc_Water, Liquid Impact, Bubble, Sci Fi, Hit 04_344 Audio_Elemental Palette Designed Vol 1.wav"),
    creator: "344 Audio",
    pack: "Elemental Palette Designed Vol. 1",
    ...SONNISS_ROYALTY_FREE,
    maxDuration: 2,
    events: ["An Acidslinger projectile hits one or more targets"],
  },
  {
    id: "rammer-charge",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Humanoid Creatures Vol 4 - Monstrous and Undead Creature Vocalization Sound Sets/CREAHmn_Designed Orc Male Attack Long Heavy Hit Charged Up 03_ESM_HC4.wav"),
    creator: "Epic Stock Media",
    pack: "Humanoid Creatures Vol 4",
    ...SONNISS_ROYALTY_FREE,
    maxDuration: 2.5,
    events: ["A Rammer finishes loading its charge"],
  },
  {
    id: "rammer-rush",
    source: source("Sonniss.com-GDC2026-GameAudioBundle1of5/344 Audio - Elemental Palette Designed Vol. 1/WINDDsgn_Wind, Rush, Whoosh, Long x5 01_344 Audio_Elemental Palette Designed Vol 1.wav"),
    creator: "344 Audio",
    pack: "Elemental Palette Designed Vol. 1",
    ...SONNISS_ROYALTY_FREE,
    maxDuration: 1.5,
    events: ["A Rammer rushes forward"],
  },
  {
    id: "rammer-impact",
    source: source("kenney_impact-sounds/Audio/impactPlate_heavy_004.ogg"),
    ...KENNEY_CC0,
    pack: "Impact Sounds",
    events: ["A Rammer collides with a defensive structure"],
  },
  {
    id: "flag-damaged",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Cinematic Sound Design - System & UI Feedback Elements/Interface Deny Low Fat Dark.wav"),
    creator: "Cinematic Sound Design",
    pack: "System & UI Feedback Elements",
    ...SONNISS_ROYALTY_FREE,
    events: ["The flag receives actual damage"],
  },
  {
    id: "boss-roar",
    source: source("Sonniss.com-GDC2026-GameAudioBundle1of5/344 Audio - Dinosaurs Vol. 2/ANMLRept_Large Herbivore Roar 01_344 Audio_Dinosaurs Vol 2.wav"),
    creator: "344 Audio",
    pack: "Dinosaurs Vol. 2",
    ...SONNISS_ROYALTY_FREE,
    maxDuration: 4,
    events: ["The boss enters its major phase"],
  },
  {
    id: "boss-acid-spit",
    source: source("Sonniss.com-GDC2026-GameAudioBundle1of5/344 Audio - Barbershop Vol. 1/OBJMisc_Spray Bottle, Spray 1_344 Audio_Barbershop Vol 1.wav"),
    creator: "344 Audio",
    pack: "Barbershop Vol. 1",
    ...SONNISS_ROYALTY_FREE,
    events: ["The boss launches an acid projectile"],
  },
  {
    id: "boss-death",
    source: source("Sonniss.com-GDC2026-GameAudioBundle2of5/Epic Stock Media - Anime Game/EXPLDsgn_Explosion Small Blast Enemy Death Crunchy Boom Cartoon Noisy Crash Impact Delay 03_ESM_AG.wav"),
    creator: "Epic Stock Media",
    pack: "Anime Game",
    ...SONNISS_ROYALTY_FREE,
    events: ["The boss dies"],
  },
];

function run(binary, args) {
  return execFileSync(binary, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function probe(path) {
  const data = JSON.parse(run(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_name,sample_rate,channels",
    "-of", "json",
    path,
  ]));
  const stream = data.streams.find((item) => item.sample_rate);
  return {
    codec: stream?.codec_name ?? "unknown",
    sampleRate: Number(stream?.sample_rate ?? 0),
    channels: Number(stream?.channels ?? 0),
    duration: Number(data.format?.duration ?? 0),
    bytes: Number(data.format?.size ?? 0),
  };
}

function loudness(path) {
  const result = spawnSync(ffmpeg, [
    "-hide_banner", "-nostats", "-i", path,
    "-af", "ebur128=peak=true",
    "-f", "null", "-",
  ], { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  const stderr = String(result.stderr ?? "");
  const integrated = [...stderr.matchAll(/I:\s*(-?[\d.]+) LUFS/g)].at(-1);
  const peak = [...stderr.matchAll(/Peak:\s*(-?[\d.]+) dBFS/g)].at(-1);
  const volumeResult = spawnSync(ffmpeg, [
    "-hide_banner", "-nostats", "-i", path,
    "-af", "volumedetect",
    "-f", "null", "-",
  ], { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  const volumeStderr = String(volumeResult.stderr ?? "");
  const mean = volumeStderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const maximum = volumeStderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  return {
    integratedLufs: integrated ? Number(integrated[1]) : null,
    truePeakDbfs: peak ? Number(peak[1]) : null,
    meanDbfs: mean ? Number(mean[1]) : null,
    maxDbfs: maximum ? Number(maximum[1]) : null,
  };
}

function conversionGain(selection, sourceLoudness) {
  const target = selection.ambience ? -27 : -18;
  const integrated = sourceLoudness.integratedLufs;
  const useMean = integrated === null || integrated <= -60;
  const measured = useMean ? sourceLoudness.meanDbfs : integrated;
  const adjustedTarget = useMean ? (selection.ambience ? -30 : -24) : target;
  if (measured === null || !Number.isFinite(measured)) return 0;
  const loudnessGain = Math.max(-12, Math.min(12, adjustedTarget - measured));
  const peak = sourceLoudness.truePeakDbfs;
  const peakLimitedGain = peak === null ? loudnessGain : Math.min(loudnessGain, -1.25 - peak);
  return Math.round(peakLimitedGain * 10) / 10;
}

function build(selection) {
  const destination = join(outputRoot, `${selection.id}.ogg`);
  const sourceTechnical = probe(selection.source);
  const sourceLoudness = loudness(selection.source);
  const gainDb = conversionGain(selection, sourceLoudness);
  const filters = [];
  if (!selection.ambience) {
    filters.push(
      "silenceremove=start_periods=1:start_silence=0.005:start_threshold=-55dB:"
      + "stop_periods=-1:stop_silence=0.08:stop_threshold=-55dB",
    );
  }
  if (gainDb !== 0) filters.push(`volume=${gainDb}dB`);
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", selection.source];
  if (selection.maxDuration) args.push("-t", String(selection.maxDuration));
  if (filters.length) args.push("-af", filters.join(","));
  args.push(
    "-map_metadata", "-1",
    "-vn",
    "-ar", "48000",
    "-ac", "2",
    "-c:a", "libopus",
    "-b:a", selection.ambience ? "64k" : "80k",
    "-vbr", "on",
    destination,
  );
  run(ffmpeg, args);
  const outputTechnical = probe(destination);
  return {
    canonicalFilename: `${selection.id}.ogg`,
    originalSourcePath: selection.source,
    originalFilename: selection.source.split("/").at(-1),
    creator: selection.creator,
    pack: selection.pack,
    license: selection.license,
    sourceSha256: sha256(selection.source),
    modifications: [
      selection.ambience ? "Preserved loop boundaries" : "Trimmed leading and trailing digital silence below -55 dB",
      selection.maxDuration ? `Limited to the clean first ${selection.maxDuration} seconds` : null,
      `${gainDb >= 0 ? "+" : ""}${gainDb} dB fixed gain normalization without dynamic-range compression`,
      "Resampled to 48 kHz stereo",
      `Encoded as OGG Opus at ${selection.ambience ? 64 : 80} kbps variable bitrate`,
    ].filter(Boolean),
    gameplayEvents: selection.events,
    sourceTechnical: { ...sourceTechnical, ...sourceLoudness },
    outputTechnical,
  };
}

function main() {
  const destinations = new Set(selections.map((item) => item.id));
  if (destinations.size !== selections.length) throw new Error("Canonical destinations must be unique");
  const sourceHashesBefore = new Map(selections.map((item) => [item.source, sha256(item.source)]));
  mkdirSync(outputRoot, { recursive: true });
  const entries = selections.map(build);
  for (const [path, before] of sourceHashesBefore) {
    const after = sha256(path);
    if (before !== after) throw new Error(`Source audio changed during conversion: ${path}`);
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceFoldersSearched: [sourceRoot],
    canonicalSoundCount: selections.length,
    assignedSoundCount: entries.length,
    missingSounds: [],
    licenses: {
      kenney: "CC0 1.0; credit appreciated but not required",
      sonniss: "Royalty-free personal and commercial use; attribution not required",
    },
    entries,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const sourceMap = [
    "# Flagfall canonical audio source map",
    "",
    "All source paths are absolute in `public/audio/audio-attribution.json`. This table keeps the review surface compact.",
    "",
    "| Canonical sound | Original source file | Creator / pack | License |",
    "| --- | --- | --- | --- |",
    ...entries.map((entry) =>
      `| ${entry.canonicalFilename} | ${entry.originalFilename.replaceAll("|", "\\|")} | `
      + `${entry.creator} / ${entry.pack.replaceAll("|", "\\|")} | ${entry.license} |`),
    "",
    "Missing sounds: none.",
    "",
  ].join("\n");
  writeFileSync(sourceMapPath, sourceMap);
  console.log(`Built ${entries.length} canonical sounds in ${outputRoot}`);
  console.log(`Wrote ${manifestPath}`);
  console.log(`Wrote ${sourceMapPath}`);
}

main();
