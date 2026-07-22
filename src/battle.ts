import { ascMods } from "./ascension";
import { ACT_RULE_BY_ID } from "./data/actrules";
import { TRAITS, UNIT_BY_ID } from "./data/units";
import type { EnemyTeam } from "./data/enemies";
import { starMult, teamCap } from "./state";
import type { OwnedUnit, RunState, SkillDef, TraitId } from "./types";

export const TICK_MS = 100; // 10 tick/秒
const MOVE_CD = 4; // 4tickごとに1マス移動
const MAX_TICKS = 900; // 90秒で強制終了
/** クリティカル時のダメージ倍率 */
export const CRIT_MULT = 1.6;
/** シールドの毎秒減衰率（重ねがけで無限に硬くなるのを防ぐ） */
const SHIELD_DECAY_PER_SEC = 0.08;
/** 敵のクリティカル率 */
export const ENEMY_CRIT_CHANCE = 0.05;

export interface CombatUnit {
  uid: number;
  side: "ally" | "enemy";
  name: string;
  icon: string;
  star: number;
  traits: TraitId[];
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  atk: number;
  atkSpeed: number;
  armor: number;
  spellPower: number; // %
  critChance: number; // 0-1
  critMult: number;
  range: number;
  mana: number;
  maxMana: number;
  skill: SkillDef | null;
  lifesteal: number; // 0-1（通常攻撃ダメージの回復割合）
  berserkBonus: number; // 狂戦士: HP半分以下時の攻撃力倍率ボーナス
  undeadBonus: number; // 死霊: キルごとの攻撃力上昇率
  manaGainMult: number; // 精霊: マナ獲得倍率
  shieldAtkBonus: number; // 不滅炉心: シールド中の攻撃倍率ボーナス
  manaRefundPct: number; // 魔力の輪廻: スキル後のマナ還元率
  poisonTicks: number; // 毒の残りtick
  poisonPerHit: number; // 毒の1回あたりダメージ（10tickごと）
  stunTicks: number; // スタンの残りtick
  alive: boolean;
  atkCd: number;
  moveCd: number;
  slowTicks: number;
  targetUid: number | null;
  ownerIid: number | null;
  silenceTicks: number;
  fearTicks: number;
  decoyCharges: number;
  daggerTicks: number;
  ghostTicks: number;
  ghostRevived: boolean;
  parasitePct: number;
  parasiteSplits: number;
  skillPowerMult: number;
  itemId: string | null;
  itemAttackCount: number;
  itemHitCount: number;
  itemCastCount: number;
  itemRevenge: boolean;
  itemGuaranteedCrit: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  cls: "dmg" | "crit" | "magic" | "heal" | "cast" | "poison";
}

export interface BattleUnitReport {
  uid: number;
  name: string;
  icon: string;
  side: "ally" | "enemy";
  star: number;
  damageDealt: number;
  damageTaken: number;
  healing: number;
  shielding: number;
  casts: number;
}

export type SkillFx = "fire" | "ice" | "holy" | "shadow" | "arrow" | "phys" | "bolt";

/** 演出用イベント（1tick分、ビューが消費する） */
export type BattleEvent =
  | { type: "attack"; fromUid: number; toUid: number; ranged: boolean }
  | { type: "cast"; uid: number }
  | { type: "hit"; uid: number; crit: boolean }
  | { type: "aoe"; x: number; y: number; kind: "fire" | "frost" | "phys" | "shadow" | "bolt" }
  | { type: "skillshot"; fromUid: number; toX: number; toY: number; fx: SkillFx }
  | { type: "slash"; x: number; y: number }
  | { type: "buff"; uid: number; fx: "heal" | "shield" }
  | { type: "death"; uid: number };

export interface TraitStatus {
  trait: TraitId;
  count: number;
  tier: number; // 0 = 未発動
}

/** アセンション+幕の掟による敵の強化倍率（編成スケールとは別掛け） */
export function enemyMults(
  run: RunState,
  nodeType: "battle" | "elite" | "boss",
): { hp: number; atk: number; as: number; armor: number } {
  const asc = ascMods(run.asc);
  const rule = ACT_RULE_BY_ID.get(run.actRule)?.e ?? {};
  // 低段位はビルドを気軽に完成させられる導入帯。
  // 段位5までに緩和が自然に消え、以降はアセンション本来の補正だけになる。
  const lowAscHpEase = [0.88, 0.91, 0.94, 0.97, 0.99][run.asc] ?? 1;
  const lowAscAtkEase = [0.9, 0.92, 0.94, 0.96, 0.98][run.asc] ?? 1;
  return {
    hp:
      (1 + (asc.enemyHpPct + (rule.enemyHpPct ?? 0)) / 100) *
      (nodeType === "boss" ? 1 + asc.bossHpPct / 100 : 1) *
      lowAscHpEase,
    atk: (1 + (asc.enemyAtkPct + (rule.enemyAtkPct ?? 0)) / 100) * lowAscAtkEase,
    as: 1 + (asc.enemyAsPct + (rule.enemyAsPct ?? 0)) / 100,
    armor: asc.enemyArmor,
  };
}

/** 盤面のユニット構成からシナジー状態を計算（ユニット種類でカウント） */
export function computeTraits(board: OwnedUnit[], ancientRelics: string[] = []): TraitStatus[] {
  const byTrait = new Map<TraitId, Set<string>>();
  const typeCounts = new Map<string, number>();
  for (const u of board) typeCounts.set(u.defId, (typeCounts.get(u.defId) ?? 0) + 1);
  for (const u of board) {
    for (const t of UNIT_BY_ID.get(u.defId)!.traits) {
      if (!byTrait.has(t)) byTrait.set(t, new Set());
      byTrait.get(t)!.add(u.defId);
      if (ancientRelics.includes("hundredMask") && typeCounts.get(u.defId) === 1) byTrait.get(t)!.add(`${u.defId}:mask`);
    }
  }
  const out: TraitStatus[] = [];
  for (const [trait, set] of byTrait) {
    const th = TRAITS[trait].thresholds;
    let tier = 0;
    for (let i = 0; i < th.length; i++) if (set.size >= th[i]) tier = i + 1;
    out.push({ trait, count: set.size, tier });
  }
  out.sort((a, b) => b.tier - a.tier || b.count - a.count);
  return out;
}

/** 味方1体の実効ステータスを構築（シナジー・アイテム・レリック・幕の掟込み）。
 *  戦闘生成と準備画面のステータス表示で同じ計算を共有する */
