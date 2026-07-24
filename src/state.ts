import { ascMods } from "./ascension";
import { rollActRule } from "./data/actrules";
import { rollItem, rollRelicChoices } from "./data/relics";
import { UNIT_BY_ID } from "./data/units";
import { FLOOR_COUNT, generateMap } from "./map";
import { grantUnlock, hasAchievementMilestone, hasLegacy, legacyLevel, meta, saveMeta } from "./meta";
import type { OwnedUnit, RunState, UnitDef } from "./types";

export const BOARD_COLS = 7;
export const BOARD_ROWS = 8; // 上4行=敵陣, 下4行=自陣
export const BENCH_SIZE = 8;

export function newRun(starterDefIds: string[], asc = 0): RunState {
  const mods = ascMods(asc);
  const maxHp = 50 + mods.startHp - mods.maxHpLoss;
  const run: RunState = {
    playerHp: maxHp,
    playerMaxHp: maxHp,
    gold: 10 + mods.startGold + legacyLevel("start_gold_") * 3 + (hasAchievementMilestone(10) ? 3 : 0),
    act: 1,
    asc,
    actRule: rollActRule(),
    startedAt: Date.now(),
    damageTaken: 0,
    floorIndex: 0,
    currentNodeId: null,
    map: generateMap(),
    markedNodeIds: [],
    roster: [],
    nextIid: 1,
    battleCount: 0,
    relics: [],
    ancientRelics: [],
    pendingAncientChoices: [],
    ancientRewardActs: [],
    carriedShopItems: [],
    shopItemRerolls: 0,
    shopRerollNodeId: null,
    legacyRewarded: false,
    potions: [],
    scrap: 0,
    relicItemDropBonus: 0,
    items: [],
  };
  for (const id of starterDefIds) {
    addUnit(run, UNIT_BY_ID.get(id)!);
  }
  // アセンションのバフ: 開始時アイテム・レリック
  for (let i = 0; i < mods.startItems; i++) run.items.push(rollItem());
  if (hasLegacy("start_item")) run.items.push(rollItem());
  if (hasAchievementMilestone(20)) run.items.push(rollItem());
  for (const r of rollRelicChoices([], mods.startRelics)) run.relics.push(r.id);
  if (hasAchievementMilestone(30)) {
    const reward = rollRelicChoices(run.relics, 1)[0];
    if (reward) run.relics.push(reward.id);
  }
  // 初期配置
  autoPlace(run);
  run.lastShownTeamCap = teamCap(run);
  meta().counters.totalRuns++;
  saveMeta();
  if (meta().counters.totalRuns >= 10) grantUnlock("runs10");
  return run;
}

/** 幕をまたいだ通算フロア（難易度・出現率の基準） */
export function globalFloor(run: RunState): number {
  return (run.act - 1) * 10 + run.floorIndex;
}

/** ユニット提供率専用の通算フロア。各幕11フロアを重複なく数える。 */
export function unitOfferFloor(run: RunState): number {
  return (run.act - 1) * FLOOR_COUNT + run.floorIndex;
}

/** 盤面に同時に出せる最大数（進行で増える + 王の勲章 + 英雄の器） */
export function teamCap(run: RunState): number {
  const base = Math.min(8, 3 + Math.floor(globalFloor(run) / 3));
  const crown = run.relics.includes("crown") ? 1 : 0;
  const normal = base + crown + ascMods(run.asc).capBonus + legacyLevel("team_cap_");
  return run.ancientRelics.includes("legionPact") ? normal * 2 : normal;
}

export function boardUnits(run: RunState): OwnedUnit[] {
  return run.roster.filter((u) => u.pos !== null);
}

/** 旧セーブや合成後も、ベンチスロットが重複せず0〜7へ収まるよう補正する。 */
export function normalizeBenchSlots(run: RunState): void {
  const used = new Set<number>();
  for (const unit of run.roster.filter((u) => u.pos === null)) {
    const slot = unit.benchSlot;
    if (slot !== undefined && slot >= 0 && slot < BENCH_SIZE && !used.has(slot)) {
      used.add(slot);
      continue;
    }
    const free = Array.from({ length: BENCH_SIZE }, (_, i) => i).find((i) => !used.has(i));
    unit.benchSlot = free ?? 0;
    used.add(unit.benchSlot);
  }
}

export function firstFreeBenchSlot(run: RunState): number {
  normalizeBenchSlots(run);
  const used = new Set(run.roster.filter((u) => u.pos === null).map((u) => u.benchSlot));
  return Array.from({ length: BENCH_SIZE }, (_, i) => i).find((i) => !used.has(i)) ?? 0;
}

export function benchUnits(run: RunState): OwnedUnit[] {
  normalizeBenchSlots(run);
  return run.roster
    .filter((u) => u.pos === null)
    .sort((a, b) => (a.benchSlot ?? 0) - (b.benchSlot ?? 0));
}

export function unitDef(u: OwnedUnit): UnitDef {
  return UNIT_BY_ID.get(u.defId)!;
}

