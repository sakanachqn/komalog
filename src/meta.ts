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
  /** ラン終了時に得る恒久解放用通貨 */
  memoryShards: number;
  /** 記憶の祭壇で購入済みの恒久強化 */
  legacyUnlocks: string[];
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
    memoryShards: 0,
    legacyUnlocks: [],
    records: { totalWins: 0, bestClearMs: null, bestBattleWins: 0, ascBest: -1 },
  };
}

export interface LegacyUpgrade {
  id: string;
  name: string;
  icon: string;
  cost: number;
  desc: string;
  requires?: string;
}

export const LEGACY_UPGRADES: LegacyUpgrade[] = [
  { id: "unit_oracle", name: "星読みの記憶", icon: "🔭", cost: 18, desc: "新ユニット『星詠み』を解放" },
  { id: "unit_mimic", name: "貪欲の記憶", icon: "🧰", cost: 22, desc: "新ユニット『宝箱喰らい』を解放" },
  { id: "unit_valkyrie", name: "戦乙女の記憶", icon: "🪽", cost: 28, desc: "新ユニット『戦乙女』を解放" },
  { id: "unit_chronos", name: "時王の記憶", icon: "⏳", cost: 36, desc: "新ユニット『時の王』を解放" },
  { id: "item_reroll_1", name: "目利き I", icon: "🔄", cost: 20, desc: "各ショップでアイテム候補を1回無料更新できる" },
  { id: "item_reroll_2", name: "目利き II", icon: "🔄", cost: 38, desc: "アイテム候補の無料更新が2回になる", requires: "item_reroll_1" },
  { id: "item_carry_1", name: "商人の覚書 I", icon: "📦", cost: 25, desc: "売れ残ったアイテムを1個、次のショップへ持ち越す" },
  { id: "item_carry_2", name: "商人の覚書 II", icon: "📦", cost: 45, desc: "持ち越せるアイテムが2個になる", requires: "item_carry_1" },
  { id: "starter_choice", name: "旅支度", icon: "🎴", cost: 30, desc: "スターターの提示数が3から4になる" },
  { id: "start_gold_1", name: "古びた財布 I", icon: "👛", cost: 18, desc: "ラン開始時のゴールド +3" },
  { id: "start_gold_2", name: "古びた財布 II", icon: "👛", cost: 34, desc: "ラン開始時のゴールドがさらに +3", requires: "start_gold_1" },
  { id: "reward_choice", name: "仲間の噂", icon: "🗣️", cost: 42, desc: "通常戦闘後のユニット候補 +1" },
  { id: "start_ancient", name: "太古の継承", icon: "✨", cost: 100, desc: "ラン開始時にランダムなエンシェントレリックを1つ獲得", requires: "unit_chronos" },
  // 新13シナジー対応ユニットの解放ツリー
  { id: "unit_soundseer", name: "音律の記憶", icon: "📯", cost: 18, desc: "新ユニット『音界の予言者』を解放" },
  { id: "unit_sawwright", name: "鋸歯の記憶", icon: "🪚", cost: 18, desc: "新ユニット『鋸歯技師』を解放" },
  { id: "unit_diceclown", name: "六面の記憶", icon: "🎲", cost: 22, desc: "新ユニット『六面の悪戯師』を解放" },
  { id: "unit_echorider", name: "霊響の記憶", icon: "🏇", cost: 30, desc: "新ユニット『霊響騎手』を解放", requires: "unit_soundseer" },
  { id: "unit_rewinder", name: "逆行の記憶", icon: "⏪", cost: 32, desc: "新ユニット『巻戻し人形』を解放", requires: "unit_sawwright" },
  { id: "unit_ironmeteor", name: "鉄球の記憶", icon: "⛓️", cost: 34, desc: "新ユニット『鉄球王』を解放", requires: "unit_sawwright" },
  { id: "unit_conductor", name: "指揮楽の記憶", icon: "🎼", cost: 36, desc: "新ユニット『戦律の楽団長』を解放", requires: "unit_soundseer" },
  { id: "unit_chronogravity", name: "特異点の記憶", icon: "🕳️", cost: 50, desc: "新ユニット『時空重機』を解放", requires: "unit_rewinder" },
  { id: "unit_nightcount", name: "夜血の記憶", icon: "🧛", cost: 45, desc: "新ユニット『夜血伯』を解放", requires: "unit_echorider" },
  { id: "unit_mirrorbetter", name: "鏡賭けの記憶", icon: "🪙", cost: 50, desc: "新ユニット『鏡賭博師』を解放", requires: "unit_diceclown" },
];

export function hasLegacy(id: string): boolean {
  return meta().legacyUnlocks.includes(id);
}

export function buyLegacy(id: string): boolean {
  const m = meta();
  const up = LEGACY_UPGRADES.find((x) => x.id === id);
  if (!up || hasLegacy(id) || m.memoryShards < up.cost || (up.requires && !hasLegacy(up.requires))) return false;
  m.memoryShards -= up.cost;
  m.legacyUnlocks.push(id);
  saveMeta();
  return true;
}

export function legacyLevel(prefix: string): number {
  return meta().legacyUnlocks.filter((id) => id.startsWith(prefix)).length;
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
  const m = meta();
  return m.unlocks.includes(id) || m.legacyUnlocks.includes(id);
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