export function buildAllyUnit(
  run: RunState,
  u: OwnedUnit,
  traits: TraitStatus[],
  uid = 0,
): CombatUnit {
  const rule = ACT_RULE_BY_ID.get(run.actRule)?.e ?? {};
  const tierOf = (t: TraitId) => traits.find((s) => s.trait === t)?.tier ?? 0;
      const def = UNIT_BY_ID.get(u.defId)!;
      const m = starMult(u.star);
      const cu: CombatUnit = {
        uid,
        side: "ally",
        name: def.name,
        icon: def.icon,
        star: u.star,
        traits: [...def.traits],
        x: u.pos?.x ?? 0,
        y: u.pos?.y ?? 0,
        hp: Math.round(def.hp * m) + (u.hpBonus ?? 0),
        maxHp: Math.round(def.hp * m) + (u.hpBonus ?? 0),
        shield: 0,
        atk: Math.round(def.atk * m),
        atkSpeed: def.atkSpeed,
        armor: def.armor,
        spellPower: 0,
        critChance: 0.1,
        critMult: CRIT_MULT,
        range: def.range,
        mana: 0,
        maxMana: def.skill.mana,
        skill: def.skill,
        lifesteal: 0,
        berserkBonus: 0,
        undeadBonus: 0,
        manaGainMult: 1,
        shieldAtkBonus: 0,
        manaRefundPct: 0,
        poisonTicks: 0,
        poisonPerHit: 0,
        stunTicks: 0,
        alive: true,
        atkCd: 0,
        moveCd: 0,
        slowTicks: 0,
        targetUid: null,
        ownerIid: u.iid,
        silenceTicks: 0,
        fearTicks: 0,
        decoyCharges: 0,
        daggerTicks: 0,
        ghostTicks: 0,
        ghostRevived: false,
        parasitePct: 0,
        parasiteSplits: 0,
        skillPowerMult: 1,
        itemId: u.item,
        itemAttackCount: 0,
        itemHitCount: 0,
        itemCastCount: 0,
        itemRevenge: false,
        itemGuaranteedCrit: false,
      };
      // シナジー適用（3段階）
      if (def.traits.includes("warrior")) cu.armor += [0, 20, 45, 80][tierOf("warrior")];
      if (def.traits.includes("ranger")) cu.atkSpeed *= 1 + [0, 0.25, 0.6, 1.1][tierOf("ranger")];
      if (def.traits.includes("mage")) cu.spellPower += [0, 35, 80, 150][tierOf("mage")];
      if (def.traits.includes("assassin")) cu.critChance += [0, 0.3, 0.6, 1.0][tierOf("assassin")];
      if (def.traits.includes("berserker")) cu.berserkBonus = [0, 0.5, 0.9, 1.4][tierOf("berserker")];
      if (def.traits.includes("undead")) cu.undeadBonus = [0, 0.1, 0.18, 0.3][tierOf("undead")];
      if (def.traits.includes("spirit")) cu.manaGainMult = 1 + [0, 0.3, 0.6, 1.0][tierOf("spirit")];
      const constellationTier = tierOf("constellation");
      if (constellationTier > 0) {
        const aligned = run.roster.some((x) => {
          const xd = UNIT_BY_ID.get(x.defId)!;
          return x.pos && xd.traits.includes("constellation") && (x.pos.x === u.pos?.x || x.pos.y === u.pos?.y);
        });
        if (aligned) cu.maxMana = Math.max(20, Math.round(cu.maxMana * (1 - [0, 0.1, 0.18, 0.25][constellationTier])));
      }
      // 装備アイテム
      switch (u.item) {
        case "sword": cu.atk = Math.round(cu.atk * 1.3); break;
        case "shield": cu.armor += 35; break;
        case "staff": cu.spellPower += 40; break;
        case "bow": cu.atkSpeed *= 1.25; break;
        case "orb": cu.maxHp += 350; cu.hp += 350; break;
        case "blade": cu.lifesteal += 0.25; break;
        case "crystal": cu.mana += 50; break;
        case "claw": cu.critChance += 0.35; break;
        // 合成アイテム
        case "sword2": cu.atk = Math.round(cu.atk * 1.7); break;
        case "shield2": cu.armor += 70; cu.maxHp += 300; cu.hp += 300; cu.shield += Math.round(cu.maxHp * 0.3); break;
        case "staff2": cu.spellPower += 100; break;
        case "bow2": cu.atkSpeed *= 1.6; break;
        case "orb2": cu.maxHp += 800; cu.hp += 800; break;
        case "blade2": cu.lifesteal += 0.4; cu.atk = Math.round(cu.atk * 1.2); break;
        case "crystal2": cu.mana += 999; break;
        case "claw2": cu.critChance += 0.6; cu.critMult += 0.6; break;
        case "sword_shield": cu.atk = Math.round(cu.atk * 1.25); cu.armor += 25; break;
        case "sword_staff": cu.atk = Math.round(cu.atk * 1.25); cu.spellPower += 45; break;
        case "sword_bow": cu.atk = Math.round(cu.atk * 1.25); cu.atkSpeed *= 1.2; break;
        case "sword_orb": cu.atk = Math.round(cu.atk * 1.25); cu.maxHp += 250; cu.hp += 250; break;
        case "sword_blade": cu.atk = Math.round(cu.atk * 1.3); cu.lifesteal += 0.15; break;
        case "sword_crystal": cu.atk = Math.round(cu.atk * 1.25); cu.mana += 30; break;
        case "sword_claw": cu.atk = Math.round(cu.atk * 1.25); cu.critChance += 0.25; cu.critMult += 0.25; break;
        case "shield_staff": cu.armor += 25; cu.spellPower += 40; break;
        case "shield_bow": cu.armor += 25; cu.atkSpeed *= 1.2; break;
        case "shield_orb": cu.armor += 30; cu.maxHp += 400; cu.hp += 400; break;
        case "shield_blade": cu.armor += 30; cu.lifesteal += 0.15; break;
        case "shield_crystal": cu.armor += 25; cu.mana += 35; break;
        case "shield_claw": cu.armor += 25; cu.critChance += 0.2; break;
        case "staff_bow": cu.spellPower += 40; cu.atkSpeed *= 1.2; break;
        case "staff_orb": cu.spellPower += 40; cu.maxHp += 300; cu.hp += 300; break;
        case "staff_blade": cu.spellPower += 45; break;
        case "staff_crystal": cu.spellPower += 50; cu.mana += 40; break;
        case "staff_claw": cu.spellPower += 45; cu.critChance += 0.2; break;
        case "bow_orb": cu.atkSpeed *= 1.25; cu.maxHp += 250; cu.hp += 250; break;
        case "bow_blade": cu.atkSpeed *= 1.3; cu.lifesteal += 0.2; break;
        case "bow_crystal": cu.atkSpeed *= 1.25; cu.mana += 30; break;
        case "bow_claw": cu.atkSpeed *= 1.3; cu.critChance += 0.25; break;
        case "orb_blade": cu.maxHp += 400; cu.hp += 400; cu.lifesteal += 0.2; break;
        case "orb_crystal": cu.maxHp += 350; cu.hp += 350; cu.mana += 40; break;
        case "orb_claw": cu.maxHp += 350; cu.hp += 350; cu.critChance += 0.2; break;
        case "blade_crystal": cu.lifesteal += 0.2; cu.mana += 35; break;
        case "blade_claw": cu.lifesteal += 0.2; cu.critChance += 0.25; break;
        case "crystal_claw": cu.mana += 40; cu.critChance += 0.25; break;
      }
      // レリック（味方全体）
      const has = (id: string) => run.relics.includes(id);
      if (has("warbanner")) cu.atk = Math.round(cu.atk * 1.1);
      if (has("ironAmulet")) cu.armor += 12;
      if (has("grimoire")) cu.spellPower += 25;
      if (has("swiftBoots")) cu.atkSpeed *= 1.1;
      if (has("giantBelt")) {
        const add = Math.round(cu.maxHp * 0.12);
        cu.maxHp += add;
        cu.hp += add;
      }
      if (has("vampFang")) cu.lifesteal += 0.1;
      if (has("manaStone")) cu.mana += Math.round(cu.maxMana * 0.3);
      if (has("hourglass")) cu.mana += 20;
      // エンシェントレリック（通常レリックとは別枠）
      const hasAncient = (id: string) => run.ancientRelics.includes(id);
      const scaleHp = (mult: number) => {
        cu.maxHp = Math.max(1, Math.round(cu.maxHp * mult));
        cu.hp = cu.maxHp;
      };
      if (hasAncient("twinCrown")) {
        const sameCount = run.roster.filter((x) => x.pos !== null && x.defId === u.defId).length;
        if (sameCount >= 2) {
          scaleHp(1.4);
          cu.atk = Math.round(cu.atk * 1.4);
        }
      }
      if (hasAncient("legionPact")) {
        scaleHp(0.6);
        cu.atk = Math.max(1, Math.round(cu.atk * 0.6));
        cu.armor = Math.max(0, Math.round(cu.armor * 0.75));
      }
      if (hasAncient("aegisCore") && def.traits.includes("guardian")) cu.shieldAtkBonus = 0.5;
      if (hasAncient("manaCycle") && def.traits.includes("mage")) cu.manaRefundPct = 0.35;
      if (hasAncient("skyEye") && def.traits.includes("ranger")) {
        cu.range += 1;
        cu.atkSpeed *= 1.35;
      }
      if (hasAncient("bloodGrail") && def.traits.includes("berserker")) {
        scaleHp(1.25);
        cu.atkSpeed *= 1.2;
        cu.lifesteal += 0.3;
      }
      if (hasAncient("ninefoldHarmony")) {
        const activeTiers = Math.min(6, traits.reduce((sum, t) => sum + t.tier, 0));
        const mult = 1 + activeTiers * 0.06;
        scaleHp(mult);
        cu.atk = Math.round(cu.atk * mult);
      }
      if (hasAncient("shadowCrown") && def.traits.includes("assassin")) cu.critMult = 2.3;
      if (hasAncient("starEaterScale") && u.star < 3) {
        const mult = u.star === 1 ? 1.45 : 1.2;
        scaleHp(mult); cu.atk = Math.round(cu.atk * mult); cu.spellPower += Math.round((mult - 1) * 100);
      }
      if (hasAncient("lastSupper")) {
        const missing = Math.max(0, teamCap(run) - run.roster.filter((x) => x.pos !== null).length);
        if (missing >= 2) { const mult = 1 + missing * 0.15; scaleHp(mult); cu.atk = Math.round(cu.atk * mult); }
      }
      if (hasAncient("warGodArm") && !u.item) { cu.atk = Math.round(cu.atk * 1.35); cu.spellPower += 35; cu.atkSpeed *= 1.2; }
      if (hasAncient("primeCrucible") && u.item) {
        const baseItems = ["sword", "shield", "staff", "bow", "orb", "blade", "crystal", "claw"];
        const mult = baseItems.includes(u.item) ? 0.8 : 1.25;
        scaleHp(mult); cu.atk = Math.max(1, Math.round(cu.atk * mult)); cu.spellPower = Math.round(cu.spellPower * mult);
      }
      if (hasAncient("binaryStarCore") && u.pos) {
        const aligned = run.roster.filter((x) => x.pos && x.iid !== u.iid && (x.pos.x === u.pos!.x || x.pos.y === u.pos!.y));
        if (aligned.length > 0) { cu.atk = Math.round(cu.atk * 1.2); cu.spellPower += 20; }
        if (aligned.length >= 2) cu.manaGainMult *= 1.25;
      }
      if (hasAncient("emptyThrone")) {
        const centerEmpty = !run.roster.some((x) => x.pos && [3, 4].includes(x.pos.x) && [3, 4].includes(x.pos.y));
        if (centerEmpty) { cu.range += 1; cu.skillPowerMult *= 1.25; cu.atk = Math.round(cu.atk * 1.25); }
      }
      if (hasAncient("doomsdayContract")) { cu.hp = Math.max(1, Math.round(cu.maxHp * 0.7)); cu.critChance += 0.3; cu.critMult += 0.5; cu.lifesteal += 0.15; }
      if (rule.startMana) cu.mana += rule.startMana; // 幕の掟: 荒ぶる嵐
      cu.mana = Math.min(cu.mana, cu.maxMana - 10); // 開幕即発動は防ぐ
      return cu;
}

/** 準備画面のステータス表示用: 守護者シールドまで含めた実効ステータス */
export function previewAllyStats(run: RunState, u: OwnedUnit): CombatUnit {
  const board = run.roster.filter((x) => x.pos !== null);
  const traits = computeTraits(board, run.ancientRelics);
  const cu = buildAllyUnit(run, u, traits);
  const gTier = traits.find((s) => s.trait === "guardian")?.tier ?? 0;
  if (gTier > 0) cu.shield += Math.round(cu.maxHp * [0, 0.12, 0.25, 0.45][gTier]);
  return cu;
}

export class Battle {
  units: CombatUnit[] = [];
  floats: FloatText[] = [];
  events: BattleEvent[] = [];
  ticks = 0;
  /** 僧侶シナジー: 毎秒の味方全体回復率（最大HP比） */
  private allyRegen = 0;
  private nextUid = 1;
  private openingStopTicks = 0;
  private allySilenceTicks = 0;
  private gravityInterval = 0;
  private parasiteTier = 0;
  private ghostTier = 0;
  private resonatorTier = 0;
  private bloodpactTier = 0;
  private alchemistTier = 0;
  private dismantlerTier = 0;
  private scrapGained = 0;
  private scrappedTargets = new Set<string>();
  private rewardsSettled = false;
  private bossFight = false;
  private runRef: RunState;
  private deathHistory: CombatUnit[] = [];
  private consumedCorpses = new Set<number>();
  private bannerUid: number | null = null;
  private bannerTicks = 0;
  private openingSnapshot = new Map<number, { hp: number; mana: number; x: number; y: number }>();
  private twilightDeaths = 0;
  private twilightTriggered = false;
  private lighthouseTriggered = new Set<number>();
  private allyCastCount = 0;
  bonusGold = 0;
  private reports = new Map<number, BattleUnitReport>();

  private report(u: CombatUnit): BattleUnitReport {
    let row = this.reports.get(u.uid);
    if (!row) {
      row = { uid: u.uid, name: u.name, icon: u.icon, side: u.side, star: u.star, damageDealt: 0, damageTaken: 0, healing: 0, shielding: 0, casts: 0 };
      this.reports.set(u.uid, row);
    }
    return row;
  }

  summary(): BattleUnitReport[] {
    for (const u of this.units) this.report(u);
    return [...this.reports.values()].map((row) => ({ ...row }));
  }

  private recordShield(source: CombatUnit, target: CombatUnit, amount: number): void {
    const value = Math.max(0, Math.round(amount));
    target.shield += value;
    this.report(source).shielding += value;
  }

