import "./style.css";
import { ctx, onNavigate, go } from "./router";
import { clearSave, saveGame } from "./save";
import type { Screen } from "./types";
import { initHoverTooltips } from "./hoverTooltip";
import { applySettingsClass } from "./settings";
import { initBgm, setBgmScene } from "./bgm";
import { initUiButtonSounds } from "./sound";
import { isDebugAllAchievements, setDebugAllAchievements } from "./meta";
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
initHoverTooltips();
applySettingsClass();
initBgm();
initUiButtonSounds();

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, select") || target?.isContentEditable) return;
  if (event.key === "Escape") {
    const overlay = [...document.querySelectorAll<HTMLElement>(".modal-overlay")].at(-1);
    if (overlay) { event.preventDefault(); overlay.remove(); }
    return;
  }
  if (document.querySelector(".modal-overlay")) return;
  if (event.code === "Space") {
    const start = document.querySelector<HTMLButtonElement>('[data-shortcut="battle-start"]:not(:disabled)');
    if (start) { event.preventDefault(); start.click(); }
    return;
  }
  if (event.key.toLowerCase() === "r") {
    const reroll = document.querySelector<HTMLButtonElement>('[data-shortcut="shop-reroll"]:not(:disabled)');
    if (reroll) { event.preventDefault(); reroll.click(); }
    return;
  }
  if (/^[1-3]$/.test(event.key)) {
    const speed = document.querySelector<HTMLButtonElement>('[data-shortcut="battle-speed"]');
    if (!speed) return;
    const desired = Number(event.key);
    let guard = 0;
    while (ctx.battleSpeed !== desired && guard++ < 3) speed.click();
  }
});

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
  if (s.kind === "title" || s.kind === "starter" || s.kind === "gameover") {
    setBgmScene("title");
  } else {
    const act = Math.max(1, Math.min(3, ctx.run?.act ?? 1));
    setBgmScene(act === 1 ? "stage1" : act === 2 ? "stage2" : "stage3");
  }
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
  if (s.kind !== "title" && s.kind !== "prepare") {
    const book = document.createElement("button");
    book.className = "global-compendium-btn";
    book.textContent = "📚 図鑑";
    book.title = "ユニット・シナジー・アイテム図鑑";
    book.addEventListener("click", () => showCompendium());
    app.appendChild(book);
  }
  if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
    const debugAchievements = document.createElement("button");
    debugAchievements.className = `local-achievement-toggle${isDebugAllAchievements() ? " active" : ""}`;
    debugAchievements.textContent = isDebugAllAchievements() ? "🏆 実績：全解除表示" : "◻️ 実績：通常表示";
    debugAchievements.title = "実績セーブを変更せず、全解除状態の表示だけを切り替えます";
    debugAchievements.addEventListener("click", () => {
      setDebugAllAchievements(!isDebugAllAchievements());
      render(s);
    });
    app.appendChild(debugAchievements);
  }
}

onNavigate(render);
go({ kind: "title" });

// 開発用: コンソールからラン状態を確認・操作できるようにする
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = ctx;
}
