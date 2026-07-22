import { hasUnlock } from "../meta";

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 実績ID。未達成の間はプールに出現しない */
  unlock?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 2 = 合成で作る上位アイテム（ドロップしない） */
  tier?: number;
}

/** レリック: ラン全体に効く永続効果 */
export const RELICS: RelicDef[] = [
  { id: "warbanner", name: "軍旗", icon: "🚩", desc: "味方全員の攻撃力 +10%" },
  { id: "ironAmulet", name: "鉄のお守り", icon: "🧿", desc: "味方全員の防御 +12" },
  { id: "grimoire", name: "禁断の魔導書", icon: "📖", desc: "味方全員の呪文威力 +25%" },
  { id: "swiftBoots", name: "韋駄天の靴", icon: "👢", desc: "味方全員の攻撃速度 +10%" },
  { id: "giantBelt", name: "巨人のベルト", icon: "🎗️", desc: "味方全員の最大HP +12%" },
  { id: "vampFang", name: "吸血の牙", icon: "🧛", desc: "味方全員に吸血 10%（通常攻撃で回復）" },
  { id: "goldenEgg", name: "金の卵", icon: "🥚", desc: "戦闘勝利時のゴールド +4" },
  { id: "healCharm", name: "癒しの護符", icon: "🍀", desc: "戦闘勝利後、HPを 3 回復" },
  { id: "manaStone", name: "賢者の石", icon: "💎", desc: "戦闘開始時、味方のマナが 30% 溜まった状態で始まる" },
  { id: "ironWill", name: "鉄の意志", icon: "🗿", desc: "敗北時に受けるダメージが半分になる" },
  // アンロック制レリック
  { id: "anvil", name: "鍛冶神の金床", icon: "⚒️", desc: "アイテムドロップ率 +15%", unlock: "crafts5" },
  { id: "crown", name: "王の勲章", icon: "👑", desc: "配置上限 +1", unlock: "first_clear" },
  { id: "hourglass", name: "時の砂", icon: "⏳", desc: "戦闘開始時、味方全員のマナ +20", unlock: "elites5" },
];

