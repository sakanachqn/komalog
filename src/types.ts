export type TraitId =
  | "warrior"
  | "ranger"
  | "mage"
  | "guardian"
  | "assassin"
  | "berserker"
  | "priest"
  | "undead"
  | "spirit";

export type SkillType =
  | "nuke" // 対象に魔法ダメージ
  | "aoe" // 対象周辺に魔法ダメージ
  | "heal" // 最もHPの低い味方を回復
  | "shield" // 自身にシールド
  | "multishot" // ランダムな敵複数に攻撃
  | "execute" // 最もHPの低い敵に大ダメージ
  | "pierce" // 対象とその後方に物理ダメージ
  | "frost"; // 対象周辺にダメージ+攻撃速度低下

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
  cost: 1 | 2 | 3;
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
  /** 所持レリックID */
  relics: string[];
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
  | { kind: "gameover"; win: boolean };
