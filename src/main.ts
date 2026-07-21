import "./style.css";
import { ctx, onNavigate, go } from "./router";
import { clearSave, saveGame } from "./save";
import type { Screen } from "./types";
import {
  renderActClear,
  renderBattle,
  renderEvent,
  renderGameover,
  renderMap,
  renderPrepare,
  renderResult,
  renderRest,
  renderShop,
  showCompendium,
  renderStarter,
  renderTitle,
} from "./screens";

const app = document.querySelector<HTMLDivElement>("#app")!;

/** 再開可能な画面に来たら自動セーブ */
function autoSave(s: Screen) {
  if (!ctx.run) return;
  if (s.kind === "gameover") {
    clearSave();
    return;
  }
  if (s.kind === "map" || s.kind === "prepare" || s.kind === "shop" || s.kind === "rest" || s.kind === "event") {
    saveGame({
      v: 1,
      run: ctx.run,
      battleSpeed: ctx.battleSpeed,
      resume: {
        kind: s.kind,
        nodeId: "node" in s ? s.node.id : undefined,
        rescue: s.kind === "shop" ? (s.rescue ?? false) : undefined,
      },
    });
  } else if (s.kind === "actclear") {
    saveGame({
      v: 1,
      run: ctx.run,
      battleSpeed: ctx.battleSpeed,
      resume: { kind: "actclear", clearedAct: s.clearedAct },
    });
  }
}

function render(s: Screen) {
  autoSave(s);
  app.innerHTML = "";
  switch (s.kind) {
    case "title":
      app.appendChild(renderTitle());
      break;
    case "starter":
      app.appendChild(renderStarter());
      break;
    case "map":
      app.appendChild(renderMap());
      break;
    case "prepare":
      app.appendChild(renderPrepare(s.node));
      break;
    case "battle":
      app.appendChild(renderBattle(s.node));
      break;
    case "result":
      app.appendChild(renderResult(s.node, s.win, s.hpLost));
      break;
    case "shop":
      app.appendChild(renderShop(s.node, s.rescue ?? false));
      break;
    case "rest":
      app.appendChild(renderRest(s.node));
      break;
    case "event":
      app.appendChild(renderEvent(s.node));
      break;
    case "actclear":
      app.appendChild(renderActClear(s.clearedAct));
      break;
    case "gameover":
      app.appendChild(renderGameover(s.win, s.abandoned ?? false));
      break;
  }
  if (s.kind !== "title") {
    const book = document.createElement("button");
    book.className = "global-compendium-btn";
    book.textContent = "📚 図鑑";
    book.title = "ユニット・シナジー・アイテム図鑑";
    book.addEventListener("click", () => showCompendium());
    app.appendChild(book);
  }
}

onNavigate(render);
go({ kind: "title" });

// 開発用: コンソールからラン状態を確認・操作できるようにする
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = ctx;
}
