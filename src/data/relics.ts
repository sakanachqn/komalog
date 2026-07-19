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
  { id: "sword", name: "剛剣", icon: "🗡️", desc: "攻撃力 +30%" },
  { id: "shield", name: "大盾", icon: "🛡️", desc: "防御 +30" },
  { id: "staff", name: "魔杖", icon: "🪄", desc: "呪文威力 +40%" },
  { id: "bow", name: "疾風の弓", icon: "🏹", desc: "攻撃速度 +25%" },
  { id: "orb", name: "生命の宝珠", icon: "❤️", desc: "最大HP +300" },
  { id: "blade", name: "吸血の刃", icon: "🩸", desc: "吸血 20%（通常攻撃で回復）" },
  { id: "crystal", name: "マナの水晶", icon: "💠", desc: "戦闘開始時、マナ +50" },
  { id: "claw", name: "会心の爪", icon: "💥", desc: "クリティカル率 +30%" },
  // 合成アイテム（同種2個から作る）
  { id: "sword2", name: "巨人の剣", icon: "⚔️", desc: "攻撃力 +70%", tier: 2 },
  { id: "shield2", name: "不落の城壁", icon: "🏰", desc: "防御 +70、最大HP +150", tier: 2 },
  { id: "staff2", name: "大賢者の杖", icon: "🌟", desc: "呪文威力 +100%", tier: 2 },
  { id: "bow2", name: "嵐の弓", icon: "🌪️", desc: "攻撃速度 +60%", tier: 2 },
  { id: "orb2", name: "生命の聖杯", icon: "🏆", desc: "最大HP +700", tier: 2 },
  { id: "blade2", name: "血鬼の剣", icon: "🦑", desc: "吸血 40%、攻撃力 +15%", tier: 2 },
  { id: "crystal2", name: "無限の水晶", icon: "🔷", desc: "戦闘開始時、マナほぼ全開", tier: 2 },
  { id: "claw2", name: "死神の爪", icon: "☄️", desc: "クリティカル率 +60%", tier: 2 },
];

/** 合成レシピ: 同じ素材アイテム2個 → 上位アイテム */
export const CRAFT_RECIPES: Record<string, string> = {
  sword: "sword2",
  shield: "shield2",
  staff: "staff2",
  bow: "bow2",
  orb: "orb2",
  blade: "blade2",
  crystal: "crystal2",
  claw: "claw2",
};

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