export function addTwinCrownCopy(run: RunState, defId: string): boolean {
  if (benchUnits(run).length >= BENCH_SIZE) return false;
  run.roster.push({
    iid: run.nextIid++,
    defId,
    star: 2,
    pos: null,
    benchSlot: firstFreeBenchSlot(run),
    item: null,
    hpBonus: 0,
  });
  return true;
}

/** 古代レリックを付与し、双頭の王冠なら取得前からいる★3も補填する。 */
export function addAncientRelic(run: RunState, relicId: string): string[] {
  if (run.ancientRelics.includes(relicId)) return [];
  run.ancientRelics.push(relicId);
  if (relicId !== "twinCrown") return [];
  const existingStar3 = [...new Set(run.roster.filter((unit) => unit.star === 3).map((unit) => unit.defId))];
  const pending: string[] = [];
  for (const defId of existingStar3) {
    if (!addTwinCrownCopy(run, defId)) pending.push(defId);
  }
  return pending;
}

/** ユニットを追加し、3体揃ったら自動で星アップ。ベンチ超過なら false */
export function addUnit(run: RunState, def: UnitDef): boolean {
  const rosterBefore = run.roster.map((owned) => ({
    ...owned,
    pos: owned.pos ? { ...owned.pos } : null,
  }));
  const itemsBefore = [...run.items];
  const nextIidBefore = run.nextIid;
  const u: OwnedUnit = {
    iid: run.nextIid++,
    defId: def.id,
    star: 1,
    pos: null,
    benchSlot: firstFreeBenchSlot(run),
    item: null,
  };
  run.roster.push(u);
  tryMerge(run, def.id);
  if (benchUnits(run).length > BENCH_SIZE) {
    // 星アップや双頭の王冠による複製も含め、追加前の状態へ完全に戻す。
    run.roster = rosterBefore;
    run.items = itemsBefore;
    run.nextIid = nextIidBefore;
    return false;
  }
  return true;
}

function tryMerge(run: RunState, defId: string) {
  for (const star of [1, 2] as const) {
    const same = run.roster.filter((u) => u.defId === defId && u.star === star);
    if (same.length >= 3) {
      // 盤面にいる個体・アイテム装備個体を優先的に残す
      same.sort(
        (a, b) =>
          (b.pos ? 2 : 0) + (b.item ? 1 : 0) - ((a.pos ? 2 : 0) + (a.item ? 1 : 0)),
      );
      const keep = same[0];
      const remove = same.slice(1, 3);
      // 消える個体の装備は在庫に戻す
      for (const r of remove) if (r.item) run.items.push(r.item);
      run.roster = run.roster.filter((u) => !remove.includes(u));
      keep.star = (star + 1) as 2 | 3;
      if (keep.star === 3) {
        grantUnlock("first_star3");
        if (run.ancientRelics.includes("twinCrown")) {
          // ★3と同種を並べて双頭の王冠を発動できるよう、装備なしの★2をベンチへ生成する。
          run.roster.push({
            iid: run.nextIid++,
            defId,
            star: 2,
            pos: null,
            benchSlot: firstFreeBenchSlot(run),
            item: null,
            hpBonus: 0,
          });
        }
      }
      tryMerge(run, defId);
    }
  }
}

export function sellUnit(run: RunState, iid: number) {
  const u = run.roster.find((x) => x.iid === iid);
  if (!u) return;
  const def = unitDef(u);
  const value = def.cost * (u.star === 1 ? 1 : u.star === 2 ? 3 : 9);
  run.gold += value;
  if (u.item) run.items.push(u.item); // 装備は在庫に戻す
  run.roster = run.roster.filter((x) => x.iid !== iid);
}

/** 空いている自陣マスに未配置ユニット（ベンチの左から順）を詰める。
 *  近接は前列、遠距離は後列を優先して置く。チーム上限まで */
export function autoPlace(run: RunState) {
  const cap = teamCap(run);
  const isFree = (x: number, y: number) =>
    !run.roster.some((o) => o.pos && o.pos.x === x && o.pos.y === y);

  for (const u of run.roster) {
    if (boardUnits(run).length >= cap) break;
    if (u.pos) continue;
    const def = UNIT_BY_ID.get(u.defId)!;
    // 射程に応じて埋める行の優先順（4=最前列, 7=最後列）
    const rows =
      def.range >= 3 ? [7, 6, 5, 4] : def.range === 2 ? [6, 5, 7, 4] : [4, 5, 6, 7];
    let placed = false;
    for (const y of rows) {
      for (let x = 0; x < BOARD_COLS; x++) {
        if (isFree(x, y)) {
          u.pos = { x, y };
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) break; // 盤面に空きがない
  }
}

/** 星によるステータス倍率 */
export function starMult(star: number): number {
  return star === 1 ? 1 : star === 2 ? 1.8 : 3.2;
}

/** ★3所持済みのユニットID（ショップ・報酬から除外する用） */
export function maxedDefIds(run: RunState): Set<string> {
  return new Set(run.roster.filter((u) => u.star === 3).map((u) => u.defId));
}
