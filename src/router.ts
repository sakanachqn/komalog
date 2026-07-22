import type { EnemyTeam } from "./data/enemies";
import type { RunState, Screen } from "./types";
import type { BattleUnitReport } from "./battle";

/** 画面間で共有するコンテキスト */
export const ctx: {
  run: RunState | null;
  enemyTeam: EnemyTeam | null;
  /** 戦闘速度（x1/x2/x3）。一度設定したら以降の戦闘でも保持 */
  battleSpeed: number;
  lastBattleReport: BattleUnitReport[];
} = { run: null, enemyTeam: null, battleSpeed: 1, lastBattleReport: [] };

let listener: (s: Screen) => void = () => {};

export function onNavigate(fn: (s: Screen) => void) {
  listener = fn;
}

export function go(s: Screen) {
  listener(s);
}
