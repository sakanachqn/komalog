/** アセンション（挑戦段位）: 各段位は「重めのデバフ + 軽めのバフ」のペア。
 *  段位Nでは 1〜N の効果がすべて累積する。5/10/15/20 は節目で変わり種バフ。 */

export interface AscMods {
  // デバフ側
  enemyHpPct: number;
  enemyAtkPct: number;
  enemyAsPct: number;
  enemyArmor: number;
  bossHpPct: number;
  loseDamage: number;
  shopMarkup: number;
  restHalf: boolean;
  maxHpLoss: number;
  // バフ側
  startGold: number;
  winGold: number;
  startHp: number;
  itemDropPct: number;
  startItems: number;
  startRelics: number;
  // 節目の変わり種
  craftSalvage: boolean; // Lv5: 合成時50%で素材1個が残る
  interest: boolean; // Lv10: 勝利時、所持10Gごとに+1G（最大+5）
  capBonus: number; // Lv15: 配置上限+1
  relicPick: boolean; // Lv20: 開始時にレリックを3択から選ぶ
}

export interface AscLevel {
  debuff: string;
  buff: string;
  milestone?: boolean;
  e: Partial<AscMods>;
}

export const ASC_LEVELS: AscLevel[] = [
  { debuff: "敵HP +10%", buff: "開始ゴールド +5", e: { enemyHpPct: 10, startGold: 5 } },
  { debuff: "敵攻撃力 +10%", buff: "勝利ゴールド +2", e: { enemyAtkPct: 10, winGold: 2 } },
  { debuff: "敗北ダメージ +3", buff: "開始時アイテム1個", e: { loseDamage: 3, startItems: 1 } },
  { debuff: "ボスHP +20%", buff: "開始HP +5", e: { bossHpPct: 20, startHp: 5 } },
  {
    debuff: "敵攻撃速度 +8%",
    buff: "【鍛冶の心得】合成時、50%で素材1個が手元に残る",
    milestone: true,
    e: { enemyAsPct: 8, craftSalvage: true },
  },
  { debuff: "ショップ価格 +1G", buff: "開始ゴールド +5", e: { shopMarkup: 1, startGold: 5 } },
  { debuff: "敵HP +10%", buff: "アイテムドロップ率 +10%", e: { enemyHpPct: 10, itemDropPct: 10 } },
  { debuff: "最大HP -8", buff: "開始時ランダムなレリック1個", e: { maxHpLoss: 8, startRelics: 1 } },
  { debuff: "敵攻撃力 +10%", buff: "勝利ゴールド +2", e: { enemyAtkPct: 10, winGold: 2 } },
  {
    debuff: "敵HP +10%、敵防御 +20",
    buff: "【商人の血】勝利時、所持10Gごとに+1G（最大+5）",
    milestone: true,
    e: { enemyHpPct: 10, enemyArmor: 20, interest: true },
  },
  { debuff: "敗北ダメージ +3", buff: "開始HP +5", e: { loseDamage: 3, startHp: 5 } },
  { debuff: "敵HP +15%", buff: "アイテムドロップ率 +10%", e: { enemyHpPct: 15, itemDropPct: 10 } },
  { debuff: "敵攻撃速度 +10%", buff: "開始ゴールド +5", e: { enemyAsPct: 10, startGold: 5 } },
  { debuff: "休憩の回復量が半分", buff: "開始時アイテム1個", e: { restHalf: true, startItems: 1 } },
  {
    debuff: "ボスHP +35%",
    buff: "【英雄の器】配置上限 +1",
    milestone: true,
    e: { bossHpPct: 35, capBonus: 1 },
  },
  { debuff: "ショップ価格 +1G", buff: "勝利ゴールド +2", e: { shopMarkup: 1, winGold: 2 } },
  { debuff: "敵HP +15%", buff: "アイテムドロップ率 +10%", e: { enemyHpPct: 15, itemDropPct: 10 } },
  { debuff: "敵攻撃力 +15%", buff: "開始HP +5", e: { enemyAtkPct: 15, startHp: 5 } },
  { debuff: "敵HP +10%、敗北ダメージ +4", buff: "開始ゴールド +5", e: { enemyHpPct: 10, loseDamage: 4, startGold: 5 } },
  {
    debuff: "敵HP +20%、最大HP -7",
    buff: "【始まりの遺物】ラン開始時にレリックを3択から選ぶ",
    milestone: true,
    e: { enemyHpPct: 20, maxHpLoss: 7, relicPick: true },
  },
];

export const MAX_ASC = ASC_LEVELS.length;

/** 段位 level（0〜20）までの効果を累積して返す */
export function ascMods(level: number): AscMods {
  const m: AscMods = {
    enemyHpPct: 0,
    enemyAtkPct: 0,
    enemyAsPct: 0,
    enemyArmor: 0,
    bossHpPct: 0,
    loseDamage: 0,
    shopMarkup: 0,
    restHalf: false,
    maxHpLoss: 0,
    startGold: 0,
    winGold: 0,
    startHp: 0,
    itemDropPct: 0,
    startItems: 0,
    startRelics: 0,
    craftSalvage: false,
    interest: false,
    capBonus: 0,
    relicPick: false,
  };
  for (let i = 0; i < Math.min(level, ASC_LEVELS.length); i++) {
    const e = ASC_LEVELS[i].e;
    for (const [k, v] of Object.entries(e)) {
      const key = k as keyof AscMods;
      if (typeof v === "boolean") (m[key] as boolean) = (m[key] as boolean) || v;
      else (m[key] as number) += v;
    }
  }
  return m;
}
