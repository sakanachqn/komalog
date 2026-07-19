import type { MapNode, NodeType } from "./types";

export const FLOOR_COUNT = 11; // 0〜9 通常フロア + 10 ボス

/** スレスパ風の分岐マップを生成する */
export function generateMap(): MapNode[] {
  const nodes: MapNode[] = [];
  let nextId = 0;

  // 各フロアのノード列（フロア10はボス1つ）
  const floors: MapNode[][] = [];
  for (let f = 0; f < FLOOR_COUNT; f++) {
    const row: MapNode[] = [];
    if (f === FLOOR_COUNT - 1) {
      row.push({ id: nextId++, floor: f, col: 1, type: "boss", next: [] });
    } else {
      const count = 2 + Math.floor(Math.random() * 2); // 2〜3
      const cols = shuffle([0, 1, 2, 3]).slice(0, count).sort((a, b) => a - b);
      for (const col of cols) {
        row.push({ id: nextId++, floor: f, col, type: nodeTypeFor(f), next: [] });
      }
    }
    floors.push(row);
    nodes.push(...row);
  }

  // 接続: 各ノードは次フロアの列が近いノードへ 1〜2 本
  for (let f = 0; f < FLOOR_COUNT - 1; f++) {
    const cur = floors[f];
    const nxt = floors[f + 1];
    for (const n of cur) {
      const sorted = [...nxt].sort(
        (a, b) => Math.abs(a.col - n.col) - Math.abs(b.col - n.col),
      );
      const links = Math.random() < 0.45 && sorted.length > 1 ? 2 : 1;
      for (const t of sorted.slice(0, links)) {
        if (!n.next.includes(t.id)) n.next.push(t.id);
      }
    }
    // 到達不能ノードを救済（前フロアから誰も繋いでいないノード）
    for (const t of nxt) {
      if (!cur.some((n) => n.next.includes(t.id))) {
        const nearest = [...cur].sort(
          (a, b) => Math.abs(a.col - t.col) - Math.abs(b.col - t.col),
        )[0];
        nearest.next.push(t.id);
      }
    }
  }

  return nodes;
}

function nodeTypeFor(floor: number): NodeType {
  if (floor === 0) return "battle";
  if (floor === FLOOR_COUNT - 2) {
    // ボス前は休憩かショップ
    return Math.random() < 0.5 ? "rest" : "shop";
  }
  const r = Math.random();
  if (floor >= 3 && r < 0.15) return "elite";
  if (r < 0.55) return "battle";
  if (r < 0.7) return "shop";
  if (r < 0.85) return "event";
  return "rest";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const NODE_META: Record<NodeType, { icon: string; label: string }> = {
  battle: { icon: "⚔️", label: "戦闘" },
  elite: { icon: "💀", label: "エリート" },
  shop: { icon: "🛒", label: "ショップ" },
  rest: { icon: "🏕️", label: "休憩" },
  event: { icon: "❓", label: "イベント" },
  boss: { icon: "👑", label: "ボス" },
};
