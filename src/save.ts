import type { RunState } from "./types";

const KEY = "komalog-save-v1";
const BACKUP_KEY = "komalog-save-backup-v1";

/** 初期版の保存キーを名前に依存せず検出し、現在のキーへ移行する。 */
function findLegacyKey(backup = false): string | null {
  const suffix = backup ? "-rogue-save-backup-v1" : "-rogue-save-v1";
  return Object.keys(localStorage).find((key) => key !== KEY && key !== BACKUP_KEY && key.endsWith(suffix)) ?? null;
}

function migrateLegacySave(): void {
  if (!localStorage.getItem(KEY)) {
    const legacy = findLegacyKey();
    if (legacy) {
      const raw = localStorage.getItem(legacy);
      if (raw && parseSave(raw)) localStorage.setItem(KEY, raw);
    }
  }
  if (!localStorage.getItem(BACKUP_KEY)) {
    const legacyBackup = findLegacyKey(true);
    if (legacyBackup) {
      const raw = localStorage.getItem(legacyBackup);
      if (raw && parseSave(raw)) localStorage.setItem(BACKUP_KEY, raw);
    }
  }
}

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
    const next = JSON.stringify(data);
    const current = localStorage.getItem(KEY);
    if (current && parseSave(current)) localStorage.setItem(BACKUP_KEY, current);
    localStorage.setItem(KEY, next);
  } catch {
    // ストレージが使えない環境では黙って諦める
  }
}

export function loadGame(): SaveData | null {
  try {
    migrateLegacySave();
    const primary = localStorage.getItem(KEY);
    const backup = localStorage.getItem(BACKUP_KEY);
    const d = (primary ? parseSave(primary) : null) ?? (backup ? parseSave(backup) : null);
    if (!d) return null;
    if (primary && !parseSave(primary) && backup) localStorage.setItem(KEY, backup);
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

function parseSave(raw: string): SaveData | null {
  try {
    const d = JSON.parse(raw) as SaveData;
    if (d?.v !== 1 || !d.run || !Array.isArray(d.run.roster) || !Array.isArray(d.run.map)) return null;
    if (!Number.isFinite(d.run.playerHp) || !Number.isFinite(d.run.gold) || d.run.act < 1 || d.run.act > 3) return null;
    return d;
  } catch { return null; }
}

export function clearSave() {
  try {
    const legacy = findLegacyKey();
    const legacyBackup = findLegacyKey(true);
    localStorage.removeItem(KEY);
    localStorage.removeItem(BACKUP_KEY);
    if (legacy) localStorage.removeItem(legacy);
    if (legacyBackup) localStorage.removeItem(legacyBackup);
  } catch {
    /* noop */
  }
}
