import { ascMods } from "./ascension";
import { ACT_RULE_BY_ID } from "./data/actrules";
import { TRAITS, UNIT_BY_ID } from "./data/units";
import type { EnemyTeam } from "./data/enemies";
import { starMult } from "./state";
import type { OwnedUnit, RunState, SkillDef, TraitId } from "./types";

export const TICK_MS = 100; // 10 tick/秒
const MOVE_CD = 4; // 4tickごとに1マス移動
const MAX_TICKS = 900; // 90秒で強制終了
/** クリティカル時のダメージ倍率 */
export const CRIT_MULT = 1.6;
/** 敵のクリティカル率 */
export const ENEMY_CRIT_CHANCE = 0.05;

export interface CombatUnit {
  uid: number;
  side: "ally" | "enemy";
  name: string;
  icon: string;
  star: number;
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
  range: number;
  mana: number;
  maxMana: number;
  skill: SkillDef | null;
  lifesteal: number; // 0-1（通常攻撃ダメージの回復割合）
  berserkBonus: number; // 狂戦士: HP半分以下時の攻撃力倍率ボーナス
  undeadBonus: number; // 死霊: キルごとの攻撃力上昇率
  manaGainMult: number; // 精霊: マナ獲得倍率
  poisonTicks: number; // 毒の残りtick
  poisonPerHit: number; // 毒の1回あたりダメージ（10tickごと）
  stunTicks: number; // スタンの残りtick
  alive: boolean;
  atkCd: number;
  moveCd: number;
  slowTicks: number;
  targetUid: number | null;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  cls: "dmg" | "crit" | "magic" | "heal" | "cast" | "poison";
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
  return {
    hp:
      (1 + (asc.enemyHpPct + (rule.enemyHpPct ?? 0)) / 100) *
      (nodeType === "boss" ? 1 + asc.bossHpPct / 100 : 1),
    atk: 1 + (asc.enemyAtkPct + (rule.enemyAtkPct ?? 0)) / 100,
    as: 1 + (asc.enemyAsPct + (rule.enemyAsPct ?? 0)) / 100,
    armor: asc.enemyArmor,
  };
}