/** アイテム: ユニットに1つ装備できる */
export const ITEMS: ItemDef[] = [
  { id: "sword", name: "剛剣", icon: "⚔️", desc: "攻撃力 +30%" },
  { id: "shield", name: "大盾", icon: "🛡️", desc: "防御 +35" },
  { id: "staff", name: "魔杖", icon: "🪄", desc: "呪文威力 +40%" },
  { id: "bow", name: "疾風の弓", icon: "🏹", desc: "攻撃速度 +25%" },
  { id: "orb", name: "生命の宝珠", icon: "🔴", desc: "最大HP +350" },
  { id: "blade", name: "吸血の刃", icon: "🩸", desc: "吸血 25%（通常攻撃で回復）" },
  { id: "crystal", name: "マナの水晶", icon: "💎", desc: "戦闘開始時、マナ +50" },
  { id: "claw", name: "会心の爪", icon: "🐾", desc: "クリティカル率 +35%" },
  // 同種合成: 1能力へ強く特化
  { id: "sword2", name: "巨人の剣", icon: "🗡️", desc: "攻撃力+70%。物理攻撃が防御を35%無視", tier: 2 },
  { id: "shield2", name: "不落の城壁", icon: "🏰", desc: "防御+70、最大HP+300。開幕に最大HP30%のシールド", tier: 2 },
  { id: "staff2", name: "大賢者の杖", icon: "🔮", desc: "呪文威力+100%。スキルごとにさらに+20%（最大5回）", tier: 2 },
  { id: "bow2", name: "嵐の弓", icon: "🌪️", desc: "攻撃速度+60%。通常攻撃4回ごとに別の敵2体へ追加攻撃", tier: 2 },
  { id: "orb2", name: "生命の聖杯", icon: "🏆", desc: "最大HP+800。毎秒2%回復、HP50%以下では回復量2倍", tier: 2 },
  { id: "blade2", name: "血鬼の剣", icon: "🧛", desc: "吸血40%、攻撃力+20%。過剰回復を最大HP30%までシールド化", tier: 2 },
  { id: "crystal2", name: "無限の水晶", icon: "♾️", desc: "開幕マナ全開。最初のスキルを50%威力でもう一度発動", tier: 2 },
  { id: "claw2", name: "死神の爪", icon: "☠️", desc: "クリ率+60%、クリダメ+60%。クリティカル撃破で次も確定クリティカル", tier: 2 },

  // 異種合成: 2能力と組み合わせ固有の効果
  { id: "sword_shield", name: "勇者の大剣", icon: "🏅", desc: "攻撃力+25%、防御+25。被弾すると次の通常攻撃+20%", tier: 2 },
  { id: "sword_staff", name: "魔剣", icon: "🌌", desc: "攻撃力+25%、呪文威力+45%。物理スキルに呪文威力の25%を加算", tier: 2 },
  { id: "sword_bow", name: "双撃の刃", icon: "⚔️", desc: "攻撃力+25%、攻撃速度+20%。通常攻撃4回ごとに追加攻撃", tier: 2 },
  { id: "sword_orb", name: "巨獣殺し", icon: "🗡️", desc: "攻撃力+25%、最大HP+250。自身より最大HPが高い敵へ+20%ダメージ", tier: 2 },
  { id: "sword_blade", name: "処刑人の剣", icon: "🪓", desc: "攻撃力+30%、吸血15%。HP30%以下の敵へ+25%ダメージ", tier: 2 },
  { id: "sword_crystal", name: "魔力解放剣", icon: "💫", desc: "攻撃力+25%、初期マナ+30。スキル後に攻撃力+20%", tier: 2 },
  { id: "sword_claw", name: "首狩りの刃", icon: "✂️", desc: "攻撃力+25%、クリ率+25%、クリダメ+25%", tier: 2 },
  { id: "shield_staff", name: "魔導障壁", icon: "🔵", desc: "防御+25、呪文威力+40%。スキル発動時に自身へシールド", tier: 2 },
  { id: "shield_bow", name: "風避けの外套", icon: "🧥", desc: "防御+25、攻撃速度+20%。4回被弾ごとに次のダメージを無効化", tier: 2 },
  { id: "shield_orb", name: "古代樹の鎧", icon: "🌿", desc: "防御+30、最大HP+400。毎秒最大HP1.5%回復", tier: 2 },
  { id: "shield_blade", name: "血棘の鎧", icon: "🥀", desc: "防御+30、吸血15%。通常攻撃ダメージの20%を反射", tier: 2 },
  { id: "shield_crystal", name: "守護者の核", icon: "⚙️", desc: "防御+25、初期マナ+35。最初のスキルで味方全体にシールド", tier: 2 },
  { id: "shield_claw", name: "報復の籠手", icon: "🥊", desc: "防御+25、クリ率+20%。被弾するたびクリ率+5%（最大30%）", tier: 2 },
  { id: "staff_bow", name: "詠唱加速器", icon: "⏩", desc: "呪文威力+40%、攻撃速度+20%。通常攻撃のマナ獲得+5", tier: 2 },
  { id: "staff_orb", name: "生命の杖", icon: "🌱", desc: "呪文威力+40%、最大HP+300。回復・シールド量+30%", tier: 2 },
  { id: "staff_blade", name: "魂喰らいの杖", icon: "👻", desc: "呪文威力+45%。スキルダメージの20%を吸収", tier: 2 },
  { id: "staff_crystal", name: "星界の魔導書", icon: "📘", desc: "呪文威力+50%、初期マナ+40。スキル後に必要マナ20%を返還", tier: 2 },
  { id: "staff_claw", name: "混沌の宝杖", icon: "🌀", desc: "呪文威力+45%、クリ率+20%。攻撃スキルがクリティカル可能", tier: 2 },
  { id: "bow_orb", name: "森羅の弓", icon: "🍃", desc: "攻撃速度+25%、最大HP+250。通常攻撃5回ごとに最大HP5%回復", tier: 2 },
  { id: "bow_blade", name: "血風の弓", icon: "🌹", desc: "攻撃速度+30%、吸血20%。HPが減るほど攻撃速度上昇", tier: 2 },
  { id: "bow_crystal", name: "星射ちの弓", icon: "🌠", desc: "攻撃速度+25%、初期マナ+30。通常攻撃のマナ獲得+5", tier: 2 },
  { id: "bow_claw", name: "千本爪", icon: "✨", desc: "攻撃速度+30%、クリ率+25%。クリティカル時に追加攻撃", tier: 2 },
  { id: "orb_blade", name: "血の心臓", icon: "❤️‍🔥", desc: "最大HP+400、吸血20%。過剰回復を最大HP20%までシールド化", tier: 2 },
  { id: "orb_crystal", name: "賢者の心核", icon: "🫀", desc: "最大HP+350、初期マナ+40。最初のスキル時に最大HP25%回復", tier: 2 },
  { id: "orb_claw", name: "窮鼠の心臓", icon: "💓", desc: "最大HP+350、クリ率+20%。HPが低いほどクリ率上昇", tier: 2 },
  { id: "blade_crystal", name: "血晶の刃", icon: "♦️", desc: "吸血20%、初期マナ+35。スキル発動時に最大HP8%回復", tier: 2 },
  { id: "blade_claw", name: "紅蓮の爪", icon: "🔥", desc: "吸血20%、クリ率+25%。クリティカルの吸血量が2倍", tier: 2 },
  { id: "crystal_claw", name: "運命の水晶", icon: "🔯", desc: "初期マナ+40、クリ率+25%。最初の攻撃スキルが確定クリティカル", tier: 2 },
];

