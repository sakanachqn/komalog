import type { EnemyDef, SkillDef } from "../types";

const E = (
  id: string,
  name: string,
  icon: string,
  hp: number,
  atk: number,
  atkSpeed: number,
  range: number,
  armor: number,
  skill?: SkillDef,
): EnemyDef => ({ id, name, icon, hp, atk, atkSpeed, range, armor, skill });

/** 敵スキルは攻撃力参照（幕のスケールに追従させるため） */
const SK = (
  name: string,
  desc: string,
  mana: number,
  type: SkillDef["type"],
  power: number,
  fx?: SkillDef["fx"],
): SkillDef => ({ name, desc, mana, type, power, scaling: "attack", fx });

export const ENEMIES: Record<string, EnemyDef> = {
  // 第1幕
  slime: E("slime", "スライム", "🟢", 420, 35, 0.7, 1, 10),
  bat: E("bat", "コウモリ", "🦇", 320, 40, 1.1, 1, 5),
  goblin: E("goblin", "ゴブリン", "👺", 520, 50, 0.85, 1, 15),
  gobArcher: E("gobArcher", "ゴブリン弓兵", "🏹", 400, 55, 0.9, 3, 8),
  wolf: E("wolf", "ウルフ", "🐺", 600, 65, 1.0, 1, 12),
  orc: E("orc", "オーク", "👹", 900, 75, 0.7, 1, 30),
  darkMage: E("darkMage", "闇魔導士", "🧿", 550, 70, 0.75, 3, 10,
    SK("闇の火球", "対象に攻撃力180%の闇の一撃", 70, "nuke", 180, "fire")),
  golem: E("golem", "ゴーレム", "🗿", 1400, 70, 0.55, 1, 50,
    SK("石化装甲", "自身に攻撃力280%のシールド", 60, "shield", 280)),
  ogre: E("ogre", "オーガ", "👿", 1200, 95, 0.65, 1, 35,
    SK("かち割り", "対象に攻撃力200%の物理ダメージ", 70, "pierce", 200)),
  wraith: E("wraith", "レイス", "👻", 700, 85, 0.95, 2, 15,
    SK("死神の鎌", "最もHPの低い敵に攻撃力200%のダメージ", 75, "execute", 200, "shadow")),
  orcKing: E("orcKing", "オークの王", "🤴", 3000, 110, 0.75, 1, 40,
    SK("大暴れ", "対象周辺に攻撃力140%の物理ダメージ", 80, "aoe", 140)),
  slimeLord: E("slimeLord", "スライムロード", "🫠", 3400, 95, 0.7, 1, 30,
    SK("分裂体当たり", "対象周辺に攻撃力130%の物理ダメージ", 75, "aoe", 130)),
  // 第2幕
  lizard: E("lizard", "リザード戦士", "🦎", 700, 70, 0.85, 1, 25),
  harpy: E("harpy", "ハーピー", "🦅", 550, 75, 1.1, 1, 10),
  minotaur: E("minotaur", "ミノタウロス", "🐂", 1600, 95, 0.6, 1, 40,
    SK("突進", "対象と直線上の敵に攻撃力210%の物理ダメージ", 80, "pierce", 210)),
  shaman: E("shaman", "蜥蜴の呪術師", "🐍", 600, 85, 0.8, 3, 12,
    SK("呪詛", "対象に攻撃力170%の闇ダメージ", 70, "nuke", 170, "shadow")),
  blackKnight: E("blackKnight", "黒鎧兵", "🪖", 1100, 85, 0.7, 1, 45,
    SK("鉄の構え", "自身に攻撃力250%のシールド", 60, "shield", 250)),
  dragon: E("dragon", "ドラゴン", "🐲", 3600, 125, 0.8, 2, 45,
    SK("火炎のブレス", "対象周辺に攻撃力135%の炎ダメージ", 70, "aoe", 135, "fire")),
  griffon: E("griffon", "グリフォン", "🦁", 3200, 115, 1.0, 2, 30,
    SK("連続爪撃", "ランダムな敵3体に攻撃力140%の物理ダメージ", 75, "multishot", 140, "phys")),
  // 第3幕
  lich: E("lich", "リッチ", "💀", 900, 110, 0.75, 3, 20,
    SK("凍てつく波動", "対象周辺に攻撃力130%の氷ダメージ+攻撃速度低下", 75, "frost", 130)),
  shadowBeast: E("shadowBeast", "影獣", "🌫️", 1000, 120, 1.0, 1, 20),
  fallen: E("fallen", "堕天使", "🪽", 1300, 130, 0.85, 2, 30,
    SK("裁きの光", "対象に攻撃力220%の光ダメージ", 80, "nuke", 220, "holy")),
  abomination: E("abomination", "蠢く肉塊", "🧟", 2200, 100, 0.55, 1, 50,
    SK("毒素散布", "対象周辺に攻撃力130%の闇ダメージ", 80, "aoe", 130, "shadow")),
  demonLord: E("demonLord", "魔王", "😈", 4200, 145, 0.8, 2, 50,
    SK("冥界の炎", "対象周辺に攻撃力150%の闇ダメージ", 75, "aoe", 150, "shadow")),
  reaper: E("reaper", "死神", "☠️", 3800, 160, 0.75, 2, 40,
    SK("魂刈り", "最もHPの低い敵に攻撃力260%の闇ダメージ", 70, "execute", 260, "shadow")),
  impGuard: E("impGuard", "親衛インプ", "👾", 800, 70, 0.9, 1, 25),
};