/** 盤面のユニット構成からシナジー状態を計算（ユニット種類でカウント） */
export function computeTraits(board: OwnedUnit[]): TraitStatus[] {
  const byTrait = new Map<TraitId, Set<string>>();
  for (const u of board) {
    for (const t of UNIT_BY_ID.get(u.defId)!.traits) {
      if (!byTrait.has(t)) byTrait.set(t, new Set());
      byTrait.get(t)!.add(u.defId);
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
        x: u.pos?.x ?? 0,
        y: u.pos?.y ?? 0,
        hp: Math.round(def.hp * m),
        maxHp: Math.round(def.hp * m),
        shield: 0,
        atk: Math.round(def.atk * m),
        atkSpeed: def.atkSpeed,
        armor: def.armor,
        spellPower: 0,
        critChance: 0.1,
        range: def.range,
        mana: 0,
        maxMana: def.skill.mana,
        skill: def.skill,
        lifesteal: 0,
        berserkBonus: 0,
        undeadBonus: 0,
        manaGainMult: 1,
        poisonTicks: 0,
        poisonPerHit: 0,
        stunTicks: 0,
        alive: true,
        atkCd: 0,
        moveCd: 0,
        slowTicks: 0,
        targetUid: null,
      };
      // シナジー適用（3段階）
      if (def.traits.includes("warrior")) cu.armor += [0, 20, 45, 80][tierOf("warrior")];
      if (def.traits.includes("ranger")) cu.atkSpeed *= 1 + [0, 0.25, 0.6, 1.1][tierOf("ranger")];
      if (def.traits.includes("mage")) cu.spellPower += [0, 35, 80, 150][tierOf("mage")];
      if (def.traits.includes("assassin")) cu.critChance += [0, 0.3, 0.6, 1.0][tierOf("assassin")];
      if (def.traits.includes("berserker")) cu.berserkBonus = [0, 0.5, 0.9, 1.4][tierOf("berserker")];
      if (def.traits.includes("undead")) cu.undeadBonus = [0, 0.1, 0.18, 0.3][tierOf("undead")];
      if (def.traits.includes("spirit")) cu.manaGainMult = 1 + [0, 0.3, 0.6, 1.0][tierOf("spirit")];
      // 装備アイテム
      switch (u.item) {
        case "sword": cu.atk = Math.round(cu.atk * 1.3); break;
        case "shield": cu.armor += 30; break;
        case "staff": cu.spellPower += 40; break;
        case "bow": cu.atkSpeed *= 1.25; break;
        case "orb": cu.maxHp += 300; cu.hp += 300; break;
        case "blade": cu.lifesteal += 0.2; break;
        case "crystal": cu.mana += 50; break;
        case "claw": cu.critChance += 0.3; break;
        // 合成アイテム
        case "sword2": cu.atk = Math.round(cu.atk * 1.7); break;
        case "shield2": cu.armor += 70; cu.maxHp += 150; cu.hp += 150; break;
        case "staff2": cu.spellPower += 100; break;
        case "bow2": cu.atkSpeed *= 1.6; break;
        case "orb2": cu.maxHp += 700; cu.hp += 700; break;
        case "blade2": cu.lifesteal += 0.4; cu.atk = Math.round(cu.atk * 1.15); break;
        case "crystal2": cu.mana += 999; break;
        case "claw2": cu.critChance += 0.6; break;
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
      if (rule.startMana) cu.mana += rule.startMana; // 幕の掟: 荒ぶる嵐
      cu.mana = Math.min(cu.mana, cu.maxMana - 10); // 開幕即発動は防ぐ
      return cu;
}

/** 準備画面のステータス表示用: 守護者シールドまで含めた実効ステータス */
export function previewAllyStats(run: RunState, u: OwnedUnit): CombatUnit {
  const board = run.roster.filter((x) => x.pos !== null);
  const traits = computeTraits(board);
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

  constructor(run: RunState, team: EnemyTeam, nodeType: "battle" | "elite" | "boss" = "battle") {
    const board = run.roster.filter((u) => u.pos !== null);
    const traits = computeTraits(board);
    const tierOf = (t: TraitId) => traits.find((s) => s.trait === t)?.tier ?? 0;

    for (const u of board) {
      this.units.push(buildAllyUnit(run, u, traits, this.nextUid++));
    }
    // 守護者: 味方全員にシールド
    const gTier = tierOf("guardian");
    if (gTier > 0) {
      const pct = [0, 0.12, 0.25, 0.45][gTier];
      for (const cu of this.units) cu.shield += Math.round(cu.maxHp * pct);
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
        range: s.def.range,
        mana: 0,
        maxMana: s.def.skill?.mana ?? 999,
        skill: s.def.skill ?? null,
        lifesteal: 0,
        berserkBonus: 0,
        undeadBonus: 0,
        manaGainMult: 1,
        poisonTicks: 0,
        poisonPerHit: 0,
        stunTicks: 0,
        alive: true,
        atkCd: 0,
        moveCd: 0,
        slowTicks: 0,
        targetUid: null,
      });
    }
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
    if (u.berserkBonus > 0 && u.hp < u.maxHp * 0.5) {
      return Math.round(u.atk * (1 + u.berserkBonus));
    }
    return u.atk;
  }

  tick() {
    this.floats = [];
    this.events = [];
    this.ticks++;
    // 僧侶: 毎秒リジェネ
    if (this.allyRegen > 0 && this.ticks % 10 === 0) {
      for (const u of this.units) {
        if (u.alive && u.side === "ally" && u.hp < u.maxHp) {
          u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.round(u.maxHp * this.allyRegen)));
        }
      }
    }
    for (const u of this.units) {
      if (!u.alive) continue;
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
      if (u.slowTicks > 0) u.slowTicks--;
      if (u.atkCd > 0) u.atkCd--;
      if (u.moveCd > 0) u.moveCd--;

      const target = this.acquireTarget(u);
      if (!target) continue;

      if (u.skill && u.mana >= u.maxMana) {
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
      u.alive = false;
      u.poisonTicks = 0;
      this.events.push({ type: "death", uid: u.uid });
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

  private attack(u: CombatUnit, target: CombatUnit) {
    const slowMult = u.slowTicks > 0 ? 0.7 : 1;
    u.atkCd = Math.max(2, Math.round(10 / (u.atkSpeed * slowMult)));
    const crit = Math.random() < u.critChance;
    const dmg = this.atkOf(u) * (crit ? CRIT_MULT : 1);
    this.events.push({ type: "attack", fromUid: u.uid, toUid: target.uid, ranged: u.range > 1 });
    const dealt = this.dealDamage(u, target, dmg, "physical", crit);
    if (u.lifesteal > 0 && dealt > 0) {
      u.hp = Math.min(u.maxHp, u.hp + Math.round(dealt * u.lifesteal));
    }
    u.mana += Math.round(10 * u.manaGainMult);
    if (target.alive) target.mana += Math.round(5 * target.manaGainMult);
  }

  private cast(u: CombatUnit, target: CombatUnit) {
    const sk = u.skill!;
    u.mana = 0;
    u.atkCd = Math.max(u.atkCd, 3);
    const base =
      sk.scaling === "attack"
        ? (this.atkOf(u) * sk.power) / 100
        : sk.power * (1 + u.spellPower / 100);
    this.floats.push({ x: u.x, y: u.y, text: sk.name, cls: "cast" });
    this.events.push({ type: "cast", uid: u.uid });

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
            if (sk.type === "frost" && t.alive) t.slowTicks = 30;
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
        u.shield += Math.round(base);
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
          target.stunTicks = 15;
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
          a.shield += amount;
          this.events.push({ type: "buff", uid: a.uid, fx: "shield" });
        }
        this.floats.push({ x: u.x, y: u.y, text: `🛡全体+${amount}`, cls: "cast" });
        break;
      }
      case "frenzy": {
        // 自己強化（この戦闘中ずっと持続）
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
              t.stunTicks = Math.max(t.stunTicks, 20);
              this.floats.push({ x: t.x, y: t.y, text: "🧊", cls: "cast" });
            }
          }
        }
        break;
      }
    }
  }

  private dealDamage(
    src: CombatUnit,
    target: CombatUnit,
    raw: number,
    kind: "physical" | "magic",
    crit: boolean,
  ): number {
    let dmg = raw;
    if (kind === "physical") dmg = raw * (100 / (100 + target.armor));
    if (kind === "magic" && crit) dmg *= CRIT_MULT;
    dmg = Math.max(1, Math.round(dmg));

    let remain = dmg;
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, remain);
      target.shield -= absorbed;
      remain -= absorbed;
    }
    target.hp -= remain;
    this.floats.push({
      x: target.x,
      y: target.y,
      text: String(dmg),
      cls: crit ? "crit" : kind === "magic" ? "magic" : "dmg",
    });
    this.events.push({ type: "hit", uid: target.uid, crit });
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      this.events.push({ type: "death", uid: target.uid });
      if (src.alive) src.targetUid = null;
      // 死霊: 倒した側の死霊ユニットの攻撃力が上昇
      for (const ud of this.units) {
        if (ud.alive && ud.side === src.side && ud.undeadBonus > 0) {
          ud.atk = Math.round(ud.atk * (1 + ud.undeadBonus));
        }
      }
    }
    return dmg;
  }
}