  constructor(run: RunState, team: EnemyTeam, nodeType: "battle" | "elite" | "boss" = "battle") {
    this.runRef = run;
    this.bossFight = nodeType === "boss";
    const board = run.roster.filter((u) => u.pos !== null);
    const traits = computeTraits(board, run.ancientRelics);
    const tierOf = (t: TraitId) => traits.find((s) => s.trait === t)?.tier ?? 0;
    this.resonatorTier = tierOf("resonator");
    this.parasiteTier = tierOf("parasite");
    this.ghostTier = tierOf("ghost");
    this.bloodpactTier = tierOf("bloodpact");
    this.alchemistTier = tierOf("alchemist");
    this.dismantlerTier = tierOf("dismantler");
    this.openingStopTicks = [0, 10, 15, 20][tierOf("clockwork")];
    this.gravityInterval = [0, 80, 60, 40][tierOf("gravity")];

    for (const u of board) {
      this.units.push(buildAllyUnit(run, u, traits, this.nextUid++));
    }
    const hasAncient = (id: string) => run.ancientRelics.includes(id);
    const alliesNow = () => this.units.filter((u) => u.side === "ally");
    if (hasAncient("chaosKaleidoscope")) {
      const roll = Math.floor(Math.random() * 5);
      for (const u of alliesNow()) {
        if (roll === 0) u.atk = Math.round(u.atk * 1.3);
        if (roll === 1) u.armor += 30;
        if (roll === 2) u.spellPower += 45;
        if (roll === 3) u.atkSpeed *= 1.3;
        if (roll === 4) { u.critChance += 0.25; u.manaGainMult *= 1.25; }
      }
    }
    if (hasAncient("reverseHourglass")) for (const u of alliesNow()) this.openingSnapshot.set(u.uid, { hp: u.hp, mana: u.mana, x: u.x, y: u.y });
    // 守護者: 味方全員にシールド
    const gTier = tierOf("guardian");
    if (gTier > 0) {
      const pct = [0, 0.12, 0.25, 0.45][gTier];
      const source = this.units.find((unit) => unit.traits.includes("guardian")) ?? this.units[0];
      for (const cu of this.units) this.recordShield(source, cu, cu.maxHp * pct);
    }
    // 僧侶: 味方全体リジェネ（毎秒、最大HP比）
    this.allyRegen = [0, 0.01, 0.02, 0.035][tierOf("priest")];

    const { spawns, scale } = team;
    // アセンション + 幕の掟による敵強化
    const em = enemyMults(run, nodeType);
    const hpMult = scale * em.hp;
    const atkMult = scale * em.atk;
    const asMult = em.as;
    for (const s of spawns) {
      this.units.push({
        uid: this.nextUid++,
        side: "enemy",
        name: s.def.name,
        icon: s.def.icon,
        star: 1,
        traits: [],
        x: s.x,
        y: s.y,
        hp: Math.round(s.def.hp * hpMult),
        maxHp: Math.round(s.def.hp * hpMult),
        shield: 0,
        atk: Math.round(s.def.atk * atkMult),
        atkSpeed: s.def.atkSpeed * asMult,
        armor: s.def.armor + em.armor,
        spellPower: 0,
        critChance: ENEMY_CRIT_CHANCE,
        critMult: CRIT_MULT,
        range: s.def.range,
        mana: 0,
        maxMana: s.def.skill?.mana ?? 999,
        skill: s.def.skill ?? null,
        lifesteal: 0,
        berserkBonus: 0,
        undeadBonus: 0,
        manaGainMult: 1,
        shieldAtkBonus: 0,
        manaRefundPct: 0,
        poisonTicks: 0,
        poisonPerHit: 0,
        stunTicks: 0,
        alive: true,
        atkCd: 0,
        moveCd: 0,
        slowTicks: 0,
        targetUid: null,
        ownerIid: null,
        silenceTicks: 0,
        fearTicks: 0,
        decoyCharges: 0,
        daggerTicks: 0,
        ghostTicks: 0,
        ghostRevived: false,
        parasitePct: 0,
        parasiteSplits: 0,
        skillPowerMult: 1,
        itemId: null,
        itemAttackCount: 0,
        itemHitCount: 0,
        itemCastCount: 0,
        itemRevenge: false,
        itemGuaranteedCrit: false,
      });
    }

    if (hasAncient("soulMirror")) {
      const allies = alliesNow().filter((u) => u.skill);
      const low = [...allies].sort((a, b) => (UNIT_BY_ID.get(board.find((x) => x.iid === a.ownerIid)?.defId ?? "")?.cost ?? 9) - (UNIT_BY_ID.get(board.find((x) => x.iid === b.ownerIid)?.defId ?? "")?.cost ?? 9))[0];
      const high = [...allies].sort((a, b) => (UNIT_BY_ID.get(board.find((x) => x.iid === b.ownerIid)?.defId ?? "")?.cost ?? 0) - (UNIT_BY_ID.get(board.find((x) => x.iid === a.ownerIid)?.defId ?? "")?.cost ?? 0))[0];
      if (low && high && low.uid !== high.uid && high.skill) {
        low.skill = { ...high.skill };
        low.maxMana = high.skill.mana;
        low.skillPowerMult *= 0.9;
        low.mana = Math.min(low.maxMana - 1, low.mana + 30);
      }
    }

    // ドッペルゲンガー: 敵最高攻撃力の通常スキルをコピー
    const doppelTier = tierOf("doppelganger");
    if (doppelTier > 0) {
      const source = this.units.filter((u) => u.side === "enemy" && u.skill).sort((a, b) => b.atk - a.atk)[0];
      if (source?.skill) for (const u of this.units.filter((x) => x.side === "ally" && x.traits.includes("doppelganger"))) {
        u.skill = { ...source.skill };
        u.maxMana = source.skill.mana;
        u.skillPowerMult = [0, 0.7, 0.85, 1][doppelTier];
      }
    }
    // 指揮官: 自身は行動せず、開幕時に最も最大HPが低い味方を指揮
    const commanderTier = tierOf("commander");
    if (commanderTier > 0) {
      const target = this.units.filter((u) => u.side === "ally" && !u.traits.includes("commander")).sort((a, b) => a.maxHp - b.maxHp)[0];
      if (target) {
        const bonus = [0, 0.5, 0.9, 1.4][commanderTier];
        target.atkSpeed *= 1 + bonus;
        target.manaGainMult *= 1 + bonus;
      }
    }
    // 賭博師: チームで1回だけコイントス
    const gamblerTier = tierOf("gambler");
    if (gamblerTier > 0) {
      if (Math.random() < 0.5) for (const u of this.units.filter((x) => x.side === "ally")) u.critChance += [0, 0.25, 0.4, 0.55][gamblerTier];
      else this.allySilenceTicks = [0, 20, 15, 10][gamblerTier];
    }
    // 道化師: 通常戦は位置交換、ボス戦は同じ段階数の分身で攻撃を無効化
    const jesterTier = tierOf("jester");
    if (jesterTier > 0) {
      const allJesters = this.units.filter((u) => u.side === "ally" && u.traits.includes("jester"));
      if (nodeType === "boss") {
        for (const jester of allJesters) jester.decoyCharges += jesterTier;
      } else {
        const jesters = allJesters.slice(0, jesterTier);
        const enemies = this.units.filter((u) => u.side === "enemy").sort(() => Math.random() - 0.5);
        jesters.forEach((j, i) => { const e = enemies[i]; if (e) [j.x, e.x, j.y, e.y] = [e.x, j.x, e.y, j.y]; });
      }
    }
    // 前戦で作ったポーションを自動使用
    for (const potion of run.potions.splice(0)) {
      for (const u of this.units.filter((x) => x.side === "ally")) {
        if (potion === "might") u.atk = Math.round(u.atk * 1.12);
        if (potion === "guard") { u.maxHp = Math.round(u.maxHp * 1.12); u.hp = u.maxHp; }
        if (potion === "mana") u.mana = Math.min(u.maxMana - 1, u.mana + 20);
      }
    }
  }

  /** 戦闘終了時の錬金術師・解体屋報酬をラン状態へ反映する。 */
  settleRunRewards(run: RunState, won: boolean): string[] {
    if (this.rewardsSettled) return [];
    this.rewardsSettled = true;
    const notes: string[] = [];
    if (won && this.alchemistTier > 0) {
      const survivors = this.units.filter((u) => u.alive && u.side === "ally" && u.traits.includes("alchemist")).length;
      const n = Math.min(this.alchemistTier, survivors, 3 - run.potions.length);
      const pool = ["might", "guard", "mana"];
      for (let i = 0; i < n; i++) run.potions.push(pool[Math.floor(Math.random() * pool.length)]);
      if (n > 0) notes.push(`ポーション +${n}`);
    }
    run.scrap += this.scrapGained;
    while (run.scrap >= 5 && run.roster.length > 0) {
      run.scrap -= 5;
      const target = run.roster[Math.floor(Math.random() * run.roster.length)];
      target.hpBonus = (target.hpBonus ?? 0) + 50;
      notes.push(`${UNIT_BY_ID.get(target.defId)!.name} 最大HP+50`);
    }
    return notes;
  }

  get result(): "win" | "lose" | null {
    const allies = this.units.some((u) => u.alive && u.side === "ally");
    const enemies = this.units.some((u) => u.alive && u.side === "enemy");
    if (!enemies) return "win";
    if (!allies || this.ticks >= MAX_TICKS) return "lose";
    return null;
  }

  get survivingEnemies(): number {
    return this.units.filter((u) => u.alive && u.side === "enemy").length;
  }

  /** 狂戦士ボーナスを含む実効攻撃力 */
  private atkOf(u: CombatUnit): number {
    let mult = u.shield > 0 ? 1 + u.shieldAtkBonus : 1;
    if (u.berserkBonus > 0 && u.hp < u.maxHp * 0.5) {
      mult *= 1 + u.berserkBonus;
    }
    return Math.round(u.atk * mult);
  }