export const BASE_ITEM_IDS = ["sword", "shield", "staff", "bow", "orb", "blade", "crystal", "claw"] as const;

/** 素材順に依存しないレシピキー。 */
export function craftKey(a: string, b: string): string {
  const ai = BASE_ITEM_IDS.indexOf(a as (typeof BASE_ITEM_IDS)[number]);
  const bi = BASE_ITEM_IDS.indexOf(b as (typeof BASE_ITEM_IDS)[number]);
  return ai <= bi ? `${a}+${b}` : `${b}+${a}`;
}

/** 合成レシピ: 通常アイテム2個 → 上位アイテム（全36通り） */
export const CRAFT_RECIPES: Record<string, string> = {
  "sword+sword": "sword2", "shield+shield": "shield2", "staff+staff": "staff2", "bow+bow": "bow2",
  "orb+orb": "orb2", "blade+blade": "blade2", "crystal+crystal": "crystal2", "claw+claw": "claw2",
  "sword+shield": "sword_shield", "sword+staff": "sword_staff", "sword+bow": "sword_bow",
  "sword+orb": "sword_orb", "sword+blade": "sword_blade", "sword+crystal": "sword_crystal", "sword+claw": "sword_claw",
  "shield+staff": "shield_staff", "shield+bow": "shield_bow", "shield+orb": "shield_orb",
  "shield+blade": "shield_blade", "shield+crystal": "shield_crystal", "shield+claw": "shield_claw",
  "staff+bow": "staff_bow", "staff+orb": "staff_orb", "staff+blade": "staff_blade",
  "staff+crystal": "staff_crystal", "staff+claw": "staff_claw", "bow+orb": "bow_orb",
  "bow+blade": "bow_blade", "bow+crystal": "bow_crystal", "bow+claw": "bow_claw",
  "orb+blade": "orb_blade", "orb+crystal": "orb_crystal", "orb+claw": "orb_claw",
  "blade+crystal": "blade_crystal", "blade+claw": "blade_claw", "crystal+claw": "crystal_claw",
};

export function craftResult(a: string, b: string): string | undefined {
  return CRAFT_RECIPES[craftKey(a, b)];
}

export const RELIC_BY_ID = new Map(RELICS.map((r) => [r.id, r]));
export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function rollItem(): string {
  const pool = ITEMS.filter((i) => !i.tier);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** 未所持かつ解放済みのレリックから最大 n 個をランダムに返す */
export function rollRelicChoices(owned: string[], n: number): RelicDef[] {
  const pool = RELICS.filter((r) => !owned.includes(r.id) && (!r.unlock || hasUnlock(r.unlock)));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