export interface Spawn {
  def: EnemyDef;
  x: number;
  y: number; // 0-3（敵陣側の行）
}

export interface EnemyTeam {
  spawns: Spawn[];
  scale: number;
}

/** 幕ごとの基礎難易度倍率 */
const ACT_MULT: Record<number, number> = { 1: 0.9, 2: 1.45, 3: 1.7 };

const pickOne = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 幕・フロア・ノード種別に応じた敵編成を返す */
export function enemyTeamFor(act: number, floor: number, type: "battle" | "elite" | "boss"): EnemyTeam {
  const scale = (ACT_MULT[act] ?? 1) * (1 + floor * 0.1 + (type === "elite" ? 0.18 : 0));
  const N = ENEMIES;

  if (type === "boss") {
    // 各幕2種類のボスからランダム
    const bosses: Record<number, Spawn[][]> = {
      1: [
        [
          { def: N.orcKing, x: 3, y: 1 },
          { def: N.orc, x: 1, y: 2 },
          { def: N.orc, x: 5, y: 2 },
          { def: N.gobArcher, x: 2, y: 0 },
          { def: N.gobArcher, x: 4, y: 0 },
        ],
        [
          { def: N.slimeLord, x: 3, y: 1 },
          { def: N.slime, x: 1, y: 2 },
          { def: N.slime, x: 5, y: 2 },
          { def: N.slime, x: 2, y: 3 },
          { def: N.slime, x: 4, y: 3 },
        ],
      ],
      2: [
        [
          { def: N.dragon, x: 3, y: 1 },
          { def: N.lizard, x: 1, y: 2 },
          { def: N.lizard, x: 5, y: 2 },
          { def: N.shaman, x: 2, y: 0 },
          { def: N.shaman, x: 4, y: 0 },
        ],
        [
          { def: N.griffon, x: 3, y: 1 },
          { def: N.harpy, x: 1, y: 2 },
          { def: N.harpy, x: 5, y: 2 },
          { def: N.harpy, x: 3, y: 3 },
          { def: N.shaman, x: 3, y: 0 },
        ],
      ],
      3: [
        [
          { def: N.demonLord, x: 3, y: 1 },
          { def: N.impGuard, x: 1, y: 2 },
          { def: N.impGuard, x: 5, y: 2 },
          { def: N.lich, x: 2, y: 0 },
          { def: N.lich, x: 4, y: 0 },
          { def: N.fallen, x: 3, y: 2 },
        ],
        [
          { def: N.reaper, x: 3, y: 1 },
          { def: N.wraith, x: 1, y: 2 },
          { def: N.wraith, x: 5, y: 2 },
          { def: N.lich, x: 3, y: 0 },
          { def: N.shadowBeast, x: 2, y: 3 },
          { def: N.shadowBeast, x: 4, y: 3 },
        ],
      ],
    };
    return { spawns: pickOne(bosses[act] ?? bosses[3]), scale };
  }

  if (type === "elite") {
    const elitesByAct: Record<number, Spawn[][]> = {
      1: [
        [
          { def: N.golem, x: 3, y: 3 },
          { def: N.gobArcher, x: 2, y: 1 },
          { def: N.gobArcher, x: 4, y: 1 },
        ],
        [
          { def: N.ogre, x: 2, y: 3 },
          { def: N.wolf, x: 4, y: 3 },
          { def: N.darkMage, x: 3, y: 1 },
        ],
        [
          { def: N.wraith, x: 1, y: 2 },
          { def: N.wraith, x: 5, y: 2 },
          { def: N.orc, x: 3, y: 3 },
        ],
      ],
      2: [
        [
          { def: N.minotaur, x: 3, y: 3 },
          { def: N.shaman, x: 2, y: 1 },
          { def: N.shaman, x: 4, y: 1 },
        ],
        [
          { def: N.blackKnight, x: 2, y: 3 },
          { def: N.blackKnight, x: 4, y: 3 },
          { def: N.harpy, x: 3, y: 1 },
        ],
        [
          { def: N.minotaur, x: 2, y: 3 },
          { def: N.harpy, x: 5, y: 2 },
          { def: N.lizard, x: 4, y: 3 },
          { def: N.shaman, x: 1, y: 0 },
        ],
      ],
      3: [
        [
          { def: N.abomination, x: 3, y: 3 },
          { def: N.lich, x: 2, y: 1 },
          { def: N.lich, x: 4, y: 1 },
        ],
        [
          { def: N.fallen, x: 2, y: 2 },
          { def: N.fallen, x: 4, y: 2 },
          { def: N.shadowBeast, x: 3, y: 3 },
        ],
        [
          { def: N.abomination, x: 2, y: 3 },
          { def: N.shadowBeast, x: 4, y: 3 },
          { def: N.lich, x: 3, y: 0 },
        ],
      ],
    };
    return { spawns: pickOne(elitesByAct[act] ?? elitesByAct[3]), scale };
  }

  // 通常戦闘: 幕ごと、幕内の進行度（序盤/中盤/終盤）ごとの編成
  const tier = floor < 3 ? 0 : floor < 6 ? 1 : 2;
  const battlesByAct: Record<number, Spawn[][][]> = {
    1: [
      [
        [
          { def: N.slime, x: 2, y: 3 },
          { def: N.slime, x: 4, y: 3 },
          { def: N.bat, x: 3, y: 2 },
        ],
        [
          { def: N.goblin, x: 3, y: 3 },
          { def: N.bat, x: 1, y: 2 },
          { def: N.bat, x: 5, y: 2 },
        ],
        [
          { def: N.slime, x: 1, y: 3 },
          { def: N.slime, x: 5, y: 3 },
          { def: N.gobArcher, x: 3, y: 1 },
        ],
      ],
      [
        [
          { def: N.goblin, x: 2, y: 3 },
          { def: N.goblin, x: 4, y: 3 },
          { def: N.gobArcher, x: 3, y: 1 },
          { def: N.bat, x: 0, y: 2 },
        ],
        [
          { def: N.wolf, x: 1, y: 3 },
          { def: N.wolf, x: 5, y: 3 },
          { def: N.darkMage, x: 3, y: 0 },
        ],
        [
          { def: N.orc, x: 3, y: 3 },
          { def: N.gobArcher, x: 2, y: 1 },
          { def: N.gobArcher, x: 4, y: 1 },
        ],
      ],
      [
        [
          { def: N.orc, x: 2, y: 3 },
          { def: N.orc, x: 4, y: 3 },
          { def: N.darkMage, x: 1, y: 0 },
          { def: N.darkMage, x: 5, y: 0 },
        ],
        [
          { def: N.ogre, x: 3, y: 3 },
          { def: N.wolf, x: 1, y: 2 },
          { def: N.wolf, x: 5, y: 2 },
          { def: N.gobArcher, x: 3, y: 0 },
        ],
        [
          { def: N.golem, x: 3, y: 3 },
          { def: N.wraith, x: 1, y: 2 },
          { def: N.wraith, x: 5, y: 2 },
        ],
      ],
    ],
    2: [
      [
        [
          { def: N.lizard, x: 2, y: 3 },
          { def: N.lizard, x: 4, y: 3 },
          { def: N.harpy, x: 3, y: 2 },
        ],
        [
          { def: N.harpy, x: 1, y: 3 },
          { def: N.harpy, x: 5, y: 3 },
          { def: N.shaman, x: 3, y: 1 },
        ],
      ],
      [
        [
          { def: N.blackKnight, x: 3, y: 3 },
          { def: N.lizard, x: 1, y: 3 },
          { def: N.shaman, x: 5, y: 1 },
        ],
        [
          { def: N.lizard, x: 2, y: 3 },
          { def: N.lizard, x: 4, y: 3 },
          { def: N.shaman, x: 2, y: 0 },
          { def: N.shaman, x: 4, y: 0 },
        ],
      ],
      [
        [
          { def: N.minotaur, x: 3, y: 3 },
          { def: N.blackKnight, x: 1, y: 3 },
          { def: N.harpy, x: 5, y: 2 },
          { def: N.shaman, x: 3, y: 0 },
        ],
        [
          { def: N.blackKnight, x: 2, y: 3 },
          { def: N.blackKnight, x: 4, y: 3 },
          { def: N.harpy, x: 1, y: 1 },
          { def: N.harpy, x: 5, y: 1 },
        ],
      ],
    ],
    3: [
      [
        [
          { def: N.shadowBeast, x: 2, y: 3 },
          { def: N.shadowBeast, x: 4, y: 3 },
          { def: N.lich, x: 3, y: 1 },
        ],
        [
          { def: N.fallen, x: 3, y: 2 },
          { def: N.shadowBeast, x: 1, y: 3 },
          { def: N.lich, x: 5, y: 0 },
        ],
      ],
      [
        [
          { def: N.fallen, x: 2, y: 2 },
          { def: N.fallen, x: 4, y: 2 },
          { def: N.lich, x: 3, y: 0 },
        ],
        [
          { def: N.abomination, x: 3, y: 3 },
          { def: N.shadowBeast, x: 1, y: 2 },
          { def: N.lich, x: 5, y: 0 },
        ],
      ],
      [
        [
          { def: N.abomination, x: 2, y: 3 },
          { def: N.abomination, x: 4, y: 3 },
          { def: N.lich, x: 1, y: 0 },
          { def: N.lich, x: 5, y: 0 },
        ],
        [
          { def: N.fallen, x: 1, y: 2 },
          { def: N.fallen, x: 5, y: 2 },
          { def: N.shadowBeast, x: 3, y: 3 },
          { def: N.lich, x: 3, y: 0 },
        ],
      ],
    ],
  };
  const comps = (battlesByAct[act] ?? battlesByAct[3])[tier];
  return { spawns: pickOne(comps), scale };
}
