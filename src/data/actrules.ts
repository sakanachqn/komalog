/** 幕の掟: 各幕に1つランダムで付く「デバフ + 見返り」のルール */

export interface ActRule {
  id: string;
  name: string;
  icon: string;
  debuff: string;
  buff: string;
  e: {
    enemyAtkPct?: number;
    enemyHpPct?: number;
    enemyAsPct?: number;
    winGold?: number;
    itemDropPct?: number;
    loseDamage?: number;
    restMult?: number;
    shopMarkup?: number;
    shopRelic?: boolean;
    startMana?: number;
  };
}

export const ACT_RULES: ActRule[] = [
  {
    id: "bloodmoon",
    name: "血の月",
    icon: "🌕",
    debuff: "敵の攻撃力 +15%",
    buff: "勝利ゴールド +4",
    e: { enemyAtkPct: 15, winGold: 4 },
  },
  {
    id: "mist",
    name: "深き霧",
    icon: "🌫️",
    debuff: "敵のHP +15%",
    buff: "アイテムドロップ率 +15%",
    e: { enemyHpPct: 15, itemDropPct: 15 },
  },
  {
    id: "plague",
    name: "疫病の風",
    icon: "☣️",
    debuff: "敗北ダメージ +5",
    buff: "休憩の回復量が2倍",
    e: { loseDamage: 5, restMult: 2 },
  },
  {
    id: "merchant",
    name: "商魂の宴",
    icon: "🪙",
    debuff: "ショップ価格 +2G",
    buff: "ショップにレリックが必ず入荷",
    e: { shopMarkup: 2, shopRelic: true },
  },
  {
    id: "storm",
    name: "荒ぶる嵐",
    icon: "⛈️",
    debuff: "敵の攻撃速度 +10%",
    buff: "味方は戦闘開始時マナ +15",
    e: { enemyAsPct: 10, startMana: 15 },
  },
];

export const ACT_RULE_BY_ID = new Map(ACT_RULES.map((r) => [r.id, r]));

export function rollActRule(): string {
  return ACT_RULES[Math.floor(Math.random() * ACT_RULES.length)].id;
}
