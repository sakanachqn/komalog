/** ラン間で持ち越す永続データ（アセンション解放・実績・記録） */

export interface MetaData {
  v: 1;
  ascUnlocked: number; // 挑戦可能な最大段位（0〜20）
  counters: {
    totalRuns: number;
    battleWins: number;
    eliteWins: number;
    crafts: number;
  };
  unlocks: string[];
  records: {
    totalWins: number;
    bestClearMs: number | null;
    bestBattleWins: number;
    ascBest: number; // クリア済み最高段位
  };
}

const KEY = "acr-meta-v1";
let cache: MetaData | null = null;

function defaults(): MetaData {
  return {
    v: 1,
    ascUnlocked: 0,
    counters: { totalRuns: 0, battleWins: 0, eliteWins: 0, crafts: 0 },
    unlocks: [],
    records: { totalWins: 0, bestClearMs: null, bestBattleWins: 0, ascBest: -1 },
  };
}

export function meta(): MetaData {
  if (cache) return cache;
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const d = JSON.parse(s) as MetaData;
      if (d?.v === 1) {
        cache = { ...defaults(), ...d, counters: { ...defaults().counters, ...d.counters }, records: { ...defaults().records, ...d.records } };
        return cache;
      }
    }
  } catch {
    /* noop */
  }
  cache = defaults();
  return cache;
}

export function saveMeta() {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta()));
  } catch {
    /* noop */
  }
}

/** 実績の定義: 条件の説明と解放される報酬名 */
export const UNLOCK_INFO: Record<string, { cond: string; reward: string }> = {
  reach_act2: { cond: "第2幕に到達する", reward: "新ユニット「不死鳥」" },
  first_star3: { cond: "★3ユニットを作る", reward: "新ユニット「巨神兵」" },
  wins30: { cond: "通算30回戦闘に勝利する", reward: "新ユニット「九尾」" },
  crafts5: { cond: "アイテム合成を通算5回行う", reward: "新レリック「鍛冶神の金床」" },
  elites5: { cond: "エリートに通算5回勝利する", reward: "新レリック「時の砂」" },
  first_clear: { cond: "全3幕をクリアする", reward: "新レリック「王の勲章」" },
  beat_dragon: { cond: "第2幕を突破する", reward: "新スターター「竜の血族」" },
};

export function hasUnlock(id: string): boolean {
  return meta().unlocks.includes(id);
}

export function grantUnlock(id: string) {
  const m = meta();
  if (m.unlocks.includes(id)) return;
  m.unlocks.push(id);
  saveMeta();
  showToast(`🔓 実績達成！ ${UNLOCK_INFO[id]?.reward ?? id} を解放した`);
}

export function showToast(text: string) {
  const t = document.createElement("div");
  t.className = "unlock-toast";
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

/** カウンター加算 + しきい値実績の自動チェック */
export function bumpCounter(key: keyof MetaData["counters"], n = 1): number {
  const m = meta();
  m.counters[key] += n;
  saveMeta();
  if (key === "battleWins" && m.counters.battleWins >= 30) grantUnlock("wins30");
  if (key === "eliteWins" && m.counters.eliteWins >= 5) grantUnlock("elites5");
  if (key === "crafts" && m.counters.crafts >= 5) grantUnlock("crafts5");
  return m.counters[key];
}
