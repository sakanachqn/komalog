import type { RunState } from "./types";

const KEY = "autochess-rogue-save-v1";

export interface ResumeInfo {
  kind: "map" | "prepare" | "shop" | "rest" | "event" | "actclear";
  nodeId?: number;
  rescue?: boolean;
  clearedAct?: number;
}

export interface SaveData {
  v: 1;
  run: RunState;
  battleSpeed: number;
  resume: ResumeInfo;
}

export function saveGame(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ストレージが使えない環境では黙って諦める
  }
}

export function loadGame(): SaveData | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const d = JSON.parse(s) as SaveData;
    if (d?.v !== 1 || !d.run || !Array.isArray(d.run.roster)) return null;
    // 旧バージョンのセーブにフィールドを補完
    d.run.asc ??= 0;
    d.run.actRule ??= "bloodmoon";
    d.run.startedAt ??= Date.now();
    d.run.damageTaken ??= 0;
    d.run.ancientRelics ??= [];
    d.run.pendingAncientChoices ??= [];
    // 旧セーブは所持数から第1・第2幕報酬の取得状況を推定
    d.run.ancientRewardActs ??= d.run.ancientRelics.slice(0, 2).map((_, i) => i + 1);
    d.run.carriedShopItems ??= [];
    d.run.shopItemRerolls ??= 0;
    d.run.shopRerollNodeId ??= null;
    d.run.legacyRewarded ??= false;
    d.run.potions ??= [];
    d.run.scrap ??= 0;
    d.run.relicItemDropBonus ??= 0;
    for (const u of d.run.roster) u.hpBonus ??= 0;
    return d;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