  tick() {
    this.floats = [];
    this.events = [];
    this.ticks++;
    if (this.ticks === 50 && this.runRef.ancientRelics.includes("reverseHourglass")) {
      for (const u of this.units.filter((x) => x.alive && x.side === "ally")) {
        const snap = this.openingSnapshot.get(u.uid);
        if (!snap) continue;
        u.hp = Math.min(u.maxHp, Math.max(u.hp, snap.hp));
        u.mana = Math.min(u.maxMana - 1, Math.max(u.mana, snap.mana));
        u.x = snap.x; u.y = snap.y;
        this.events.push({ type: "buff", uid: u.uid, fx: "heal" });
      }
    }
    if (this.bannerTicks > 0) this.bannerTicks--;
    if (this.allySilenceTicks > 0) this.allySilenceTicks--;
    if (this.gravityInterval > 0 && this.ticks % this.gravityInterval === 0) this.pullEnemiesToCenter();
    // 僧侶: 毎秒リジェネ
    if (this.allyRegen > 0 && this.ticks % 10 === 0) {
      for (const u of this.units) {
        if (u.alive && u.side === "ally" && u.hp < u.maxHp) {
          u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.round(u.maxHp * this.allyRegen)));
        }
      }
    }
    // シールドは毎秒少しずつ剥がれる
    if (this.ticks % 10 === 0) {
      for (const u of this.units) {
        if (u.alive && (u.itemId === "orb2" || u.itemId === "shield_orb")) {
          const pct = u.itemId === "orb2" ? (u.hp < u.maxHp * 0.5 ? 0.04 : 0.02) : 0.015;
          this.itemHeal(u, u.maxHp * pct);
        }
        if (!u.alive || u.shield <= 0) continue;
        u.shield = Math.round(u.shield * (1 - SHIELD_DECAY_PER_SEC));
        if (u.shield < 5) u.shield = 0; // 端数が残り続けないよう切り捨て
      }
    }
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.side === "ally" && this.runRef.ancientRelics.includes("lifeBeacon") && u.hp < u.maxHp * 0.3 && !this.lighthouseTriggered.has(u.uid)) {
        this.lighthouseTriggered.add(u.uid);
        this.recordShield(u, u, u.maxHp * 0.35);
        u.mana = Math.min(u.maxMana - 1, u.mana + 20);
        u.stunTicks = 0; u.slowTicks = 0; u.silenceTicks = 0; u.fearTicks = 0;
        u.y = 7; u.x = Math.max(0, Math.min(6, u.x));
        this.floats.push({ x: u.x, y: u.y, text: "灯台", cls: "heal" });
      }
      // 亡霊: 固定時間だけ無敵。毎秒HPを失い、時間切れで消滅
      if (u.ghostTicks > 0) {
        u.ghostTicks--;
        if (u.ghostTicks % 10 === 0) u.hp -= Math.max(1, Math.round(u.maxHp * 0.04));
        if (u.ghostTicks <= 0 || u.hp <= 0) { u.hp = 0; this.finishDeath(u, null); continue; }
      }
      // 寄生: 毎秒の最大HP割合ダメージ（ボス級にも1回最大250まで）
      if (u.ghostTicks <= 0 && u.parasitePct > 0 && this.ticks % 10 === 0) {
        u.hp -= Math.min(250, Math.max(1, Math.round(u.maxHp * u.parasitePct)));
        this.floats.push({ x: u.x, y: u.y, text: "寄生", cls: "poison" });
        if (u.hp <= 0) { u.hp = 0; this.finishDeath(u, null); continue; }
      }
      // 毒: 10tickごと（毎秒）にダメージ
      if (u.poisonTicks > 0) {
        u.poisonTicks--;
        if (u.poisonTicks % 10 === 0) this.applyPoison(u);
        if (!u.alive) continue;
      }
      // スタン: 行動不能（クールダウンも進まない）
      if (u.stunTicks > 0) {
        u.stunTicks--;
        continue;
      }
      if (u.traits.includes("commander")) {
        u.mana = Math.min(u.maxMana, u.mana + 3);
        if (u.skill && u.mana >= u.maxMana && u.silenceTicks <= 0) {
          const commandTarget = this.acquireTarget(u) ?? this.units.find((x) => x.alive && x.side === u.side && x.uid !== u.uid);
          if (commandTarget) this.cast(u, commandTarget);
        }
        continue;
      }
      if (this.openingStopTicks > 0 && this.ticks <= this.openingStopTicks && !u.traits.includes("clockwork")) continue;
      if (u.slowTicks > 0) u.slowTicks--;
      if (u.silenceTicks > 0) u.silenceTicks--;
      if (u.daggerTicks > 0) u.daggerTicks--;
      if (u.atkCd > 0) u.atkCd--;
      if (u.moveCd > 0) u.moveCd--;

      if (u.fearTicks > 0) {
        u.fearTicks--;
        const threat = this.acquireTarget(u);
        if (threat && u.moveCd <= 0) this.stepAway(u, threat);
        continue;
      }

      const target = this.acquireTarget(u);
      if (!target) continue;

      if (u.skill && u.mana >= u.maxMana && u.silenceTicks <= 0 && !(u.side === "ally" && this.allySilenceTicks > 0)) {
        this.cast(u, target);
        continue;
      }

      const dist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
      if (dist <= u.range) {
        if (u.atkCd <= 0) this.attack(u, target);
      } else if (u.moveCd <= 0) {
        this.stepToward(u, target);
        u.moveCd = MOVE_CD;
      }
    }
  }

  private applyPoison(u: CombatUnit) {
    if (u.ghostTicks > 0) return;
    let remain = u.poisonPerHit;
    if (u.shield > 0) {
      const absorbed = Math.min(u.shield, remain);
      u.shield -= absorbed;
      remain -= absorbed;
    }
    u.hp -= remain;
    this.floats.push({ x: u.x, y: u.y, text: String(u.poisonPerHit), cls: "poison" });
    if (u.hp <= 0) {
      u.hp = 0;
      u.poisonTicks = 0;
      this.finishDeath(u, null);
    }
  }

  private pullEnemiesToCenter() {
    const enemies = this.units.filter((u) => u.alive && u.side === "enemy");
    for (const u of enemies) {
      const nx = u.x + Math.sign(3 - u.x);
      const ny = u.y + Math.sign(3.5 - u.y);
      const occupant = this.units.find((o) => o.alive && o.uid !== u.uid && o.x === nx && o.y === ny);
      if (occupant) {
        if (occupant.side === "enemy") {
          const duration = this.bossFight ? 5 : 10;
          u.stunTicks = Math.max(u.stunTicks, duration);
          occupant.stunTicks = Math.max(occupant.stunTicks, duration);
        }
      } else {
        u.x = nx;
        u.y = ny;
      }
    }
  }

  private acquireTarget(u: CombatUnit): CombatUnit | null {
    const cur = this.units.find((t) => t.uid === u.targetUid && t.alive);
    if (cur) {
      const d = Math.max(Math.abs(u.x - cur.x), Math.abs(u.y - cur.y));
      if (d <= u.range) return cur;
    }
    const foes = this.units.filter((t) => t.alive && t.side !== u.side);
    if (foes.length === 0) return null;
    foes.sort(
      (a, b) =>
        Math.max(Math.abs(u.x - a.x), Math.abs(u.y - a.y)) -
        Math.max(Math.abs(u.x - b.x), Math.abs(u.y - b.y)),
    );
    u.targetUid = foes[0].uid;
    return foes[0];
  }

  private stepToward(u: CombatUnit, target: CombatUnit) {
    const dirs = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    const curDist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
    let best: { x: number; y: number } | null = null;
    let bestDist = curDist;
    for (const [dx, dy] of dirs) {
      const nx = u.x + dx;
      const ny = u.y + dy;
      if (nx < 0 || nx >= 7 || ny < 0 || ny >= 8) continue;
      if (this.units.some((o) => o.alive && o.x === nx && o.y === ny)) continue;
      const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y));
      if (d < bestDist) {
        bestDist = d;
        best = { x: nx, y: ny };
      }
    }
    if (best) {
      u.x = best.x;
      u.y = best.y;
    }
  }

  private stepAway(u: CombatUnit, target: CombatUnit) {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let best = { x: u.x, y: u.y };
    let bestDist = chebDistance(u, target);
    for (const [dx, dy] of dirs) {
      const x = u.x + dx, y = u.y + dy;
      if (x < 0 || x >= 7 || y < 0 || y >= 8 || this.units.some((o) => o.alive && o.x === x && o.y === y)) continue;
      const d = chebDistance({ x, y }, target);
      if (d > bestDist) { best = { x, y }; bestDist = d; }
    }
    u.x = best.x; u.y = best.y; u.moveCd = MOVE_CD;
  }

  private attack(u: CombatUnit, target: CombatUnit) {
    const slowMult = u.slowTicks > 0 ? 0.7 : 1;
    const bloodWind = u.itemId === "bow_blade" ? 1 + (1 - u.hp / u.maxHp) * 0.6 : 1;
    u.atkCd = Math.max(2, Math.round(10 / (u.atkSpeed * slowMult * bloodWind)));
    const lowHpCrit = u.itemId === "orb_claw" ? (1 - u.hp / u.maxHp) * 0.4 : 0;
    const crit = u.itemGuaranteedCrit || Math.random() < u.critChance + lowHpCrit;
    u.itemGuaranteedCrit = false;
    let dmg = this.atkOf(u) * (crit ? u.critMult : 1);
    if (u.itemRevenge) { dmg *= 1.2; u.itemRevenge = false; }
    this.events.push({ type: "attack", fromUid: u.uid, toUid: target.uid, ranged: u.range > 1 });
    const dealt = this.dealDamage(u, target, dmg, "physical", crit);
    if (u.lifesteal > 0 && dealt > 0) {
      const mult = u.itemId === "blade_claw" && crit ? 2 : 1;
      this.itemHeal(u, dealt * u.lifesteal * mult);
    }
    u.itemAttackCount++;
    const bonusMana = u.itemId === "staff_bow" || u.itemId === "bow_crystal" ? 5 : 0;
    u.mana += Math.round((10 + bonusMana) * u.manaGainMult);
    if (target.alive) target.mana += Math.round(5 * target.manaGainMult);

    if (u.itemId === "bow_orb" && u.itemAttackCount % 5 === 0) this.itemHeal(u, u.maxHp * 0.05);
    const extraEvery = u.itemId === "sword_bow" ? 4 : u.itemId === "bow2" ? 4 : 0;
    if (extraEvery > 0 && u.itemAttackCount % extraEvery === 0) {
      const extras = this.units.filter((x) => x.alive && x.side !== u.side && x.uid !== target.uid);
      const count = u.itemId === "bow2" ? 2 : 1;
      for (const extra of (extras.length ? extras : [target]).slice(0, count)) {
        this.events.push({ type: "attack", fromUid: u.uid, toUid: extra.uid, ranged: u.range > 1 });
        this.dealDamage(u, extra, this.atkOf(u) * 0.65, "physical", false, true);
      }
    }
    if (u.itemId === "bow_claw" && crit) {
      const extra = this.units.find((x) => x.alive && x.side !== u.side && x.uid !== target.uid) ?? target;
      if (extra.alive) this.dealDamage(u, extra, this.atkOf(u) * 0.45, "physical", false, true);
    }
  }

  private cast(u: CombatUnit, target: CombatUnit, powerScale = 1, isEcho = false, overrideSkill?: SkillDef) {
    const sk = overrideSkill ?? u.skill!;
    if (!isEcho) { u.mana = 0; this.report(u).casts++; }
    u.atkCd = Math.max(u.atkCd, 3);
    let base =
      sk.scaling === "attack"
        ? (this.atkOf(u) * sk.power * powerScale * u.skillPowerMult) / 100
        : sk.power * (1 + u.spellPower / 100) * powerScale * u.skillPowerMult;
    if (u.itemId === "sword_staff" && sk.scaling === "attack") base *= 1 + u.spellPower * 0.0025;
    if (u.itemId === "staff_orb" && ["heal", "shield", "healAll", "rally", "linkedHeal"].includes(sk.type)) base *= 1.3;
    const firstItemCast = !isEcho && u.itemCastCount === 0;
    if (!isEcho) {
      u.itemCastCount++;
      if (u.itemId === "crystal_claw" && firstItemCast) u.itemGuaranteedCrit = true;
    }
    this.floats.push({ x: u.x, y: u.y, text: isEcho ? `共鳴:${sk.name}` : sk.name, cls: "cast" });
    this.events.push({ type: "cast", uid: u.uid });

    if (!isEcho && u.side === "ally" && this.runRef.ancientRelics.includes("dragonHeart")) {
      this.allyCastCount++;
      if (this.allyCastCount % 6 === 0) {
        for (const enemy of this.units.filter((x) => x.alive && x.side === "enemy")) this.dealDamage(u, enemy, Math.min(500, enemy.maxHp * 0.05), "magic", false, true);
        for (const ally of this.units.filter((x) => x.alive && x.side === "ally")) { ally.hp = Math.min(ally.maxHp, ally.hp + Math.round(ally.maxHp * 0.05)); this.events.push({ type: "buff", uid: ally.uid, fx: "heal" }); }
      }
    }

    const foes = () => this.units.filter((t) => t.alive && t.side !== u.side);
    const allies = () => this.units.filter((t) => t.alive && t.side === u.side);
    const kind = sk.scaling === "attack" ? "physical" : "magic";
    const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

    switch (sk.type) {
      case "nuke":
        this.events.push({
          type: "skillshot",
          fromUid: u.uid,
          toX: target.x,
          toY: target.y,
          fx: sk.fx ?? "fire",
        });
        this.dealDamage(u, target, base, kind, false);
        break;
      case "aoe":
      case "frost": {
        this.events.push({
          type: "aoe",
          x: target.x,
          y: target.y,
          kind:
            sk.type === "frost"
              ? "frost"
              : sk.fx === "shadow" || sk.fx === "bolt" || sk.fx === "fire"
                ? sk.fx
                : sk.scaling === "spell"
                  ? "fire"
                  : "phys",
        });
        for (const t of foes()) {
          const d = Math.max(Math.abs(t.x - target.x), Math.abs(t.y - target.y));
          if (d <= 1) {
            this.dealDamage(u, t, base, kind, false);
            if (sk.type === "frost" && t.alive) t.slowTicks = Math.round(30 * powerScale);
          }
        }
        break;
      }
      case "multishot": {
        const pool = foes();
        for (let i = 0; i < 3 && pool.length > 0; i++) {
          const t = pool[Math.floor(Math.random() * pool.length)];
          if (sk.fx === "phys") {
            this.events.push({ type: "slash", x: t.x, y: t.y });
          } else {
            this.events.push({
              type: "skillshot",
              fromUid: u.uid,
              toX: t.x,
              toY: t.y,
              fx: sk.fx ?? "arrow",
            });
          }
          this.dealDamage(u, t, base, kind, false);
        }
        break;
      }
      case "execute": {
        const pool = foes().sort((a, b) => a.hp - b.hp);
        const t =
          sk.name === "影討ち" || sk.name === "精密射撃" ? pool[0] ?? target : target;
        const fx = sk.fx ?? (u.range > 1 ? "arrow" : "phys");
        if (fx === "phys") {
          this.events.push({ type: "slash", x: t.x, y: t.y });
        } else {
          this.events.push({ type: "skillshot", fromUid: u.uid, toX: t.x, toY: t.y, fx });
        }
        this.dealDamage(u, t, base, kind, sk.name === "急所突き");
        break;
      }
      case "pierce": {
        this.events.push({ type: "slash", x: target.x, y: target.y });
        this.dealDamage(u, target, base, kind, false);
        // 対象の後方（同方向1マス先）にも
        const dx = Math.sign(target.x - u.x);
        const dy = Math.sign(target.y - u.y);
        const behind = foes().find((t) => t.x === target.x + dx && t.y === target.y + dy);
        if (behind) {
          this.events.push({ type: "slash", x: behind.x, y: behind.y });
          this.dealDamage(u, behind, base * 0.7, kind, false);
        }
        break;
      }
      case "heal": {
        const wounded = this.units
          .filter((t) => t.alive && t.side === u.side)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (wounded) {
          const amount = Math.round(base);
          wounded.hp = Math.min(wounded.maxHp, wounded.hp + amount);
          this.floats.push({ x: wounded.x, y: wounded.y, text: `+${amount}`, cls: "heal" });
          this.events.push({ type: "buff", uid: wounded.uid, fx: "heal" });
        }
        break;
      }
      case "shield":
        this.recordShield(u, u, base);
        this.floats.push({ x: u.x, y: u.y, text: `🛡+${Math.round(base)}`, cls: "heal" });
        this.events.push({ type: "buff", uid: u.uid, fx: "shield" });
        break;
      case "poison": {
        // 4秒かけて base の合計ダメージ（防御無視）
        target.poisonTicks = 40;
        target.poisonPerHit = Math.max(1, Math.round(base / 4));
        this.floats.push({ x: target.x, y: target.y, text: "☠毒", cls: "poison" });
        this.events.push({ type: "skillshot", fromUid: u.uid, toX: target.x, toY: target.y, fx: "shadow" });
        break;
      }
      case "stun": {
        this.events.push({ type: "slash", x: target.x, y: target.y });
        this.dealDamage(u, target, base, kind, false);
        if (target.alive) {
          target.stunTicks = Math.round(15 * powerScale);
          this.floats.push({ x: target.x, y: target.y, text: "💫", cls: "cast" });
        }
        break;
      }
      case "drain": {
        this.events.push({ type: "skillshot", fromUid: u.uid, toX: target.x, toY: target.y, fx: sk.fx ?? "shadow" });
        const dealt = this.dealDamage(u, target, base, kind, false);
        if (dealt > 0) {
          u.hp = Math.min(u.maxHp, u.hp + dealt);
          this.floats.push({ x: u.x, y: u.y, text: `+${dealt}`, cls: "heal" });
        }
        break;
      }
      case "warcry": {
        const pct = base / 100;
        for (const a of this.units) {
          if (a.alive && a.side === u.side) {
            a.atk = Math.round(a.atk * (1 + pct));
            this.events.push({ type: "buff", uid: a.uid, fx: "heal" });
          }
        }
        this.floats.push({ x: u.x, y: u.y, text: `⚔攻撃+${Math.round(base)}%`, cls: "cast" });
        break;
      }
      case "chain": {
        // 対象から最も近い敵へ順に連鎖。1体ごとに威力減衰
        let cur: CombatUnit | undefined = target;
        let fromUid = u.uid;
        let dmg = base;
        const hit = new Set<number>();
        for (let i = 0; i < 4 && cur; i++) {
          hit.add(cur.uid);
          this.events.push({
            type: "skillshot",
            fromUid,
            toX: cur.x,
            toY: cur.y,
            fx: sk.fx ?? "bolt",
          });
          this.dealDamage(u, cur, dmg, kind, false);
          fromUid = cur.uid;
          dmg *= 0.72;
          const prev: CombatUnit = cur;
          const rest: CombatUnit[] = foes().filter((f) => !hit.has(f.uid));
          rest.sort((a, b) => cheb(prev, a) - cheb(prev, b));
          cur = rest[0];
        }
        break;
      }
      case "nova": {
        // 自分を中心とした全周攻撃
        this.events.push({
          type: "aoe",
          x: u.x,
          y: u.y,
          kind: sk.fx === "shadow" || sk.fx === "bolt" || sk.fx === "fire" ? sk.fx : "fire",
        });
        for (const t of foes()) {
          if (cheb(t, u) <= 1) this.dealDamage(u, t, base, kind, false);
        }
        break;
      }
      case "curse": {
        this.events.push({
          type: "skillshot",
          fromUid: u.uid,
          toX: target.x,
          toY: target.y,
          fx: sk.fx ?? "shadow",
        });
        this.dealDamage(u, target, base, kind, false);
        if (target.alive && target.armor > 0) {
          target.armor = Math.round(target.armor / 2);
          this.recordScrap(target, "armor");
          this.floats.push({ x: target.x, y: target.y, text: "🛡️↓", cls: "poison" });
        }
        break;
      }
      case "bombard": {
        // ランダムな敵3体の位置へ着弾、それぞれ周囲1マスを巻き込む
        const picks = [...foes()].sort(() => Math.random() - 0.5).slice(0, 3);
        for (const p of picks) {
          const px = p.x;
          const py = p.y;
          this.events.push({ type: "aoe", x: px, y: py, kind: sk.fx === "shadow" ? "shadow" : "fire" });
          for (const t of foes()) {
            if (Math.max(Math.abs(t.x - px), Math.abs(t.y - py)) <= 1) {
              this.dealDamage(u, t, base * 0.6, kind, false);
            }
          }
        }
        break;
      }
      case "snipe": {
        // 最もHPの高い敵（前衛の壁役）を撃ち抜く
        const t = foes().sort((a, b) => b.hp - a.hp)[0] ?? target;
        this.events.push({
          type: "skillshot",
          fromUid: u.uid,
          toX: t.x,
          toY: t.y,
          fx: sk.fx ?? "arrow",
        });
        this.dealDamage(u, t, base, kind, true);
        break;
      }
      case "healAll": {
        const amount = Math.round(base);
        for (const a of allies()) {
          if (a.hp >= a.maxHp) continue;
          a.hp = Math.min(a.maxHp, a.hp + amount);
          this.floats.push({ x: a.x, y: a.y, text: `+${amount}`, cls: "heal" });
          this.events.push({ type: "buff", uid: a.uid, fx: "heal" });
        }
        break;
      }
      case "rally": {
        const amount = Math.round(base);
        for (const a of allies()) {
          this.recordShield(u, a, amount);
          this.events.push({ type: "buff", uid: a.uid, fx: "shield" });
        }
        this.floats.push({ x: u.x, y: u.y, text: `🛡全体+${amount}`, cls: "cast" });
        break;
      }
      case "frenzy": {
        // 自己強化（この戦闘中ずっと持続）
        this.recordShield(u, u, base);
        u.atkSpeed *= 1.6;
        u.critChance = Math.min(1, u.critChance + 0.4);
        this.events.push({ type: "buff", uid: u.uid, fx: "heal" });
        this.floats.push({ x: u.x, y: u.y, text: "⚡狂乱", cls: "cast" });
        break;
      }
      case "manaburn": {
        this.events.push({
          type: "skillshot",
          fromUid: u.uid,
          toX: target.x,
          toY: target.y,
          fx: sk.fx ?? "bolt",
        });
        this.dealDamage(u, target, base, kind, false);
        if (target.alive && target.mana > 0) {
          target.mana = 0;
          this.floats.push({ x: target.x, y: target.y, text: "マナ枯渇", cls: "poison" });
        }
        break;
      }
      case "freeze": {
        this.events.push({ type: "aoe", x: target.x, y: target.y, kind: "frost" });
        for (const t of foes()) {
          if (cheb(t, target) <= 1) {
            this.dealDamage(u, t, base, kind, false);
            if (t.alive) {
              t.stunTicks = Math.max(t.stunTicks, Math.round(20 * powerScale));
              this.floats.push({ x: t.x, y: t.y, text: "🧊", cls: "cast" });
            }
          }
        }
        break;
      }
      case "silenceWave": {
        const far = foes().sort((a, b) => cheb(b, u) - cheb(a, u))[0] ?? target;
        this.events.push({ type: "aoe", x: far.x, y: far.y, kind: "bolt" });
        for (const t of foes()) if (cheb(t, far) <= 1) {
          this.dealDamage(u, t, base, "magic", false);
          if (t.alive) t.silenceTicks = Math.max(t.silenceTicks, Math.round(20 * powerScale));
        }
        break;
      }
      case "shieldBreak": {
        const broken = target.shield;
        if (broken > 0) { target.shield = 0; this.recordScrap(target, "shield"); }
        this.dealDamage(u, target, base + Math.min(400, broken * 0.35), kind, false);
        this.events.push({ type: "skillshot", fromUid: u.uid, toX: target.x, toY: target.y, fx: "phys" });
        break;
      }
      case "bloodPoison": {
        u.hp = Math.max(1, u.hp - Math.round(u.hp * 0.35));
        this.events.push({ type: "aoe", x: u.x, y: u.y, kind: "shadow" });
        for (const t of foes()) if (cheb(t, u) <= 2) {
          t.poisonTicks = 40;
          t.poisonPerHit = Math.max(t.poisonPerHit, Math.round(base / 4));
        }
        break;
      }
      case "mirrorStrike": {
        if (target.skill && target.skill.type !== "mirrorStrike" && target.skill.type !== "allyCopy" && !["生ける贋作", "同胞完全擬態", "双貌の大勝負"].includes(target.skill.name)) this.cast(u, target, 0.65 * powerScale, true, target.skill);
        else this.dealDamage(u, target, base, kind, false);
        break;
      }
      case "gravityField": {
        this.events.push({ type: "aoe", x: target.x, y: target.y, kind: "shadow" });
        for (const t of foes()) if (cheb(t, target) <= 1) {
          this.dealDamage(u, t, base, "magic", false);
          t.slowTicks = Math.max(t.slowTicks, 35);
          t.atkCd += 8;
        }
        break;
      }
      case "linkedHeal": {
        const wounded = allies().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 2);
        const amount = Math.round(base);
        for (const a of wounded) { a.hp = Math.min(a.maxHp, a.hp + amount); this.events.push({ type: "buff", uid: a.uid, fx: "heal" }); }
        break;
      }
      case "diceExecute": {
        const roll = 1 + Math.floor(Math.random() * 6);
        if (Math.random() < roll * 0.1) {
          const lethal = this.bossFight ? Math.min(base * 3, target.maxHp * 0.15) : target.hp + target.shield;
          this.dealDamage(u, target, lethal, "magic", true);
        } else u.hp = Math.max(1, u.hp - Math.round(u.maxHp * 0.2));
        this.floats.push({ x: u.x, y: u.y, text: `🎲${roll}`, cls: "cast" });
        break;
      }
      case "spectralDash": {
        const dx = Math.sign(target.x - u.x), dy = Math.sign(target.y - u.y);
        for (let i = 1; i <= 6; i++) {
          const x = u.x + dx * i, y = u.y + dy * i;
          if (x < 0 || x >= 7 || y < 0 || y >= 8) break;
          for (const a of allies()) if (a.x === x && a.y === y) this.recordShield(u, a, base * 0.45);
          for (const t of foes()) if (t.x === x && t.y === y) this.dealDamage(u, t, base, kind, false);
        }
        if (!isEcho) { u.x = Math.max(0, Math.min(6, target.x - dx)); u.y = Math.max(0, Math.min(7, target.y - dy)); }
        break;
      }
      case "allyCopy": {
        const copy = allies().filter((a) => a.uid !== u.uid && a.skill && a.skill.type !== "allyCopy" && a.skill.type !== "mirrorStrike" && !["生ける贋作", "同胞完全擬態", "双貌の大勝負"].includes(a.skill.name)).sort((a, b) => cheb(a, u) - cheb(b, u))[0];
        if (copy?.skill) this.cast(u, target, 0.8 * powerScale, true, copy.skill);
        break;
      }
      case "damageBanner":
        this.bannerUid = u.uid; this.bannerTicks = 40;
        this.floats.push({ x: u.x, y: u.y, text: "🚩防護命令", cls: "cast" });
        break;
      case "bloodLine": {
        u.hp = Math.max(1, u.hp - Math.round(u.maxHp * 0.2));
        const dx = Math.sign(target.x - u.x), dy = Math.sign(target.y - u.y);
        for (const t of foes()) if (Math.abs((t.x - u.x) * dy - (t.y - u.y) * dx) <= 0) this.dealDamage(u, t, base, kind, false);
        break;
      }
      case "starBlind":
        for (const t of foes()) { t.targetUid = null; t.silenceTicks = Math.max(t.silenceTicks, 15); t.slowTicks = Math.max(t.slowTicks, 25); }
        break;
      case "rewind": {
        const dead = [...this.deathHistory].reverse().find((d) => d.side === u.side && !d.alive);
        if (dead) { dead.alive = true; dead.hp = Math.max(1, Math.round(dead.maxHp * 0.4)); dead.mana = 0; dead.ghostTicks = 0; this.events.push({ type: "buff", uid: dead.uid, fx: "heal" }); }
        break;
      }
      case "ironCharge": {
        let stolen = 0;
        for (const t of foes()) if (cheb(t, target) <= 1) { const take = Math.min(25, Math.max(0, Math.round(t.armor * 0.35))); t.armor -= take; stolen += take; this.recordScrap(t, "armor"); }
        u.armor += Math.min(80, stolen);
        u.x = Math.max(0, Math.min(6, target.x)); u.y = Math.max(0, Math.min(7, target.y + 1));
        for (const t of foes()) if (cheb(t, target) <= 1) this.dealDamage(u, t, base + stolen * 3, "physical", false);
        break;
      }
      case "fearTrap":
        for (const t of foes()) if (cheb(t, target) <= 1) { this.dealDamage(u, t, base, "magic", false); t.fearTicks = Math.max(t.fearTicks, this.bossFight ? 5 : 15); }
        break;
      case "manaEqualize": {
        const team = allies(); const total = team.reduce((sum, a) => sum + a.mana, 0); const each = total / Math.max(1, team.length);
        for (const a of team) a.mana = Math.min(a.maxMana * 0.9, each);
        break;
      }
      case "corrode":
        this.dealDamage(u, target, base, "magic", false); target.atk = Math.max(1, Math.round(target.atk * 0.75)); target.armor = Math.max(0, Math.round(target.armor * 0.65)); target.atkSpeed *= 0.8; this.recordScrap(target, "armor");
        break;
      case "corpseFeast": {
        const corpse = this.deathHistory.find((d) => d.side !== u.side && !this.consumedCorpses.has(d.uid));
        if (corpse) { this.consumedCorpses.add(corpse.uid); const add = 60; u.maxHp += add; u.hp += add; const owned = this.runRef.roster.find((x) => x.iid === u.ownerIid); if (owned) owned.hpBonus = (owned.hpBonus ?? 0) + add; }
        break;
      }
      case "timeVortex":
        for (const t of foes()) if (cheb(t, target) <= 2) { t.x += Math.sign(target.x - t.x); t.y += Math.sign(target.y - t.y); t.slowTicks = Math.max(t.slowTicks, 40); t.silenceTicks = Math.max(t.silenceTicks, 10); }
        break;
      case "decoys":
        u.decoyCharges = Math.min(3, u.decoyCharges + 3); this.floats.push({ x: u.x, y: u.y, text: "🃏分身×3", cls: "cast" });
        break;
      case "scavenge": {
        const roll = Math.floor(Math.random() * 3);
        if (roll === 0) this.bonusGold = Math.min(3, this.bonusGold + 1);
        for (const a of allies()) { if (roll === 1) a.hp = Math.min(a.maxHp, a.hp + Math.round(base)); if (roll === 2) a.mana = Math.min(a.maxMana - 1, a.mana + 15); }
        break;
      }
      case "vampireBat": {
        const before = target.alive; const dealt = this.dealDamage(u, target, base, "magic", false); u.hp = Math.min(u.maxHp, u.hp + dealt);
        if (before && !target.alive) { u.atk = Math.round(u.atk * 1.15); u.atkSpeed *= 1.1; }
        break;
      }
      case "echoDaggers":
        u.daggerTicks = 80; this.floats.push({ x: u.x, y: u.y, text: "🗡追尾短剣", cls: "cast" });
        break;
      case "statGamble": {
        const oldAtk = target.atk, oldArmor = target.armor;
        target.atk = Math.max(10, Math.min(oldAtk * 2, oldArmor * 2));
        target.armor = Math.max(0, Math.min(150, Math.round(oldAtk / 2)));
        this.floats.push({ x: target.x, y: target.y, text: "🎲攻防交換", cls: "cast" });
        break;
      }
      case "signature":
        this.castSignature(u, target, base, kind, powerScale);
        break;
    }
    if (!isEcho) {
      if (u.itemId === "staff2" && u.itemCastCount <= 5) u.spellPower += 20;
      if (u.itemId === "sword_crystal" && u.itemCastCount <= 3) u.atk = Math.round(u.atk * 1.2);
      if (u.itemId === "shield_staff") this.recordShield(u, u, 90 * (1 + u.spellPower / 100));
      if (u.itemId === "shield_crystal" && firstItemCast) for (const a of allies()) this.recordShield(u, a, 100 + u.armor * 2);
      if (u.itemId === "orb_crystal" && firstItemCast) this.itemHeal(u, u.maxHp * 0.25);
      if (u.itemId === "blade_crystal") this.itemHeal(u, u.maxHp * 0.08);
      if (u.itemId === "staff_crystal") u.mana = Math.min(u.maxMana - 1, u.mana + Math.round(u.maxMana * 0.2));
      if (u.itemId === "crystal2" && firstItemCast && u.alive) {
        const echoTarget = target.alive ? target : this.acquireTarget(u);
        if (echoTarget) this.cast(u, echoTarget, 0.5, true, sk);
      }
      u.itemGuaranteedCrit = false;
    }
    if (!isEcho && u.alive && u.manaRefundPct > 0) {
      u.mana = Math.min(u.maxMana - 1, Math.round(u.maxMana * u.manaRefundPct));
      this.floats.push({ x: u.x, y: u.y, text: `+${u.mana}マナ`, cls: "heal" });
    }
    // 共鳴追撃はマナを消費せず、さらに共鳴を起こさない
    if (!isEcho && this.resonatorTier > 0 && u.traits.includes("resonator")) {
      const echoScale = [0, 0.35, 0.5, 0.65][this.resonatorTier];
      const echoes = this.units.filter(
        (e) => e.alive && e.uid !== u.uid && e.side === u.side && e.traits.includes("resonator") && !e.traits.includes("commander") && Math.max(Math.abs(e.x - u.x), Math.abs(e.y - u.y)) <= 1,
      );
      for (const echo of echoes) {
        const echoTarget = target.alive ? target : this.acquireTarget(echo);
        if (echoTarget) this.cast(echo, echoTarget, echoScale, true, sk);
      }
    }
    if (!isEcho) {
      for (const knife of this.units.filter((x) => x.alive && x.side === u.side && x.daggerTicks > 0 && x.uid !== u.uid)) {
        const knifeTarget = this.acquireTarget(knife);
        if (knifeTarget) { this.events.push({ type: "skillshot", fromUid: knife.uid, toX: knifeTarget.x, toY: knifeTarget.y, fx: "phys" }); this.dealDamage(knife, knifeTarget, knife.atk * 0.7, "physical", false); }
      }
    }
  }

  /** コスト3以上のユニット専用スキル。名前ごとに盤面へ固有の変化を起こす。 */
  private castSignature(
    u: CombatUnit,
    target: CombatUnit,
    base: number,
    kind: "physical" | "magic",
    powerScale: number,
  ) {
    const foes = () => this.units.filter((t) => t.alive && t.side !== u.side);
    const allies = () => this.units.filter((t) => t.alive && t.side === u.side);
    const dist = (a: CombatUnit, b: CombatUnit) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const hit = (t: CombatUnit, amount = base, damageKind = kind) => this.dealDamage(u, t, amount, damageKind, false);
    const burst = (center: CombatUnit, radius: number, amount = base, damageKind = kind) => {
      this.events.push({ type: "aoe", x: center.x, y: center.y, kind: u.skill?.fx === "shadow" ? "shadow" : u.skill?.fx === "bolt" ? "bolt" : u.skill?.fx === "ice" ? "frost" : u.skill?.fx === "fire" ? "fire" : "phys" });
      for (const t of foes()) if (dist(t, center) <= radius) hit(t, amount, damageKind);
    };
    const heal = (a: CombatUnit, amount: number) => {
      const boosted = u.itemId === "staff_orb" ? amount * 1.3 : amount;
      const actual = Math.max(0, Math.min(a.maxHp - a.hp, Math.round(boosted)));
      a.hp += actual;
      this.report(u).healing += actual;
      if (actual > 0) { this.floats.push({ x: a.x, y: a.y, text: `+${actual}`, cls: "heal" }); this.events.push({ type: "buff", uid: a.uid, fx: "heal" }); }
    };
    const farthest = () => [...foes()].sort((a, b) => dist(b, u) - dist(a, u))[0] ?? target;
    const densest = () => [...foes()].sort((a, b) => foes().filter((x) => dist(x, b) <= 1).length - foes().filter((x) => dist(x, a) <= 1).length)[0] ?? target;
    const lineHit = (end: CombatUnit, amount = base) => {
      const dx = end.x - u.x, dy = end.y - u.y;
      for (const t of foes()) if (Math.abs((t.x - u.x) * dy - (t.y - u.y) * dx) <= Math.max(1, Math.abs(dx) + Math.abs(dy)) * 0.25) hit(t, amount);
    };

    switch (u.skill?.name) {
      // ----- コスト3 -----
      case "星落とし": { const c = densest(); burst(c, 1); hit(c, base * 0.55, "magic"); for (const t of foes()) if (dist(t, c) === 1) { t.x += Math.sign(t.x - c.x); t.y += Math.sign(t.y - c.y); } break; }
      case "竜槍滑空": { const t = farthest(); lineHit(t, base * 0.75); u.x = Math.max(0, Math.min(6, t.x - Math.sign(t.x - u.x))); u.y = Math.max(0, Math.min(7, t.y - Math.sign(t.y - u.y))); for (const e of foes()) if (dist(e, t) <= 1) e.armor = Math.max(0, e.armor - 18); break; }
      case "冥府の契約": { const dead = this.deathHistory.filter((d) => d.side === u.side).length; this.recordShield(u, u, base * 0.8); burst(u, 1, base * (0.65 + Math.min(0.75, dead * 0.15)), "physical"); break; }
      case "六道斬": { let strikes = 4; while (strikes-- > 0) { const t = [...foes()].sort((a, b) => a.hp - b.hp)[0]; if (!t) break; const wasAlive = t.alive; hit(t, base * 0.38, "physical"); if (wasAlive && !t.alive) strikes += 2; } break; }
      case "雷門": { const pair = [...foes()].sort((a, b) => b.mana - a.mana).slice(0, 2); for (let i = 0; i < 3; i++) for (const t of pair) if (t.alive) { hit(t, base * 0.42, "magic"); t.slowTicks = Math.max(t.slowTicks, 18); } break; }
      case "聖域展開": for (const a of allies()) if (dist(a, u) <= 2) { this.recordShield(u, a, base * 0.7); heal(a, base * 0.25); } break;
      case "火山核": { hit(target, base * 0.55, "magic"); target.poisonTicks = 40; target.poisonPerHit = Math.max(target.poisonPerHit, Math.round(base * 0.22)); burst(target, 1, base * 0.65, "magic"); break; }
      case "風雷環": { const near = [...foes()].sort((a, b) => dist(a, u) - dist(b, u)).slice(0, 5); near.forEach((t, i) => { this.events.push({ type: "skillshot", fromUid: u.uid, toX: t.x, toY: t.y, fx: "bolt" }); hit(t, base * (0.34 + i * 0.04), "magic"); }); break; }
      case "影縫い": { const t = farthest(); lineHit(t); for (const e of foes()) if (dist(e, t) <= 1) e.stunTicks = Math.max(e.stunTicks, Math.round(12 * powerScale)); break; }
      case "猛進再突撃": { const c = densest(); lineHit(c, base * 0.55); burst(c, 1, base * 0.65, "physical"); lineHit(c, base * 0.4); break; }
      case "未来の選定": { const a = [...allies()].sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]; if (a) { this.recordShield(u, a, base * 0.8); heal(a, base * 0.55); } break; }
      case "灰より還る": { burst(target, 1, base, "magic"); this.recordShield(u, u, base * 0.45); u.ghostRevived = false; break; }
      case "断層隆起": { lineHit(target, base * 0.9); for (const t of foes()) if (dist(t, target) <= 1) { t.x = Math.max(0, Math.min(6, t.x + Math.sign(t.x - u.x))); t.stunTicks = Math.max(t.stunTicks, 8); } break; }
      case "狐火輪舞": { const wounded = [...allies()].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; for (let i = 0; i < 3; i++) { const t = foes()[i % Math.max(1, foes().length)]; if (t) hit(t, base * 0.24, "magic"); } if (wounded) { this.recordShield(u, wounded, base * 0.4); heal(wounded, base * 0.3); } u.decoyCharges = Math.min(3, u.decoyCharges + 1); break; }
      case "貪欲な偽装": { const dealt = hit(target, base, "physical"); heal(u, dealt * 0.8); this.recordShield(u, u, Math.min(base, u.maxHp * 0.25)); target.targetUid = u.uid; break; }
      case "反響する静寂": { const t = farthest(); burst(t, 1, base, "magic"); for (const e of foes()) if (dist(e, t) <= 1) e.silenceTicks = Math.max(e.silenceTicks, 24); hit(t, base * 0.45, "magic"); break; }
      case "生ける贋作": { if (target.skill && !["mirrorStrike", "allyCopy"].includes(target.skill.type) && !["生ける贋作", "同胞完全擬態", "双貌の大勝負"].includes(target.skill.name)) this.cast(u, target, 0.7 * powerScale, true, target.skill); hit(target, base * 0.5, "magic"); target.atk = Math.max(1, Math.round(target.atk * 0.9)); break; }
      case "重圧圧縮命令": { const c = densest(); for (const t of foes()) if (dist(t, c) <= 2) { t.x += Math.sign(c.x - t.x); t.y += Math.sign(c.y - t.y); t.slowTicks = Math.max(t.slowTicks, 35); t.atkCd += 10; } burst(c, 1, base, "magic"); break; }
      case "双星霊薬": { const pair = [...allies()].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 2); for (const a of pair) { heal(a, base); this.recordShield(u, a, base * 0.35); } break; }
      case "運命の六面体": { const roll = 1 + Math.floor(Math.random() * 6); this.floats.push({ x: u.x, y: u.y, text: `🎲${roll}`, cls: "cast" }); if (roll === 1) u.hp = Math.max(1, u.hp - Math.round(u.maxHp * 0.2)); if (roll === 2) target.slowTicks = 35; if (roll === 3) { target.poisonTicks = 40; target.poisonPerHit = Math.round(base / 4); } if (roll === 4) burst(target, 1, base, "magic"); if (roll === 5) target.stunTicks = this.bossFight ? 8 : 25; if (roll === 6) hit(target, this.bossFight ? Math.min(base * 2, target.maxHp * 0.18) : base * 3, "magic"); break; }
      case "同胞完全擬態": { const copy = allies().filter((a) => a.uid !== u.uid && a.skill && !["mirrorStrike", "allyCopy"].includes(a.skill.type) && !["生ける贋作", "同胞完全擬態", "双貌の大勝負"].includes(a.skill.name)).sort((a, b) => dist(a, u) - dist(b, u))[0]; if (copy?.skill) this.cast(u, target, 0.9 * powerScale, true, copy.skill); u.atk = Math.round(u.atk * 1.15); u.armor += 10; break; }
      case "星なき夜": for (const t of foes()) { hit(t, base * 0.3, "magic"); t.targetUid = null; t.silenceTicks = Math.max(t.silenceTicks, 18); t.slowTicks = Math.max(t.slowTicks, 30); if (t.range > 1) t.range = Math.max(1, t.range - 2); } break;
      case "飛散腐食液": { const c = target; burst(c, 1, base * 0.55, "magic"); for (const t of foes()) if (dist(t, c) <= 1) { t.atk = Math.round(t.atk * 0.78); t.armor = Math.max(0, Math.round(t.armor * 0.6)); t.atkSpeed *= 0.8; this.recordScrap(t, "armor"); } break; }
      case "戦肉捕食": { const corpse = this.deathHistory.find((d) => d.side !== u.side && !this.consumedCorpses.has(d.uid)); if (corpse) { this.consumedCorpses.add(corpse.uid); const add = 60; u.maxHp += add; u.hp += add; u.atk += Math.max(4, Math.round(corpse.atk * 0.12)); const owned = this.runRef.roster.find((x) => x.iid === u.ownerIid); if (owned) owned.hpBonus = (owned.hpBonus ?? 0) + add; } else hit(target, base, "physical"); break; }
      case "戦利品散布": { const roll = Math.floor(Math.random() * 4); if (roll === 0) this.bonusGold = Math.min(3, this.bonusGold + 1); for (const a of allies()) { if (roll === 1) heal(a, base * 0.55); if (roll === 2) a.mana = Math.min(a.maxMana - 1, a.mana + 18); if (roll === 3) this.recordShield(u, a, base * 0.5); } break; }
      case "三響の星鐘": { burst(target, 1, base * 0.5, "magic"); for (const a of allies()) heal(a, base * 0.25); for (const t of foes()) t.silenceTicks = Math.max(t.silenceTicks, 10); break; }
      case "必中未来落星": { const picks = [...foes()].sort((a, b) => b.atk - a.atk).slice(0, 3); for (const t of picks) { hit(t, base * 0.62, "magic"); t.mana = Math.max(0, t.mana - 20); } u.mana = Math.min(u.maxMana - 1, u.mana + picks.length * 8); break; }
      case "奈落重力胞子": { target.poisonTicks = 50; target.poisonPerHit = Math.round(base / 5); for (const t of foes()) if (dist(t, target) <= 2) { t.x += Math.sign(target.x - t.x); t.y += Math.sign(target.y - t.y); t.slowTicks = Math.max(t.slowTicks, 25); } break; }

      // ----- コスト4 -----
      case "決戦命令": for (const a of allies()) { a.atk = Math.round(a.atk * 1.32); a.atkSpeed *= 1.18; a.mana = Math.min(a.maxMana - 1, a.mana + 12); a.shield += Math.round(base * 0.35); } break;
      case "救済の翼": { const saved = [...allies()].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 3); for (const a of saved) { a.decoyCharges = Math.min(5, a.decoyCharges + 2); heal(a, base); burst(a, 1, base * 0.35, "magic"); } break; }
      case "超電導嵐": for (const t of foes()) { hit(t, base * 0.58, "magic"); if (t.alive) { t.slowTicks = Math.max(t.slowTicks, 20); const near = foes().find((x) => x.uid !== t.uid && dist(x, t) <= 1); if (near) hit(near, base * 0.28, "magic"); } } break;
      case "魂の徴収": { const t = [...foes()].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? target; const before = t.alive; hit(t, t.hp / t.maxHp <= 0.3 && !this.bossFight ? t.hp + t.shield : base, "physical"); if (before && !t.alive) { u.mana = Math.min(u.maxMana - 1, u.mana + Math.round(u.maxMana * 0.65)); u.atk = Math.round(u.atk * 1.12); } break; }
      case "氷河宮殿": { const c = densest(); burst(c, 2, base * 0.72, "magic"); for (const t of foes()) if (dist(t, c) <= 2) { t.slowTicks = 45; t.stunTicks = Math.max(t.stunTicks, this.bossFight ? 8 : 18); } break; }
      case "照準砲列": { const row = target.y; for (let x = 0; x < 7; x++) { this.events.push({ type: "aoe", x, y: row, kind: "fire" }); for (const t of foes()) if (t.x === x && Math.abs(t.y - row) <= 1) hit(t, base * 0.45, "magic"); } break; }
      case "英霊降下": { const dead = this.deathHistory.filter((d) => d.side === u.side).slice(-3); for (const d of dead) { for (const t of foes()) if (dist(t, d) <= 1) hit(t, base * 0.45, "physical"); for (const a of allies()) if (dist(a, d) <= 1) heal(a, base * 0.35); } if (!dead.length) for (const a of allies()) a.atk = Math.round(a.atk * 1.22); break; }
      case "幽界疾駆・共鳴": { const t = farthest(); const passed = allies().filter((a) => a.uid !== u.uid && Math.abs((a.x-u.x)*(t.y-u.y)-(a.y-u.y)*(t.x-u.x)) <= 1); for (const a of passed) a.shield += Math.round(base * 0.45); lineHit(t, base * (0.7 + passed.length * 0.15)); break; }
      case "血盟の不落旗": this.bannerUid = u.uid; this.bannerTicks = 50; u.shield += Math.round(u.maxHp * 0.2 + base * 0.6); for (const a of allies()) if (a.traits.includes("bloodpact")) a.atk = Math.round(a.atk * 1.15); break;
      case "紅月断": { u.hp = Math.max(1, u.hp - Math.round(u.maxHp * 0.18)); const pact = allies().filter((a) => a.traits.includes("bloodpact")).length; lineHit(target, base * (1 + pact * 0.12)); break; }
      case "三秒前の残響": { const dead = [...this.deathHistory].reverse().find((d) => d.side === u.side && !d.alive); if (dead) { dead.alive = true; dead.hp = Math.min(dead.maxHp, Math.max(Math.round(dead.maxHp * 0.45), Math.round(base))); dead.mana = Math.round(dead.maxMana * 0.35); dead.ghostTicks = 0; dead.decoyCharges = Math.max(dead.decoyCharges, 1); this.events.push({ type: "buff", uid: dead.uid, fx: "heal" }); } else { const a = [...allies()].sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]; if (a) { heal(a, a.maxHp * 0.3 + base * 0.5); a.mana = Math.min(a.maxMana - 1, a.mana + 30); } } break; }
      case "装甲強奪突撃": { const c = densest(); let stolen = 0; for (const t of foes()) if (dist(t, c) <= 1) { const take = Math.min(30, Math.round(t.armor * 0.4)); t.armor -= take; stolen += take; this.recordScrap(t, "armor"); } u.armor += Math.min(100, stolen); burst(c, 1, base + stolen * 4, "physical"); for (const a of allies()) a.armor += Math.round(stolen / Math.max(1, allies().length)); break; }
      case "魔力の再編曲": { const team = allies(), before = new Map(team.map((a) => [a.uid, a.mana])); const each = team.reduce((s, a) => s + a.mana, 0) / Math.max(1, team.length); for (const a of team) { const old = before.get(a.uid) ?? 0; a.mana = Math.min(a.maxMana * 0.9, each); if (a.mana > old) a.atkSpeed *= 1.12; else a.shield += Math.round(base + 100); } break; }
      case "三つの災い顔": u.decoyCharges = Math.min(6, u.decoyCharges + 3); burst(target, 1, base * 0.45, "magic"); target.fearTicks = Math.max(target.fearTicks, 12); break;
      case "追奏短剣・狂詩曲": hit(target, base * 0.6, "physical"); u.daggerTicks = 100; u.atkSpeed *= 1.1; break;
      case "因果固定の錨": { const c = densest(); burst(c, 1, base * 0.7, "magic"); for (const t of foes()) if (dist(t, c) <= 1) { t.stunTicks = Math.max(t.stunTicks, this.bossFight ? 10 : 28); t.mana = Math.max(0, t.mana - 25); } break; }
      case "巡る血月障壁": { const weak = [...allies()].sort((a,b) => a.hp/a.maxHp-b.hp/b.maxHp).slice(0,3); for (const a of weak) a.shield += Math.round(base + u.maxHp * 0.08); if (weak.some((a) => a.shield > a.maxHp * 0.35)) burst(densest(), 1, base * 0.6, "magic"); break; }
      case "星血均衡": { const team = allies(); const avg = team.reduce((s,a)=>s+a.hp/a.maxHp,0)/Math.max(1,team.length); for (const a of team) { const desired = a.maxHp * avg; a.hp = Math.max(1, Math.min(a.maxHp, Math.round((a.hp + desired) / 2))); heal(a, base * 0.55); } break; }
      case "魂の万能薬": { const team = allies(); const critical = team.some((a)=>a.hp/a.maxHp<0.35); if (critical) for (const a of team) heal(a, base); else if (foes().filter((t)=>dist(t,target)<=1).length>=2) { burst(target,1,base,"magic"); for(const t of foes()) if(dist(t,target)<=1){t.poisonTicks=30;t.poisonPerHit=Math.round(base*0.18);} } else for(const a of team){a.atkSpeed*=1.18;a.mana=Math.min(a.maxMana-1,a.mana+18);} break; }
      case "双貌の大勝負": { const copy = allies().filter((a)=>a.uid!==u.uid&&a.skill&&!["mirrorStrike","allyCopy"].includes(a.skill.type)&&!["生ける贋作","同胞完全擬態","双貌の大勝負"].includes(a.skill.name))[0]; if (Math.random()<0.55 && copy?.skill) this.cast(u,target,0.9*powerScale,true,copy.skill); else if(target.skill&&!["mirrorStrike","allyCopy"].includes(target.skill.type)&&!["生ける贋作","同胞完全擬態","双貌の大勝負"].includes(target.skill.name)) this.cast(u,target,0.75*powerScale,true,target.skill); else hit(target,base,"magic"); break; }
      case "総攻城命令": { const mark=[...foes()].sort((a,b)=>(b.shield+b.armor*8)-(a.shield+a.armor*8))[0]??target; mark.armor=Math.max(0,Math.round(mark.armor*0.5)); for(const a of allies()){a.atk=Math.round(a.atk*1.18);a.shield+=Math.round(base*0.3);a.targetUid=mark.uid;} this.floats.push({x:mark.x,y:mark.y,text:"🎯攻略目標",cls:"cast"}); break; }

      // ----- コスト5 -----
      case "世界樹の芽吹き": for (const a of allies()) { heal(a, base * 0.8); a.shield += Math.round(base * 0.45); a.mana = Math.min(a.maxMana - 1, a.mana + 15); } for (const t of foes()) if (dist(t, u) <= 3) t.stunTicks = Math.max(t.stunTicks, 12); break;
      case "存在消去": { const c = densest(); for (const t of foes()) if (dist(t,c)<=1) { t.stunTicks=Math.max(t.stunTicks,this.bossFight?15:35); t.silenceTicks=Math.max(t.silenceTicks,35); hit(t,base*0.8,"magic"); } break; }
      case "一閃・無明": { const victims=[...foes()].sort((a,b)=>a.hp-b.hp).slice(0,6); for(const t of victims){this.events.push({type:"slash",x:t.x,y:t.y});const alive=t.alive;hit(t,base*0.48,"physical");if(alive&&!t.alive){const next=[...foes()].sort((a,b)=>a.hp-b.hp)[0];if(next)hit(next,base*0.38,"physical");}} break; }
      case "終末火山": { const c=densest(); for(let i=0;i<3;i++)burst(c,1,base*0.38,"magic"); for(const t of foes())if(dist(t,c)<=2){t.poisonTicks=50;t.poisonPerHit=Math.max(t.poisonPerHit,Math.round(base*0.12));} burst(c,2,base*0.75,"magic"); break; }
      case "時代逆行": for(const a of allies()){heal(a,a.maxHp*0.35+base*0.3);a.mana=Math.min(a.maxMana-1,a.mana+Math.round(a.maxMana*0.45));a.stunTicks=0;a.slowTicks=0;a.silenceTicks=0;a.fearTicks=0;} break;
      case "事象の地平線": { const c=densest(); const caught=foes().filter((t)=>dist(t,c)<=3); for(const t of caught){t.x+=Math.sign(c.x-t.x);t.y+=Math.sign(c.y-t.y);t.slowTicks=50;t.silenceTicks=18;} burst(c,2,base+caught.length*70,"magic"); break; }
      case "紅い夜": { let total=0; for(const t of foes()){const dealt=hit(t,base*0.32,"magic");total+=dealt;t.slowTicks=Math.max(t.slowTicks,20);} heal(u,total*0.7);u.atk=Math.round(u.atk*(1+Math.min(0.5,total/u.maxHp*0.2)));u.atkSpeed*=1.18;u.decoyCharges=Math.min(5,u.decoyCharges+2);break; }
      case "運命反転": { const enemy=[...foes()].sort((a,b)=>b.atk-a.atk)[0]??target; const ally=[...allies()].sort((a,b)=>a.atk-b.atk)[0]??u; const ea=enemy.atk, aa=ally.atk; enemy.atk=Math.max(10,Math.round(aa*0.8)); ally.atk=Math.round(ea*0.85); const armor=Math.min(80,enemy.armor);enemy.armor=Math.max(0,ally.armor);ally.armor+=Math.round(armor*0.5);hit(enemy,base*0.55,"magic");break; }
      default:
        hit(target);
    }
  }

  private dealDamage(
    src: CombatUnit,
    target: CombatUnit,
    raw: number,
    kind: "physical" | "magic",
    crit: boolean,
    shared = false,
  ): number {
    if (!shared && target.itemId === "shield_bow") {
      target.itemHitCount++;
      if (target.itemHitCount % 4 === 0) {
        this.floats.push({ x: target.x, y: target.y, text: "回避", cls: "heal" });
        return 0;
      }
    }
    if (!shared && this.bannerTicks > 0 && this.bannerUid !== target.uid && target.side === "ally") {
      const banner = this.units.find((x) => x.uid === this.bannerUid && x.alive);
      if (banner && chebDistance(banner, target) <= 2) return this.dealDamage(src, banner, raw, kind, crit, true);
    }
    if (target.decoyCharges > 0) {
      target.decoyCharges--;
      this.floats.push({ x: target.x, y: target.y, text: "MISS", cls: "cast" });
      return 0;
    }
    if (!shared && this.bloodpactTier > 0 && target.traits.includes("bloodpact")) {
      const pact = this.units.filter((u) => u.alive && u.side === target.side && u.traits.includes("bloodpact"));
      if (pact.length > 1) {
        let total = 0;
        for (const member of pact) {
          total += this.dealDamage(src, member, raw / pact.length, kind, crit, true);
          if (member.alive) member.mana = Math.min(member.maxMana, member.mana + [0, 2, 3, 4][this.bloodpactTier]);
        }
        return total;
      }
    }
    if (target.ghostTicks > 0) {
      this.floats.push({ x: target.x, y: target.y, text: "無効", cls: "heal" });
      return 0;
    }
    let dmg = raw;
    if (src.itemId === "sword_orb" && target.maxHp > src.maxHp) dmg *= 1.2;
    if (src.itemId === "sword_blade" && target.hp < target.maxHp * 0.3) dmg *= 1.25;
    if (src.itemGuaranteedCrit) {
      crit = true;
      if (kind === "physical") dmg *= src.critMult;
    } else if (kind === "magic" && src.itemId === "staff_claw") {
      crit = src.itemGuaranteedCrit || Math.random() < src.critChance;
    }
    if (this.openingStopTicks > 0 && this.ticks <= this.openingStopTicks && src.traits.includes("clockwork")) dmg *= 0.5;
    if (kind === "physical") {
      const armorPen = src.itemId === "sword2" ? 0.35 : 0;
      dmg *= 100 / (100 + target.armor * (1 - armorPen));
    }
    if (kind === "magic" && crit) dmg *= src.critMult;
    dmg = Math.max(1, Math.round(dmg));

    const durabilityBefore = Math.max(0, target.hp) + Math.max(0, target.shield);
    let remain = dmg;
    const hadShield = target.shield > 0;
    if (hadShield) {
      const absorbed = Math.min(target.shield, remain);
      target.shield -= absorbed;
      remain -= absorbed;
    }
    if (hadShield && target.shield <= 0) this.recordScrap(target, "shield");
    target.hp -= remain;
    const actualDamage = Math.min(dmg, durabilityBefore);
    this.report(src).damageDealt += actualDamage;
    this.report(target).damageTaken += actualDamage;
    this.floats.push({
      x: target.x,
      y: target.y,
      text: String(dmg),
      cls: crit ? "crit" : kind === "magic" ? "magic" : "dmg",
    });
    this.events.push({ type: "hit", uid: target.uid, crit });
    if (target.itemId === "sword_shield") target.itemRevenge = true;
    if (target.itemId === "shield_claw" && target.itemHitCount < 6) { target.itemHitCount++; target.critChance += 0.05; }
    if (!shared && target.itemId === "shield_blade" && src.alive && kind === "physical") {
      this.dealDamage(target, src, dmg * 0.2, "physical", false, true);
    }
    if (src.itemId === "staff_blade" && kind === "magic" && dmg > 0) this.itemHeal(src, dmg * 0.2);
    if (src.ghostTicks > 0 && src.alive) src.hp = Math.min(src.maxHp, src.hp + Math.round(dmg * 0.2));
    if (target.hp <= 0) {
      target.hp = 0;
      this.finishDeath(target, src);
      if (src.itemId === "claw2" && crit) src.itemGuaranteedCrit = true;
    }
    return dmg;
  }

  private itemHeal(unit: CombatUnit, raw: number) {
    if (!unit.alive || raw <= 0) return;
    const amount = Math.max(1, Math.round(raw));
    const missing = Math.max(0, unit.maxHp - unit.hp);
    unit.hp = Math.min(unit.maxHp, unit.hp + amount);
    this.report(unit).healing += Math.min(amount, missing);
    const overflow = Math.max(0, amount - missing);
    const capPct = unit.itemId === "blade2" ? 0.3 : unit.itemId === "orb_blade" ? 0.2 : 0;
    if (overflow > 0 && capPct > 0) unit.shield = Math.min(Math.round(unit.maxHp * capPct), unit.shield + overflow);
    this.events.push({ type: "buff", uid: unit.uid, fx: "heal" });
  }

  private recordScrap(target: CombatUnit, kind: "shield" | "armor") {
    const cap = [0, 2, 4, 6][this.dismantlerTier];
    const key = `${target.uid}:${kind}`;
    if (cap <= 0 || this.scrapGained >= cap || target.side !== "enemy" || this.scrappedTargets.has(key)) return;
    this.scrappedTargets.add(key);
    this.scrapGained++;
  }

  private applyParasite(target: CombatUnit, splits: number) {
    if (!target.alive || target.parasitePct > 0) return;
    target.parasitePct = [0, 0.015, 0.02, 0.03][this.parasiteTier];
    target.parasiteSplits = splits;
    this.floats.push({ x: target.x, y: target.y, text: "🪱寄生", cls: "poison" });
  }

  private finishDeath(target: CombatUnit, killer: CombatUnit | null) {
    if (!target.alive) return;
    if (target.skill?.name === "灰より還る" && !target.ghostRevived) {
      target.ghostRevived = true;
      target.hp = Math.max(1, Math.round(target.maxHp * 0.35));
      target.shield = Math.round(target.maxHp * 0.2);
      target.decoyCharges = Math.max(target.decoyCharges, 1);
      this.events.push({ type: "aoe", x: target.x, y: target.y, kind: "fire" });
      for (const enemy of this.units.filter((u) => u.alive && u.side !== target.side && chebDistance(u, target) <= 1)) {
        this.dealDamage(target, enemy, target.maxHp * 0.18, "magic", false);
      }
      this.floats.push({ x: target.x, y: target.y, text: "🔥再誕", cls: "heal" });
      return;
    }
    if (this.ghostTier > 0 && target.traits.includes("ghost") && !target.ghostRevived) {
      target.ghostRevived = true;
      target.ghostTicks = [0, 40, 60, 80][this.ghostTier];
      target.hp = Math.max(1, Math.round(target.maxHp * [0, 0.2, 0.25, 0.3][this.ghostTier]));
      target.shield = 0;
      this.floats.push({ x: target.x, y: target.y, text: "👻霊体", cls: "heal" });
      return;
    }
    target.alive = false;
    target.hp = 0;
    this.events.push({ type: "death", uid: target.uid });
    this.deathHistory.push(target);
    if (killer?.alive) killer.targetUid = null;

    if (target.side === "ally") {
      this.twilightDeaths++;
      if (this.runRef.ancientRelics.includes("treasureAltar") && target.itemId) {
        const heir = this.units.filter((u) => u.alive && u.side === "ally").sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (heir) { heir.atk = Math.round(heir.atk * 1.3); heir.armor += 25; heir.spellPower += 35; heir.atkSpeed *= 1.2; heir.mana = Math.min(heir.maxMana - 1, heir.mana + 35); this.floats.push({ x: heir.x, y: heir.y, text: "継承", cls: "heal" }); }
      }
      if (this.runRef.ancientRelics.includes("twilightBell") && this.twilightDeaths >= 3 && !this.twilightTriggered) {
        this.twilightTriggered = true;
        for (const ally of this.units.filter((u) => u.alive && u.side === "ally")) { ally.mana = ally.maxMana; ally.atkSpeed *= 1.5; this.events.push({ type: "buff", uid: ally.uid, fx: "heal" }); }
      }
    }

    // 寄生虫本人の死亡で最寄りの敵へ。寄生先死亡時は最大2体へ伝染
    if (this.parasiteTier > 0 && target.traits.includes("parasite")) {
      const nearest = this.units.filter((u) => u.alive && u.side !== target.side).sort((a, b) => chebDistance(a, target) - chebDistance(b, target))[0];
      if (nearest) this.applyParasite(nearest, [0, 1, 2, 3][this.parasiteTier]);
    }
    if (target.parasitePct > 0 && target.parasiteSplits > 0) {
      const next = this.units.filter((u) => u.alive && u.side === target.side && u.parasitePct <= 0).sort((a, b) => chebDistance(a, target) - chebDistance(b, target)).slice(0, 2);
      for (const n of next) this.applyParasite(n, target.parasiteSplits - 1);
    }
    if (killer) for (const ud of this.units) {
      if (ud.alive && ud.side === killer.side && ud.undeadBonus > 0) ud.atk = Math.round(ud.atk * (1 + ud.undeadBonus));
    }
  }
}

function chebDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
