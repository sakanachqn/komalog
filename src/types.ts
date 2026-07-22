export type TraitId =
  | "warrior"
  | "ranger"
  | "mage"
  | "guardian"
  | "assassin"
  | "berserker"
  | "priest"
  | "undead"
  | "spirit"
  | "resonator"
  | "clockwork"
  | "parasite"
  | "gravity"
  | "alchemist"
  | "gambler"
  | "ghost"
  | "doppelganger"
  | "commander"
  | "bloodpact"
  | "constellation"
  | "dismantler"
  | "jester";

export type SkillType =
  | "nuke" // 対象に魔法ダメージ
  | "aoe" // 対象周辺に魔法ダメージ
  | "heal" // 最もHPの低い味方を回復
  | "shield" // 自身にシールド
  | "multishot" // ランダムな敵複数に攻撃
  | "execute" // 最もHPの低い敵に大ダメージ
  | "pierce" // 対象とその後方に物理ダメージ
  | "frost" // 対象周辺にダメージ+攻撃速度低下
  | "poison" // 対象に毒（時間経過ダメージ）
  | "stun" // 対象にダメージ+行動不能
  | "drain" // 対象にダメージ+与ダメ分を自己回復
  | "warcry" // 味方全体の攻撃力を強化
  | "chain" // 対象から近い敵へ連鎖（減衰）
  | "nova" // 自分中心の全周ダメージ
  | "curse" // 対象にダメージ+防御を半減
  | "bombard" // ランダムな複数地点に範囲爆撃
  | "snipe" // 最もHPの高い敵に特大ダメージ
  | "healAll" // 味方全体を回復
  | "rally" // 味方全体にシールド
  | "frenzy" // 自己強化（攻撃速度・クリ率）
  | "manaburn" // 対象にダメージ+マナ枯渇
  | "freeze" // 対象周辺にダメージ+凍結（行動不能）
  | "silenceWave"
  | "shieldBreak"
  | "bloodPoison"
  | "mirrorStrike"
  | "gravityField"
  | "linkedHeal"
  | "diceExecute"
  | "spectralDash"
  | "allyCopy"
  | "damageBanner"
  | "bloodLine"
  | "starBlind"
  | "rewind"
  | "ironCharge"
  | "fearTrap"
  | "manaEqualize"
  | "corrode"
  | "corpseFeast"
  | "timeVortex"
  | "decoys"
  | "scavenge"
  | "vampireBat"
  | "echoDaggers"
  | "statGamble"
  | "signature"; // コスト3以上の固有スキル

export interface SkillDef {
  name: string;
  desc: string;
  mana: number;
  type: SkillType;
  power: number; // 基礎威力（spell: 固定値, attack: 攻撃力の%）
  scaling: "attack" | "spell";
  /** 演出の上書き（省略時は type から自動決定） */
  fx?: "fire" | "ice" | "holy" | "shadow" | "arrow" | "phys" | "bolt";
}

export interface UnitDef {
  id: string;
  name: string;
  icon: string;
  cost: 1 | 2 | 3 | 4 | 5;
  traits: TraitId[];
  hp: number;
  atk: number;
  atkSpeed: number; // 攻撃回数/秒
  range: number; // チェビシェフ距離
  armor: number;
  skill: SkillDef;
  /** 実績ID。未達成の間はプールに出現しない */
  unlock?: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  atkSpeed: number;
  range: number;
  armor: number;
  skill?: SkillDef;
}

/** 所持ユニット（ラン中の1体） */
export interface OwnedUnit {
  iid: number; // インスタンスID
  defId: string;
  star: 1 | 2 | 3;
  /** 盤面配置位置（null ならベンチ） */
  pos: { x: number; y: number } | null;
  /** 装備アイテムID（1枠） */
  item: string | null;
  /** 解体屋によるラン中の永続最大HP強化 */
  hpBonus?: number;
}

export type NodeType = "battle" | "elite" | "shop" | "rest" | "event" | "boss";

export interface MapNode {
  id: number;
  floor: number; // 0 が最下段
  col: number;
  type: NodeType;
  next: number[]; // 次フロアの接続先ノードID
}

export interface RunState {
  playerHp: number;
  playerMaxHp: number;
  gold: number;
  act: number; // 現在の幕（1〜3）
  asc: number; // アセンション段位（0〜20）
  actRule: string; // 現在の幕の掟ID
  startedAt: number; // ラン開始時刻（クリアタイム計測用）
  damageTaken: number; // 通算被ダメージ
  floorIndex: number; // 次に挑む（今いる）フロア
  currentNodeId: number | null;
  map: MapNode[];
  roster: OwnedUnit[];
  nextIid: number;
  battleCount: number;
  /** 配置上限増加演出を最後に表示した時点の上限 */
  lastShownTeamCap?: number;
  /** 所持レリックID */
  relics: string[];
  /** 幕ボス撃破で得る強力なエンシェントレリックID */
  ancientRelics: string[];
  /** 幕クリア画面で提示中の候補（リロードによる引き直し防止） */
  pendingAncientChoices: string[];
  /** ボス撃破後のエンシェント報酬を受け取った幕 */
  ancientRewardActs: number[];
  /** エンシェントレリック候補のリロールを使用済みの幕 */
  ancientRerollUsedActs?: number[];
  /** 次のショップへ取り置かれたアイテム候補 */
  carriedShopItems: string[];
  /** 現在のショップで残っている無料アイテム更新回数 */
  shopItemRerolls: number;
  shopRerollNodeId: number | null;
  /** 現在の闇商人訪問で残っている「血の取引」の回数 */
  rescueBloodTradesRemaining?: number;
  /** ラン終了報酬を受取済みか（再描画での二重取得防止） */
  legacyRewarded: boolean;
  /** 錬金術師が生成し、次戦闘開始時に自動使用されるポーション */
  potions: string[];
  /** 解体屋の累積スクラップ */
  scrap: number;
  /** 回収者の磁石で次戦へ持ち越すアイテムドロップ率補正（0〜0.24） */
  relicItemDropBonus: number;
  /** 未装備アイテムIDの在庫 */
  items: string[];
}

export type Screen =
  | { kind: "title" }
  | { kind: "starter" }
  | { kind: "map" }
  | { kind: "prepare"; node: MapNode }
  | { kind: "battle"; node: MapNode }
  | { kind: "result"; node: MapNode; win: boolean; hpLost: number }
  | { kind: "shop"; node: MapNode; rescue?: boolean }
  | { kind: "rest"; node: MapNode }
  | { kind: "event"; node: MapNode }
  | { kind: "actclear"; clearedAct: number }
  | { kind: "gameover"; win: boolean; abandoned?: boolean };
