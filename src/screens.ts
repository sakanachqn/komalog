import {
  Battle,
  CRIT_MULT,
  ENEMY_CRIT_CHANCE,
  TICK_MS,
  computeTraits,
  enemyMults,
  previewAllyStats,
} from "./battle";
import type { BattleEvent, CombatUnit } from "./battle";
import { enemyTeamFor } from "./data/enemies";
import { ANCIENT_RELIC_BY_ID, ANCIENT_RELICS, rollAncientRelicChoices } from "./data/ancientRelics";
import { BASE_ITEM_IDS, CRAFT_RECIPES, ITEMS, ITEM_BY_ID, RELICS, RELIC_BY_ID, craftResult, rollItem, rollRelicChoices } from "./data/relics";
import { TRAITS, UNITS, UNIT_BY_ID, rollUnitDef } from "./data/units";
import { loadGame, saveGame } from "./save";
import type { SaveData } from "./save";
import { isMuted, sfx, toggleMute } from "./sound";
import { ASC_LEVELS, MAX_ASC, ascMods } from "./ascension";
import { ACT_RULE_BY_ID, rollActRule } from "./data/actrules";
import { LEGACY_UPGRADES, UNLOCK_INFO, bumpCounter, buyLegacy, discoverAncientRelics, discoverRelics, grantUnlock, hasAchievementMilestone, hasLegacy, hasUnlock, legacyLevel, meta, recheckPersistentAchievements, saveMeta } from "./meta";
import { FLOOR_COUNT, NODE_META } from "./map";
import { ctx, go } from "./router";
import {
  BENCH_SIZE,
  BOARD_COLS,
  BOARD_ROWS,
  addUnit,
  autoPlace,
  benchUnits,
  boardUnits,
  globalFloor,
  maxedDefIds,
  newRun,
  sellUnit,
  teamCap,
  unitDef,
} from "./state";
import { generateMap } from "./map";
import type { EnemyDef, MapNode, OwnedUnit, RunState, TraitId, UnitDef } from "./types";
import { itemArt, synergyArt, unitArt } from "./artIcons";
import { tagEnemyTooltip } from "./hoverTooltip";
import { gameSettings, updateSettings } from "./settings";

/* ================= ヘルパー ================= */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", cls, label);
  b.addEventListener("click", onClick);
  return b;
}

function showAttentionMessage(target: HTMLElement, text: string): void {
  target.textContent = text;
  target.classList.remove("attention-message");
  // 同じ警告を続けて出した場合もアニメーションを再生する
  void target.offsetWidth;
  target.classList.add("attention-message");
}

function showNormalMessage(target: HTMLElement, text: string): void {
  target.classList.remove("attention-message");
  target.textContent = text;
}

function purchaseStarUpgrade(run: RunState, defId: string): 2 | 3 | null {
  const star1 = run.roster.filter((unit) => unit.defId === defId && unit.star === 1).length;
  if (star1 < 2) return null;
  const star2 = run.roster.filter((unit) => unit.defId === defId && unit.star === 2).length;
  return star2 >= 2 ? 3 : 2;
}

function showRewardBenchSale(def: UnitDef, onReceived: () => void): void {
  if (document.querySelector(".reward-sale-overlay")) return;
  const run = ctx.run!;
  const overlay = el("div", "modal-overlay reward-sale-overlay");
  const panel = el("div", "modal-panel reward-sale-panel");
  const head = el("div", "modal-head");
  head.append(el("h2", "", "🪑 ベンチがいっぱいです"), btn("✕", "modal-close", () => overlay.remove()));
  panel.append(
    head,
    el("div", "reward-pending", `${def.icon} ${def.name} を迎えるため、ベンチのユニットを1体売却してください。`),
  );
  const list = el("div", "reward-sale-list");
  for (const owned of benchUnits(run)) {
    const ownedDef = unitDef(owned);
    const value = ownedDef.cost * (owned.star === 1 ? 1 : owned.star === 2 ? 3 : 9);
    const card = el("div", "reward-sale-unit");
    const identity = el("span", "reward-sale-identity", `${ownedDef.icon} ${ownedDef.name} ${starsText(owned.star)}`);
    identity.dataset.unitTooltip = ownedDef.id;
    card.append(
      identity,
      btn(`売却して受取 (+${value}G)`, "danger", () => {
        sellUnit(run, owned.iid);
        if (!addUnit(run, def)) return;
        sfx.coin();
        overlay.remove();
        onReceived();
      }),
    );
    list.appendChild(card);
  }
  panel.append(list, btn("報酬選択に戻る", "", () => overlay.remove()));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

function showAbandonConfirm(onConfirm: () => void): void {
  if (document.querySelector(".abandon-overlay")) return;
  const overlay = el("div", "modal-overlay abandon-overlay");
  const panel = el("div", "modal-panel abandon-confirm");
  panel.append(
    el("h2", "", "🏳️ このランを諦めますか？"),
    el("p", "", "現在の冒険を終了してタイトルへ戻ります。到達度に応じた記憶の欠片は獲得できます。"),
  );
  const actions = el("div", "toolbar");
  actions.append(
    btn("冒険を続ける", "primary", () => overlay.remove()),
    btn("諦めて終了", "danger", () => { overlay.remove(); onConfirm(); }),
  );
  panel.appendChild(actions);
  overlay.appendChild(panel);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function showBloodTradeConfirm(run: RunState, onConfirm: () => void): void {
  if (!gameSettings().confirmBloodTrade) { onConfirm(); return; }
  if (document.querySelector(".blood-trade-confirm-overlay")) return;
  const overlay = el("div", "modal-overlay blood-trade-confirm-overlay");
  const panel = el("div", "modal-panel abandon-confirm");
  panel.append(
    el("h2", "", "🩸 血の取引を行いますか？"),
    el("p", "", `最大HP ${run.playerMaxHp} → ${run.playerMaxHp - 5}\n15Gを受け取ります。`),
  );
  const actions = el("div", "toolbar");
  actions.append(
    btn("やめる", "", () => overlay.remove()),
    btn("最大HPを捧げる", "danger", () => { overlay.remove(); onConfirm(); }),
  );
  panel.appendChild(actions);
  overlay.appendChild(panel);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function showSettings(): void {
  if (document.querySelector(".settings-overlay")) return;
  const overlay = el("div", "modal-overlay settings-overlay");
  const panel = el("div", "modal-panel settings-panel");
  const head = el("div", "modal-head");
  head.append(el("h2", "", "⚙️ 設定"), btn("✕", "modal-close", () => overlay.remove()));
  const body = el("div", "settings-body");
  const volumeRow = (label: string, value: number, onChange: (value: number) => void) => {
    const row = el("label", "setting-row");
    const text = el("span", "", `${label} ${Math.round(value * 100)}%`);
    const slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.value = String(Math.round(value * 100));
    slider.addEventListener("input", () => { text.textContent = `${label} ${slider.value}%`; onChange(Number(slider.value) / 100); });
    row.append(text, slider);
    return row;
  };
  const toggleRow = (label: string, desc: string, checked: boolean, onChange: (value: boolean) => void) => {
    const row = el("label", "setting-toggle");
    const copy = el("span"); copy.append(el("b", "", label), el("small", "", desc));
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    row.append(copy, input); return row;
  };
  body.append(
    volumeRow("SE音量", gameSettings().seVolume, (value) => { updateSettings({ seVolume: value }); sfx.preview(); }),
    volumeRow("BGM音量", gameSettings().bgmVolume, (value) => updateSettings({ bgmVolume: value })),
    toggleRow("画面揺れ", "クリティカルや大技で盤面を揺らす", gameSettings().screenShake, (value) => updateSettings({ screenShake: value })),
    toggleRow("演出を軽減", "閃光・衝撃波・細かなパーティクルを減らす", gameSettings().reducedEffects, (value) => updateSettings({ reducedEffects: value })),
    toggleRow("血の取引を確認", "最大HPを失う前に確認画面を表示する", gameSettings().confirmBloodTrade, (value) => updateSettings({ confirmBloodTrade: value })),
  );
  panel.append(head, body, btn("閉じる", "primary", () => overlay.remove()));
  overlay.appendChild(panel);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function showTutorial(): void {
  if (document.querySelector(".tutorial-overlay")) return;
  const overlay = el("div", "modal-overlay tutorial-overlay");
  const panel = el("div", "modal-panel tutorial-panel");
  const head = el("div", "modal-head");
  head.append(el("h2", "", "🎓 はじめての実戦"), btn("✕", "modal-close", () => overlay.remove()));
  const progress = el("div", "tutorial-progress");
  const body = el("div", "tutorial-body");
  const foot = el("div", "tutorial-foot");
  let step = 0;
  let gold = 5;
  let bought = false;
  let placed = false;

  const setProgress = () => {
    progress.replaceChildren(...Array.from({ length: 6 }, (_, i) => {
      const dot = el("span", i === step ? "active" : i < step ? "done" : "", String(i + 1));
      return dot;
    }));
  };
  const next = (label = "次へ") => btn(label, "primary", () => { step++; render(); });
  const note = (text: string) => el("p", "tutorial-note", text);

  const render = () => {
    setProgress(); body.replaceChildren(); foot.replaceChildren();
    if (step === 0) {
      body.append(
        el("h3", "", "1. マップで次の行き先を選ぶ"),
        note("このゲームは、マスを選んで進む全3幕のローグライトです。HPが0になる前に各幕のボス撃破を目指します。"),
      );
      const map = el("div", "tutorial-map");
      map.append(el("span", "done", "⚔️"), el("i", ""), el("span", "choice", "🛒"), el("i", ""), el("span", "", "👹"));
      body.append(map, el("div", "tutorial-legend", "⚔️ 戦闘　 🛒 ショップ　 ？ イベント　 🔥 エリート　 👹 ボス"));
      foot.append(next());
    } else if (step === 1) {
      body.append(el("h3", "", "2. ショップで仲間を雇う"), note("ユニットにはコスト・特性・スキルがあります。同じユニットを3体集めると★2になり、さらに3体分集めると★3になります。"));
      const wallet = el("div", "tutorial-wallet", `💰 ${gold}G`);
      const shop = el("div", "tutorial-shop-card");
      shop.append(el("b", "", "🤺 剣士"), el("span", "", "1コスト・戦士"), el("small", "", "前方を斬りつけて物理ダメージ"));
      const buy = btn(bought ? "購入済み" : "1Gで購入", bought ? "" : "primary", () => {
        if (bought) return; bought = true; gold--; wallet.textContent = `💰 ${gold}G`; buy.textContent = "購入済み"; buy.disabled = true;
        foot.replaceChildren(next("編成へ"));
      });
      shop.appendChild(buy); body.append(wallet, shop);
      if (!bought) foot.append(note("「1Gで購入」を押してみよう")); else foot.append(next("編成へ"));
    } else if (step === 2) {
      body.append(el("h3", "", "3. 盤面にドラッグして配置する"), note("緑側が味方の配置エリアです。前衛は前、遠距離や支援役は後ろが基本。ユニットの移動・入れ替え・ベンチ整理はドラッグ＆ドロップで行います。"));
      const guide = el("div", "tutorial-guide", placed ? "配置成功！ 前衛が敵を受け止めます" : "下の剣士を光っているマスへドラッグしよう");
      const field = el("div", "tutorial-field");
      const enemy = el("div", "tutorial-enemy", "👺");
      const target = el("div", "tutorial-target", "前衛マス");
      field.append(enemy, target);
      const bench = el("div", "tutorial-bench");
      const unit = el("div", "tutorial-unit", "🤺"); unit.title = "剣士（戦士）";
      bench.append(el("span", "", "ベンチ"), unit);
      if (placed) { target.textContent = ""; target.appendChild(unit); unit.classList.add("placed"); }
      let dragging = false; let dragStart = { x: 0, y: 0 };
      unit.addEventListener("pointerdown", (event) => { dragging = true; dragStart = { x: event.clientX, y: event.clientY }; unit.setPointerCapture(event.pointerId); unit.classList.add("dragging"); });
      unit.addEventListener("pointermove", (event) => { if (dragging) unit.style.transform = `translate(${event.clientX - dragStart.x}px, ${event.clientY - dragStart.y}px)`; });
      unit.addEventListener("pointerup", (event) => {
        if (!dragging) return; dragging = false; unit.releasePointerCapture(event.pointerId); unit.classList.remove("dragging"); unit.style.transform = "";
        const box = target.getBoundingClientRect();
        if (event.clientX >= box.left - 35 && event.clientX <= box.right + 35 && event.clientY >= box.top - 35 && event.clientY <= box.bottom + 35) { placed = true; target.textContent = ""; target.appendChild(unit); unit.classList.add("placed"); guide.textContent = "配置成功！ 前衛が敵を受け止めます"; foot.replaceChildren(next()); }
      });
      body.append(guide, field, bench); if (placed) foot.append(next());
    } else if (step === 3) {
      body.append(el("h3", "", "4. シナジーと装備で編成を強くする"), note("盤面上に同じ特性を持つ仲間を必要数並べるとシナジーが発動します。右側の一覧では、黄色の数字まで効果が発動していることを示します。"));
      const trait = el("div", "tutorial-trait-card");
      trait.innerHTML = `<b>⚔️ 戦士 <span>(<em>2</em>/4/6):2</span></b><p>戦士の攻撃力と防御力が上昇</p><div><strong>発動中</strong> 2体効果：攻撃力 +15%、アーマー +10</div>`;
      const tips = el("div", "tutorial-tip-grid");
      tips.append(el("span", "", "🗡️ 剣系アイテム\n攻撃力参照スキルと好相性"), el("span", "", "🪄 杖系アイテム\n呪文威力参照スキルと好相性"));
      body.append(trait, tips, note("アイテムはユニットへドラッグして装備できます。通常アイテム2個は合成工房で強力な合成アイテムにもできます。")); foot.append(next());
    } else if (step === 4) {
      body.append(el("h3", "", "5. 戦闘は自動。始める前の準備が勝負"), note("戦闘中は自動で移動・通常攻撃・スキル発動を行います。速度は1～3倍に変更でき、選んだ速度は次の戦闘にも引き継がれます。"));
      const field = el("div", "tutorial-field battle-demo");
      const enemy = el("div", "tutorial-enemy", "👺"); const unit = el("div", "tutorial-unit placed", "🤺"); const mana = el("div", "tutorial-mana", "マナ 40 / 100");
      field.append(enemy, unit, mana); body.append(field);
      const start = btn("⚔️ 戦闘開始", "primary", () => {
        start.disabled = true; start.textContent = "戦闘中…"; unit.classList.add("tutorial-attacking"); enemy.classList.add("tutorial-defeated");
        setTimeout(() => { start.textContent = "勝利！"; foot.replaceChildren(next("報酬を受け取る")); }, gameSettings().reducedEffects ? 250 : 850);
      }); body.appendChild(start);
    } else {
      body.append(el("h3", "", "6. 勝利報酬を選び、次の戦いへ"), note("戦闘後はゴールドやユニットなど、今の編成に合う報酬を選びます。ショップ・イベント・レリックも利用しながらビルドを完成させましょう。"));
      const rewards = el("div", "tutorial-rewards");
      rewards.append(el("button", "selected", "💰 5G\n安定した買い物資金"), el("button", "", "🤺 剣士\n★強化を狙う"), el("button", "", "🎁 アイテム\nエースを強化"));
      for (const reward of rewards.querySelectorAll("button")) reward.addEventListener("click", () => { rewards.querySelectorAll("button").forEach((b) => b.classList.remove("selected")); reward.classList.add("selected"); });
      body.append(rewards, el("div", "tutorial-final-tips", "覚えておくと便利：ユニットやシナジーにカーソルを合わせると詳細を確認できます。困ったときは右上の「？」から遊び方をいつでも開けます。"));
      foot.append(btn("チュートリアル完了", "primary", () => overlay.remove()));
    }
  };
  panel.append(head, progress, body, foot);
  overlay.appendChild(panel); document.body.appendChild(overlay);
  render();
}

function compactVolumeControl(label: string, value: number, onChange: (value: number) => void): HTMLElement {
  const row = el("label", "title-volume-row");
  const text = el("span", "", `${label} ${Math.round(value * 100)}%`);
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = String(Math.round(value * 100));
  slider.addEventListener("input", () => {
    text.textContent = `${label} ${slider.value}%`;
    onChange(Number(slider.value) / 100);
  });
  row.append(text, slider);
  return row;
}

function hud(run: RunState, onAbandon?: () => void): HTMLElement {
  discoverRelics(run.relics);
  discoverAncientRelics(run.ancientRelics);
  const h = el("div", "hud");
  const currentCap = teamCap(run);
  if (run.lastShownTeamCap === undefined) {
    run.lastShownTeamCap = currentCap;
  } else if (currentCap > run.lastShownTeamCap) {
    const previousCap = run.lastShownTeamCap;
    run.lastShownTeamCap = currentCap;
    requestAnimationFrame(() => showTeamCapIncrease(previousCap, currentCap));
  } else if (currentCap < run.lastShownTeamCap) {
    run.lastShownTeamCap = currentCap;
  }
  const progress = Math.min(100, ((run.floorIndex + 1) / FLOOR_COUNT) * 100);
  const journey = el("span", "hud-journey");
  journey.append(
    el("b", "", `第${run.act}幕`),
    el("small", "", `${Math.min(run.floorIndex + 1, FLOOR_COUNT)} / ${FLOOR_COUNT}`),
  );
  const progressTrack = el("i", "hud-progress");
  progressTrack.style.setProperty("--progress", `${progress}%`);
  journey.appendChild(progressTrack);
  h.append(journey, el("span", "hp", `❤️ ${run.playerHp}/${run.playerMaxHp}`), el("span", "gold", `💰 ${run.gold}G`));
  if (run.potions.length > 0) h.appendChild(el("span", "", `⚗️ ${run.potions.length}`));
  if (run.scrap > 0) h.appendChild(el("span", "", `🔧 ${run.scrap}/5`));
  if (run.relics.length > 0) {
    const row = el("span", "relic-row");
    for (const id of run.relics) {
      const d = RELIC_BY_ID.get(id)!;
      const icon = el("span", "relic-icon", d.icon);
      icon.dataset.relicTooltip = d.id;
      icon.title = `${d.name}: ${d.desc}`;
      row.appendChild(icon);
    }
    h.appendChild(row);
  }
  if (run.ancientRelics.length > 0) {
    const row = el("span", "relic-row ancient-relic-row");
    for (const id of run.ancientRelics) {
      const d = ANCIENT_RELIC_BY_ID.get(id);
      if (!d) continue;
      const icon = el("span", "relic-icon ancient-relic-icon", d.icon);
      icon.dataset.ancientRelicTooltip = d.id;
      icon.title = `エンシェントレリック「${d.name}」: ${d.desc}`;
      row.appendChild(icon);
    }
    h.appendChild(row);
  }
  h.append(el("span", "spacer"), el("span", "", `配置上限 ${currentCap}体`));
  const abandonBtn = el("button", "abandon-btn", "🏳️ 諦める");
  abandonBtn.title = "現在のランを終了する";
  abandonBtn.addEventListener("click", () => showAbandonConfirm(onAbandon ?? (() => go({ kind: "gameover", win: false, abandoned: true }))));
  h.appendChild(abandonBtn);
  const helpBtn = el("button", "mute-btn", "？");
  helpBtn.title = "遊び方を見る";
  helpBtn.addEventListener("click", () => showHelp());
  h.appendChild(helpBtn);
  const settingsBtn = el("button", "mute-btn", "⚙️");
  settingsBtn.title = "設定を開く";
  settingsBtn.addEventListener("click", showSettings);
  h.appendChild(settingsBtn);
  const muteBtn = el("button", "mute-btn", isMuted() ? "🔇" : "🔊");
  muteBtn.title = "BGM・効果音のオン/オフ";
  muteBtn.addEventListener("click", () => {
    muteBtn.textContent = toggleMute() ? "🔇" : "🔊";
  });
  h.appendChild(muteBtn);
  return h;
}

function showTeamCapIncrease(previous: number, current: number): void {
  document.querySelector(".team-cap-toast")?.remove();
  const toast = el("div", "team-cap-toast");
  const slots = el("div", "team-cap-slots");
  for (let i = 0; i < current; i++) slots.appendChild(el("i", i >= previous ? "new" : ""));
  toast.append(
    el("small", "", "編成枠拡張"),
    el("b", "", `配置上限 ${previous} → ${current}`),
    slots,
    el("span", "", `盤面に配置できるユニットが${current - previous}体増えました`),
  );
  document.body.appendChild(toast);
  sfx.ui("confirm");
  setTimeout(() => toast.remove(), gameSettings().reducedEffects ? 1800 : 3300);
}

function cellPos(x: number, y: number): { left: string; top: string } {
  return {
    left: `calc(6px + ${x} * (var(--cell) + 2px))`,
    top: `calc(6px + ${y} * (var(--cell) + 2px))`,
  };
}

function starsText(star: number): string {
  return "★".repeat(star);
}

function skillScalingLabel(scaling: UnitDef["skill"]["scaling"]): string {
  return scaling === "attack" ? "⚔️ 攻撃力参照" : "🔮 呪文威力参照";
}

/** 7x8 の盤面グリッドを作る。cells[y][x] でセル要素にアクセス */
function makeBoard(): { wrap: HTMLElement; board: HTMLElement; cells: HTMLElement[][] } {
  const wrap = el("div", "board-wrap");
  const board = el("div", "board");
  const cells: HTMLElement[][] = [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    const row: HTMLElement[] = [];
    for (let x = 0; x < BOARD_COLS; x++) {
      const c = el("div", `cell ${y < 4 ? "enemy-zone" : "ally-zone"}`);
      c.dataset.x = String(x);
      c.dataset.y = String(y);
      board.appendChild(c);
      row.push(c);
    }
    cells.push(row);
  }
  wrap.appendChild(board);
  return { wrap, board, cells };
}

/** 手持ちの一覧（盤面・ベンチ・アイテム）を読み取り専用で表示 */
function rosterStrip(run: RunState): HTMLElement {
  const wrap = el("div", "roster-strip");
  const section = (label: string, units: OwnedUnit[]) => {
    const box = el("span", "rs-section");
    box.appendChild(el("span", "rs-label", label));
    if (units.length === 0) box.appendChild(el("span", "rs-empty", "—"));
    for (const u of units) {
      const d = unitDef(u);
      const chip = el("span", "rs-chip");
      chip.append(unitArt(d), el("sup", "rs-star", "★".repeat(u.star)));
      if (u.item) chip.appendChild(itemArt(ITEM_BY_ID.get(u.item)!, "rs-item"));
      chip.title = `${d.name} ${"★".repeat(u.star)}${u.item ? ` / ${ITEM_BY_ID.get(u.item)!.name}` : ""}\n${d.traits.map((t) => TRAITS[t].icon + TRAITS[t].name).join(" ")}`;
      box.appendChild(chip);
    }
    return box;
  };
  wrap.appendChild(section("盤面", boardUnits(run)));
  wrap.appendChild(section("ベンチ", benchUnits(run)));
  if (run.items.length > 0) {
    const box = el("span", "rs-section");
    box.appendChild(el("span", "rs-label", "🎒"));
    for (const id of run.items) {
      const d = ITEM_BY_ID.get(id)!;
      const chip = el("span", "rs-chip");
      chip.appendChild(itemArt(d));
      chip.title = `${d.name}: ${d.desc}`;
      box.appendChild(chip);
    }
    wrap.appendChild(box);
  }
  return wrap;
}

function traitPanel(board: OwnedUnit[]): HTMLElement {
  const p = el("div", "panel");
  p.appendChild(el("h3", "", "シナジー"));
  const statuses = computeTraits(board, ctx.run?.ancientRelics ?? []);
  if (statuses.length === 0) p.appendChild(el("div", "trait-row inactive", "ユニットを配置しよう"));
  for (const s of statuses) {
    const info = TRAITS[s.trait];
    const row = el("div", `trait-row ${s.tier > 0 ? "active" : "inactive"}`);
    row.dataset.traitTooltip = s.trait;
    row.dataset.traitTier = String(s.tier);

    // 「⚔️ 戦士 (2/4/6):3」形式。達成済みの閾値だけ色を変える
    const label = el("span", "trait-name");
    const traitTitle = el("span");
    traitTitle.append(synergyArt(s.trait), document.createTextNode(` ${info.name}`));
    label.appendChild(traitTitle);
    const th = el("span", "trait-th");
    th.appendChild(el("span", "th-paren", "("));
    info.thresholds.forEach((t, i) => {
      if (i > 0) th.appendChild(el("span", "th-sep", "/"));
      th.appendChild(el("span", `th${s.count >= t ? " reached" : ""}`, String(t)));
    });
    th.appendChild(el("span", "th-paren", ")"));
    label.appendChild(th);
    label.appendChild(el("span", "trait-count", `:${s.count}`));

    // 次の段階までの残り（すべて到達済みなら省略）
    const next = info.thresholds.find((t) => s.count < t);
    const desc =
      s.tier > 0
        ? info.desc(s.tier) + (next ? `（あと${next - s.count}体）` : "")
        : `あと${info.thresholds[0] - s.count}体で発動`;

    row.append(label, el("span", "desc", desc));
    p.appendChild(row);
  }
  return p;
}

/** プレイした感想を送るGoogleフォーム */
const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSc9mRujMLrt2HAwvRpEVEzfcIRlMopVetpaZ19wzRN3wCr95g/viewform";

/* ================= 遊び方（ヘルプ） ================= */

const HELP_HTML = `
<section>
  <h4>🎯 目的</h4>
  <p>全3幕の分岐マップを進み、各幕の主を倒そう。最後に待つ<b>魔王</b>を討伐すればクリア。
  戦闘に負けるとプレイヤーHPが減り、<b>0になるとゲームオーバー</b>だ。</p>
</section>
<section>
  <h4>⚔️ 1ターンの流れ</h4>
  <ol>
    <li>マップで次に進むノードを選ぶ</li>
    <li>準備画面でユニットを盤面に配置する</li>
    <li>「戦闘開始」を押すと<b>自動で戦闘</b>（操作は不要）</li>
    <li>勝てばゴールドと報酬、負ければプレイヤーHPが減る</li>
  </ol>
</section>
<section>
  <h4>🖱️ 配置のしかた</h4>
  <ul>
    <li>ユニットは<b>ドラッグ＆ドロップ</b>で移動・入れ替え・ベンチ出し入れができる</li>
    <li><b>クリックするとステータス</b>を表示（敵ユニットもクリックできる）</li>
    <li>盤面に置ける数は「配置上限」まで。ゲームが進むと増える</li>
    <li>戦闘開始時、盤面に空きがあれば<b>ベンチの左から自動で配置</b>される</li>
    <li>近接ユニットは前列、遠距離ユニットは後列に置くのが基本</li>
  </ul>
</section>
<section>
  <h4>⭐ 星アップ</h4>
  <p>同じユニットを<b>3体</b>集めると自動で★2に、★2を3体集めると★3になる。
  星が上がるとステータスが大きく伸びる（★2で1.8倍、★3で3.2倍）。
  ★3にしたユニットはショップや報酬に出なくなる。</p>
</section>
<section>
  <h4>🔗 シナジー</h4>
  <p>同じ特性を持つユニットを複数並べると効果が発動する。表示の読み方：</p>
  <p class="help-example">⚔️ 戦士 <span class="th reached">2</span>/<span class="th">4</span>/<span class="th">6</span>:3　防御力 +20</p>
  <p>これは「2体で発動・4体と6体で強化」のシナジーに現在<b>3体</b>並んでいる状態。
  達成した閾値だけが<b>金色に点灯</b>する。同じ種類のユニットは何体いても1体としてカウントされる。</p>
</section>
<section>
  <h4>🎒 アイテム</h4>
  <ul>
    <li>ユニット1体につき<b>1つだけ</b>装備できる</li>
    <li>装備は🎒欄からドラッグ＆ドロップ、またはクリック→ユニットをクリック</li>
    <li>通常アイテムを合成工房の素材1・2へ<b>ドラッグ＆ドロップ</b>すると、組み合わせに応じた強力な上位アイテムになる</li>
  </ul>
</section>
<section>
  <h4>🏺 レリック</h4>
  <p>ラン全体に効き続ける永続強化。エリート撃破の報酬、ショップ、イベントで手に入る。
  所持中のレリックは画面上部にアイコンで並ぶ（カーソルを合わせると効果が見える）。</p>
</section>
<section>
  <h4>✨ エンシェントレリック</h4>
  <p><b>第1幕と第2幕のボス撃破後</b>に、3つの候補から1つだけ選べる特別な遺物。
  配置上限を倍にする、特定シナジーの戦い方を変えるなど、通常レリックより強力で特殊な効果を持つ。
  画面上部では輝く枠のアイコンで表示され、ラン終了まで変更できない。</p>
</section>
<section>
  <h4>🗺️ マップのノード</h4>
  <ul>
    <li>⚔️ <b>戦闘</b> … 通常の戦闘。勝つとゴールドと仲間を1体もらえる</li>
    <li>💀 <b>エリート</b> … 強敵。勝つと<b>レリック</b>とアイテムが確定で手に入る</li>
    <li>🛒 <b>ショップ</b> … ユニット・アイテム・レリックを購入、手持ちの売却もできる</li>
    <li>🏕️ <b>休憩</b> … HP回復か、手持ちユニットの複製（星アップの近道）を選ぶ</li>
    <li>❓ <b>イベント</b> … 選択肢によって良いことも悪いことも起きる</li>
    <li>👑 <b>ボス</b> … その幕の主。倒すと次の幕へ進める</li>
  </ul>
</section>
<section>
  <h4>💰 ゴールドの使い道</h4>
  <p>ショップでユニット（コスト分のG）、アイテム、レリックを買える。リロールで品揃えを引き直すことも可能。
  いらないユニットは<b>売却</b>してゴールドに戻せる（星が高いほど高値）。</p>
</section>
<section>
  <h4>📊 ユニットのステータス</h4>
  <ul>
    <li><b>HP</b> … 受けられるダメージ量。0になると戦闘不能になる</li>
    <li><b>攻撃力</b> … 通常攻撃と、説明に「攻撃力参照」とあるスキルの威力に影響する</li>
    <li><b>呪文威力</b> … 「呪文威力参照」のスキルによるダメージ・回復・シールド量を強化する</li>
    <li><b>攻撃速度</b> … 1秒間に行う通常攻撃の回数。高いほど攻撃とマナ獲得が速い</li>
    <li><b>クリティカル率</b> … 通常攻撃がクリティカルになる確率</li>
    <li><b>クリティカルダメージ</b> … クリティカル発生時に与えるダメージ倍率</li>
    <li><b>射程</b> … 攻撃可能な距離。近距離(1)・中距離(2)・遠距離(3以上)で表示される</li>
    <li><b>防御</b> … 物理ダメージを軽減する。高いほど物理攻撃に強い</li>
    <li><b>開始マナ</b> … 戦闘開始時点で所持しているマナ。必要マナまで溜まるとスキルを使用する</li>
  </ul>
  <p>ユニットを選択するか、ショップ・報酬などのユニットへカーソルを合わせると詳細を確認できる。</p>
</section>
<section>
  <h4>🛡️ シールドとマナ</h4>
  <p>HPバーの<b>白い部分がシールド</b>。ダメージを肩代わりするが、<b>時間とともに少しずつ剥がれる</b>。
  その下の青いバーが<b>マナ</b>で、攻撃したり被弾したりで溜まり、満タンになるとスキルが発動する。</p>
</section>
<section>
  <h4>💀 負けたときは</h4>
  <p>戦闘に負けてもマップは進める（プレイヤーHPは減る）。
  <b>ボス戦に負けた場合</b>はダメージが大きい代わりに、割高だが品揃えの良い<b>闇商人</b>が現れる。
  そこで立て直してからボスに再挑戦しよう。</p>
</section>
<section>
  <h4>🔥 アセンション（挑戦段位）</h4>
  <p>クリアすると次の段位が解放される。段位を上げるごとに<b>重いデバフと軽いバフ</b>がセットで追加され、
  5・10・15・20段では特殊なバフも手に入る。腕試しにどうぞ。</p>
</section>
<section>
  <h4>🔮 記憶の祭壇（恒久解放）</h4>
  <p>HPが0になったとき、または第3幕をクリアしたとき、到達地点や勝利数に応じて<b>記憶の欠片</b>を獲得する。
  タイトル画面の「記憶の祭壇」で、新ユニットやショップ機能、開始時ボーナスを恒久的に解放できる。</p>
</section>
<section>
  <h4>💡 コツ</h4>
  <ul>
    <li>序盤は安いユニットを3体集めて<b>★2</b>を作ると一気に強くなる</li>
    <li>多くのシナジーは2体で発動する。同系統を意識して集めよう</li>
    <li>ゲームは自動セーブされる。タイトルの「続きから」で再開できる</li>
  </ul>
</section>
`;

export function showHelp() {
  const overlay = el("div", "modal-overlay");
  const panel = el("div", "modal-panel");
  const head = el("div", "modal-head");
  head.append(el("h2", "", "📖 遊び方"), btn("✕", "modal-close", () => close()));
  const body = el("div", "modal-body help-body");
  body.innerHTML = HELP_HTML;
  const foot = el("div", "toolbar");
  foot.appendChild(btn("閉じる", "primary", () => close()));
  panel.append(head, body, foot);
  overlay.appendChild(panel);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close(); // 背景クリックで閉じる
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

type CompendiumTab = "units" | "traits" | "items" | "relics" | "ancientRelics";

/** 公開環境の進行には触れず、ローカル確認時だけ図鑑情報を全開示する。 */
const LOCAL_COMPENDIUM_DEBUG = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

/** タイトル・ラン中のどちらからでも開ける共通図鑑。 */
export function showCompendium(initialTab: CompendiumTab = "units") {
  const overlay = el("div", "modal-overlay");
  const panel = el("div", "modal-panel compendium-panel");
  const head = el("div", "modal-head");
  const title = el("h2", "", "📚 冒険図鑑");
  if (LOCAL_COMPENDIUM_DEBUG) title.appendChild(el("small", "compendium-debug-badge", "LOCAL全開示"));
  head.append(title, btn("✕", "modal-close", () => close()));
  const tabs = el("div", "compendium-tabs");
  const body = el("div", "modal-body compendium-body");
  const foot = el("div", "toolbar");
  foot.appendChild(btn("閉じる", "primary", () => close()));
  panel.append(head, tabs, body, foot);
  overlay.appendChild(panel);

  let active = initialTab;
  let unitTraitFilter: TraitId | "all" = "all";
  const unitKnown = (def: UnitDef) => LOCAL_COMPENDIUM_DEBUG || !def.unlock || hasUnlock(def.unlock);
  const renderUnits = () => {
    const filterBar = el("div", "compendium-filter");
    filterBar.appendChild(el("label", "", "シナジーで絞り込み"));
    const select = el("select", "compendium-filter-select");
    const allOption = el("option", "", `すべて（${UNITS.length}体）`);
    allOption.value = "all";
    select.appendChild(allOption);
    for (const trait of Object.values(TRAITS)) {
      const option = el("option", "", `${trait.icon} ${trait.name}`);
      option.value = trait.id;
      select.appendChild(option);
    }
    select.value = unitTraitFilter;
    select.addEventListener("change", () => {
      unitTraitFilter = select.value as TraitId | "all";
      refresh();
    });
    filterBar.appendChild(select);
    const filteredUnits = (unitTraitFilter === "all"
      ? [...UNITS]
      : UNITS.filter(
          (def) => unitKnown(def) && def.traits.includes(unitTraitFilter as TraitId),
        )).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ja"));
    filterBar.appendChild(el("span", "filter-count", `${filteredUnits.length}体`));
    body.appendChild(filterBar);
    const unlockedUnits = filteredUnits.filter(unitKnown);
    const lockedUnits = filteredUnits.filter((def) => !unitKnown(def));
    for (const cost of [1, 2, 3, 4, 5] as const) {
      const costUnits = unlockedUnits.filter((def) => def.cost === cost);
      if (costUnits.length === 0) continue;
      const section = el("section", `unit-cost-section cost-${cost}`);
      const heading = el("div", "unit-cost-heading");
      heading.append(
        el("span", "unit-cost-label", `コスト ${cost}`),
        el("span", "unit-cost-dots", "◆".repeat(cost)),
        el("span", "unit-cost-count", `${costUnits.length}体`),
      );
      section.appendChild(heading);
      const grid = el("div", "compendium-grid unit-compendium-grid");
      for (const def of costUnits) {
        const unlocked = unitKnown(def);
        const card = el("div", `compendium-card unit-entry${unlocked ? "" : " undiscovered"}`);
        if (!unlocked) {
          const legacy = LEGACY_UPGRADES.find((x) => x.id === def.unlock);
          const condition = legacy ? `記憶の祭壇: ${legacy.name}` : UNLOCK_INFO[def.unlock!]?.cond ?? "未知の条件";
          card.innerHTML = `<span class="compendium-icon">🔒</span><b>${def.name}</b><small>未解放<br>${condition}</small>`;
        } else {
          card.innerHTML =
            `<span class="compendium-icon"></span><b>${def.name} <em>コスト${def.cost}</em></b>` +
            `<small>${def.traits.map((t) => `${TRAITS[t].icon}${TRAITS[t].name}`).join("　")}</small>` +
            `<span class="compendium-stats">HP ${def.hp}　攻撃 ${def.atk}　防御 ${def.armor}<br>速度 ${def.atkSpeed.toFixed(2)}　射程 ${rangeLabel(def.range)}</span>` +
            `<span class="compendium-skill"><b>${def.skill.name}</b> <em class="skill-scaling ${def.skill.scaling}">${skillScalingLabel(def.skill.scaling)}</em><br>${def.skill.desc}<br>必要マナ ${def.skill.mana}</span>`;
          card.querySelector(".compendium-icon")!.appendChild(unitArt(def));
        }
        grid.appendChild(card);
      }
      section.appendChild(grid);
      body.appendChild(section);
    }
    if (lockedUnits.length > 0) {
      const section = el("section", "unit-cost-section locked-unit-section");
      const heading = el("div", "unit-cost-heading locked-unit-heading");
      heading.append(
        el("span", "unit-cost-label", "🔒 未解放"),
        el("span", "unit-cost-count", `${lockedUnits.length}体`),
      );
      section.appendChild(heading);
      const grid = el("div", "compendium-grid unit-compendium-grid");
      for (const def of lockedUnits) {
        const legacy = LEGACY_UPGRADES.find((x) => x.id === def.unlock);
        const condition = legacy ? `記憶の祭壇: ${legacy.name}` : UNLOCK_INFO[def.unlock!]?.cond ?? "未知の条件";
        const card = el("div", "compendium-card unit-entry undiscovered");
        card.innerHTML =
          `<span class="compendium-icon">🔒</span><b>${def.name} <em>コスト${def.cost}</em></b>` +
          `<small>未解放<br>${condition}</small>`;
        grid.appendChild(card);
      }
      section.appendChild(grid);
      body.appendChild(section);
    }
  };
  const renderTraits = () => {
    const grid = el("div", "compendium-grid trait-compendium-grid");
    for (const trait of Object.values(TRAITS)) {
      const card = el("div", "compendium-card trait-entry");
      card.innerHTML = `<span class="compendium-icon"></span><b>${trait.name}</b><small>発動閾値: ${trait.thresholds.join(" / ")}</small>`;
      card.querySelector(".compendium-icon")!.appendChild(synergyArt(trait.id));
      const levels = el("div", "trait-level-list");
      trait.thresholds.forEach((threshold, i) => {
        levels.appendChild(el("div", "", `<${threshold}体> ${trait.desc(i + 1)}`));
      });
      card.appendChild(levels);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  };
  const renderItems = () => {
    for (const section of [
      { title: "通常アイテム", list: ITEMS.filter((x) => !x.tier) },
      { title: "合成アイテム", list: ITEMS.filter((x) => x.tier === 2) },
    ]) {
      body.appendChild(el("h3", "compendium-section-title", section.title));
      const grid = el("div", "compendium-grid item-compendium-grid");
      for (const item of section.list) {
        const card = el("div", "compendium-card item-entry");
        card.innerHTML = `<span class="compendium-icon"></span><b>${item.name}</b><small>${item.desc}</small>`;
        card.querySelector(".compendium-icon")!.appendChild(itemArt(item));
        if (item.tier === 2) {
          const materials = Object.entries(CRAFT_RECIPES).find(([, result]) => result === item.id)?.[0].split("+");
          if (materials?.length === 2) {
            const a = ITEM_BY_ID.get(materials[0])!;
            const b = ITEM_BY_ID.get(materials[1])!;
            card.appendChild(el("span", "recipe", `合成: ${a.icon} ${a.name} ＋ ${b.icon} ${b.name}`));
          }
        }
        grid.appendChild(card);
      }
      body.appendChild(grid);
    }
  };
  const renderRelics = (ancient: boolean) => {
    const list = ancient ? ANCIENT_RELICS : RELICS;
    const discovered = new Set(ancient ? meta().discoveredAncientRelics : meta().discoveredRelics);
    const grid = el("div", "compendium-grid relic-compendium-grid");
    for (const relic of list) {
      const known = LOCAL_COMPENDIUM_DEBUG || discovered.has(relic.id);
      const card = el("div", `compendium-card relic-entry${known ? "" : " undiscovered"}`);
      if (known) {
        card.innerHTML = `<span class="compendium-icon">${relic.icon}</span><b>${relic.name}</b><small>${relic.desc}</small>`;
      } else {
        card.innerHTML = `<span class="compendium-icon">❔</span><b>未発見</b><small>冒険中に遭遇すると詳細が記録される</small>`;
      }
      grid.appendChild(card);
    }
    body.appendChild(grid);
  };
  const refresh = () => {
    tabs.innerHTML = "";
    body.innerHTML = "";
    for (const tab of [
      { id: "units" as const, label: `⚔️ ユニット ${UNITS.length}` },
      { id: "traits" as const, label: `🔗 シナジー ${Object.keys(TRAITS).length}` },
      { id: "items" as const, label: `🎒 アイテム ${ITEMS.length}` },
      { id: "relics" as const, label: `🏺 レリック ${RELICS.length}` },
      { id: "ancientRelics" as const, label: `✨ 古代レリック ${ANCIENT_RELICS.length}` },
    ]) {
      tabs.appendChild(btn(tab.label, active === tab.id ? "active" : "", () => { active = tab.id; refresh(); }));
    }
    if (active === "units") renderUnits();
    else if (active === "traits") renderTraits();
    else if (active === "items") renderItems();
    else renderRelics(active === "ancientRelics");
    body.scrollTop = 0;
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  refresh();
  document.body.appendChild(overlay);
}

/** ランをまたいで効果が残る恒久解放ショップ。 */
function showLegacySanctum() {
  const overlay = el("div", "modal-overlay");
  const panel = el("div", "modal-panel legacy-panel");
  const head = el("div", "modal-head");
  const title = el("h2", "", "🔮 記憶の祭壇");
  const balance = el("div", "memory-balance");
  head.append(title, balance, btn("✕", "modal-close", () => close()));
  const tabs = el("div", "compendium-tabs legacy-tabs");
  const body = el("div", "modal-body legacy-grid");
  const foot = el("div", "toolbar");
  foot.appendChild(btn("閉じる", "primary", () => close()));
  panel.append(head, tabs, body, foot);
  overlay.appendChild(panel);

  let activeTab: "upgrades" | "units" = "upgrades";
  const refresh = () => {
    const m = meta();
    balance.textContent = `🔹 ${m.memoryShards}`;
    tabs.innerHTML = "";
    const tabButton = (tab: "upgrades" | "units", label: string) => {
      const button = btn(label, activeTab === tab ? "active" : "", () => {
        activeTab = tab;
        refresh();
      });
      tabs.appendChild(button);
    };
    tabButton("upgrades", "✨ 強化・機能");
    tabButton("units", "⚔️ ユニット解放");
    body.innerHTML = "";
    const upgrades = LEGACY_UPGRADES.filter((up) =>
      activeTab === "units" ? up.id.startsWith("unit_") : !up.id.startsWith("unit_"),
    );
    for (const up of upgrades) {
      const owned = hasLegacy(up.id);
      const prereq = up.requires ? LEGACY_UPGRADES.find((x) => x.id === up.requires) : undefined;
      const blocked = Boolean(prereq && !hasLegacy(prereq.id));
      const card = el("div", `legacy-card${owned ? " owned" : ""}${blocked ? " locked" : ""}`);
      card.innerHTML = `<span class="legacy-icon">${owned ? "✅" : up.icon}</span><b>${up.name}</b><small>${up.desc}</small>`;
      const action = btn(owned ? "解放済み" : blocked ? `前提: ${prereq!.name}` : `🔹 ${up.cost}`, "", () => {
        if (buyLegacy(up.id)) {
          sfx.craft();
          refresh();
        }
      });
      action.disabled = owned || blocked || m.memoryShards < up.cost;
      card.appendChild(action);
      body.appendChild(card);
    }
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    go({ kind: "title" });
  }
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  refresh();
  document.body.appendChild(overlay);
}

/** 恒久解放につながる実績と達成状況を確認する一覧。 */
function showAchievements(): void {
  if (document.querySelector(".achievements-overlay")) return;
  const overlay = el("div", "modal-overlay achievements-overlay");
  const panel = el("div", "modal-panel achievements-panel");
  const m = meta();
  const entries = Object.entries(UNLOCK_INFO);
  const achievedCount = entries.filter(([id]) => hasUnlock(id)).length;
  const head = el("div", "modal-head");
  head.append(
    el("h2", "", "🏆 実績"),
    el("div", "achievement-total", `${achievedCount} / ${entries.length} 達成`),
    btn("✕", "modal-close", () => close()),
  );
  const body = el("div", "modal-body achievement-grid");
  const milestones = el("section", "achievement-milestones");
  const milestoneInfo = [
    [10, "開始ゴールド +3", 20],
    [20, "開始時に通常アイテム +1", 35],
    [30, "開始時にランダムレリック +1", 60],
    [31, "タイトル画面がコンプリート仕様に変化", 0],
  ] as const;
  milestones.appendChild(el("h3", "", "🌟 達成数ボーナス"));
  for (const [level, reward, shards] of milestoneInfo) {
    const reached = hasAchievementMilestone(level);
    milestones.appendChild(el("div", reached ? "reached" : "", `${reached ? "✅" : "◻️"} ${level}個：${reward}${shards > 0 ? ` ＋ 🔹${shards}` : ""}`));
  }
  body.appendChild(milestones);
  const progressText = (id: string): string | null => {
    if (id === "first_battle") return `進捗 ${Math.min(1, m.counters.battleWins)} / 1`;
    if (id === "wins30") return `進捗 ${Math.min(30, m.counters.battleWins)} / 30`;
    if (id === "wins100") return `進捗 ${Math.min(100, m.counters.battleWins)} / 100`;
    if (id === "runs10") return `進捗 ${Math.min(10, m.counters.totalRuns)} / 10`;
    if (id === "clear_three") return `進捗 ${Math.min(3, m.records.totalWins)} / 3`;
    if (id === "first_craft") return `進捗 ${Math.min(1, m.counters.crafts)} / 1`;
    if (id === "crafts5") return `進捗 ${Math.min(5, m.counters.crafts)} / 5`;
    if (id === "elites5") return `進捗 ${Math.min(5, m.counters.eliteWins)} / 5`;
    return null;
  };
  for (const [id, info] of entries) {
    const achieved = hasUnlock(id);
    const card = el("article", `achievement-card${achieved ? " achieved" : ""}`);
    card.append(
      el("span", "achievement-mark", achieved ? "✅" : "◻️"),
      el("b", "", info.cond),
      el("small", "", `解放報酬：${info.reward}`),
    );
    const progress = progressText(id);
    if (progress && !achieved) card.appendChild(el("em", "", progress));
    card.appendChild(el("span", "achievement-state", achieved ? "達成済み" : "未達成"));
    body.appendChild(card);
  }
  const foot = el("div", "toolbar");
  foot.appendChild(btn("閉じる", "primary", () => close()));
  panel.append(head, body, foot);
  overlay.appendChild(panel);
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

function showLastRunRecord(): void {
  const record = meta().lastRunRecord;
  if (!record || document.querySelector(".last-run-overlay")) return;
  const overlay = el("div", "modal-overlay last-run-overlay");
  const panel = el("div", "modal-panel last-run-panel");
  const head = el("div", "modal-head");
  head.append(el("h2", "", "📜 前回のビルド"), btn("✕", "modal-close", () => close()));
  const body = el("div", "modal-body last-run-body");
  body.appendChild(el("div", "last-run-result", `${record.win ? "👑 クリア" : record.abandoned ? "🏳️ 途中終了" : "☠️ 敗北"}　挑戦段位${record.asc}　第${record.act}幕 フロア${record.floor}`));
  if (record.topDamageUnit) body.appendChild(el("div", "last-run-top", `⚔️ 最大与ダメージ：${record.topDamageUnit.name}　${record.topDamageUnit.damage.toLocaleString()}`));
  const units = el("section", "last-run-section");
  units.appendChild(el("h3", "", "最終ユニット"));
  const unitGrid = el("div", "last-run-unit-grid");
  for (const saved of [...record.units].sort((a, b) => Number(b.onBoard) - Number(a.onBoard))) {
    const def = UNIT_BY_ID.get(saved.defId);
    if (!def) continue;
    const chip = el("div", `last-run-unit ${saved.onBoard ? "on-board" : "on-bench"}`);
    chip.dataset.unitTooltip = def.id;
    chip.append(unitArt(def), el("b", "", `${def.name} ${starsText(saved.star)}`), el("small", "", saved.onBoard ? "盤面" : "ベンチ"));
    if (saved.item) {
      const item = ITEM_BY_ID.get(saved.item);
      if (item) { const art = itemArt(item); art.dataset.itemTooltip = item.id; chip.appendChild(art); }
    }
    unitGrid.appendChild(chip);
  }
  units.appendChild(unitGrid);
  body.appendChild(units);
  const summarySection = el("section", "last-run-section last-run-columns");
  const summaryList = (title: string, values: string[]) => {
    const box = el("div"); box.appendChild(el("h3", "", title));
    box.appendChild(el("p", "", values.length ? values.join("　") : "なし")); return box;
  };
  const relicList = (title: string, ids: string[], ancient: boolean) => {
    const box = el("div"); box.appendChild(el("h3", "", title));
    const list = el("div", "last-run-relic-list");
    for (const id of ids) {
      const relic = ancient ? ANCIENT_RELIC_BY_ID.get(id) : RELIC_BY_ID.get(id);
      if (!relic) continue;
      const chip = el("span", ancient ? "ancient" : "", `${relic.icon} ${relic.name}`);
      if (ancient) chip.dataset.ancientRelicTooltip = id;
      else chip.dataset.relicTooltip = id;
      list.appendChild(chip);
    }
    if (list.childElementCount === 0) list.appendChild(el("span", "empty", "なし"));
    box.appendChild(list); return box;
  };
  summarySection.append(
    summaryList("発動シナジー", record.traits.map((trait) => { const info = TRAITS[trait.id as TraitId]; return info ? `${info.icon}${info.name} Lv${trait.tier}` : trait.id; })),
    relicList("レリック", record.relics, false),
    relicList("古代レリック", record.ancientRelics, true),
  );
  body.appendChild(summarySection);
  const foot = el("div", "toolbar"); foot.appendChild(btn("閉じる", "primary", () => close()));
  panel.append(head, body, foot); overlay.appendChild(panel);
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
  function close() { overlay.remove(); document.removeEventListener("keydown", onKey); }
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

/** コンテンツの右側にシナジーパネルを添えたレイアウトを作る。
 *  返り値の refreshSide() でシナジー表示だけ再描画できる */
function withTraitSide(
  run: RunState,
  content: HTMLElement,
): { root: HTMLElement; refreshSide: () => void } {
  const root = el("div", "page-flex");
  const side = el("div", "side-panel side-trait");
  const refreshSide = () => {
    side.innerHTML = "";
    side.appendChild(traitPanel(boardUnits(run)));
  };
  refreshSide();
  root.append(content, side);
  return { root, refreshSide };
}

/* ================= タイトル ================= */

export function renderTitle(): HTMLElement {
  recheckPersistentAchievements();
  const complete = hasAchievementMilestone(31);
  const s = el("div", `title-screen${complete ? " achievement-complete-title" : ""}`);
  const layout = el("div", "title-layout");
  const hero = el("section", "title-hero");
  const menuColumn = el("div", "title-menu-column");
  const menu = el("section", "title-menu");
  hero.appendChild(el("h1", "", "⚔️ コマログ"));
  if (complete) hero.appendChild(el("div", "title-complete-badge", "🏆 ALL 31 ACHIEVEMENTS COMPLETE 🏆"));
  hero.appendChild(el("div", "tagline", "― 駒を並べて、魔王まで ―"));
  const p = el("p");
  p.innerHTML =
    "ユニット（駒）を集めて盤面に配置し、自動戦闘で敵を倒せ。<br>" +
    "全3幕の分岐マップを進み、最後に待つ<b>魔王</b>を討伐するのが目標だ。";
  hero.appendChild(p);

  // 通算記録
  const m = meta();
  if (m.counters.totalRuns > 0) {
    const stats = el("div", "stats-line");
    const parts = [
      `挑戦 ${m.counters.totalRuns}回`,
      `クリア ${m.records.totalWins}回`,
    ];
    if (m.records.bestClearMs !== null) parts.push(`最短 ${fmtTime(m.records.bestClearMs)}`);
    if (m.records.ascBest >= 0) parts.push(`最高段位 ${m.records.ascBest}`);
    parts.push(`実績 ${m.unlocks.length}/${Object.keys(UNLOCK_INFO).length}`);
    stats.textContent = `📜 ${parts.join(" ／ ")}`;
    hero.appendChild(stats);
  }
  hero.appendChild(el("div", "memory-balance", `🔹 記憶の欠片 ${m.memoryShards}`));
  const nextLegacy = LEGACY_UPGRADES
    .filter((up) => !hasLegacy(up.id) && (!up.requires || hasLegacy(up.requires)))
    .sort((a, b) => a.cost - b.cost)[0];
  if (nextLegacy) {
    const goal = el("div", "next-goal");
    const remaining = Math.max(0, nextLegacy.cost - m.memoryShards);
    goal.innerHTML = `<small>次の記憶</small><b>${nextLegacy.icon} ${nextLegacy.name}</b><span>${nextLegacy.desc}</span><em>${remaining === 0 ? "解放できます" : `あと 🔹${remaining}`}</em>`;
    hero.appendChild(goal);
  }
  const save = loadGame();
  if (save) {
    discoverRelics(save.run.relics);
    discoverAncientRelics([...save.run.ancientRelics, ...save.run.pendingAncientChoices]);
  }
  selectedAscension = Math.min(selectedAscension ?? m.ascUnlocked, m.ascUnlocked, MAX_ASC);
  const titleAsc = el("div", "title-asc-selector");
  const ascLabel = el("b", "", "");
  const ascSummary = el("small", "", "");
  const ascDown = btn("−", "asc-btn", () => {
    selectedAscension = Math.max(0, (selectedAscension ?? 0) - 1);
    refreshTitleAsc();
  });
  const ascUp = btn("＋", "asc-btn", () => {
    selectedAscension = Math.min(m.ascUnlocked, (selectedAscension ?? 0) + 1);
    refreshTitleAsc();
  });
  const refreshTitleAsc = () => {
    const level = selectedAscension ?? 0;
    ascLabel.textContent = `🔥 挑戦段位 ${level} / ${m.ascUnlocked}`;
    if (level === 0) ascSummary.textContent = "補正なし（標準難易度）";
    else {
      const effect = ASC_LEVELS[level - 1];
      ascSummary.textContent = `Lv${level}追加：▼ ${effect.debuff}　▲ ${effect.buff}`;
    }
    ascDown.disabled = level <= 0;
    ascUp.disabled = level >= m.ascUnlocked;
  };
  titleAsc.append(ascDown, el("span", "title-asc-copy"), ascUp);
  titleAsc.querySelector(".title-asc-copy")!.append(ascLabel, ascSummary);
  refreshTitleAsc();
  const actions = el("div", "title-actions");
  const playRow = el("div", "toolbar title-action-row");
  if (save) {
    const continueBtn = btn("", "primary title-continue", () => {
      ctx.run = save.run;
      ctx.battleSpeed = save.battleSpeed || 1;
      resumeFrom(save);
    });
    continueBtn.append(
      el("span", "", "▶ 続きから"),
      el("small", "", `（第${save.run.act}幕 フロア${save.run.floorIndex + 1}）`),
    );
    playRow.appendChild(continueBtn);
    playRow.appendChild(
      btn("最初から", "", () => {
        // タイトルからランを破棄した場合も「諦める」と同じ終了処理を通し、
        // 到達度に応じた記憶の欠片を受け取れるようにする。
        ctx.run = save.run;
        ctx.battleSpeed = save.battleSpeed || 1;
        go({ kind: "gameover", win: false, abandoned: true });
      }),
    );
  } else {
    playRow.appendChild(btn("ランを開始", "primary", () => go({ kind: "starter" })));
  }
  const compendiumRow = el("div", "toolbar title-action-row title-single-row");
  compendiumRow.appendChild(btn("📚 図鑑", "", () => showCompendium()));
  if (m.lastRunRecord) compendiumRow.appendChild(btn("📜 前回のビルド", "", () => showLastRunRecord()));
  const sanctuaryRow = el("div", "toolbar title-action-row");
  sanctuaryRow.appendChild(btn("🔮 記憶の祭壇", "", () => showLegacySanctum()));
  sanctuaryRow.appendChild(btn("🏆 実績", "", () => showAchievements()));
  const infoRow = el("div", "toolbar title-action-row title-info-row");
  infoRow.appendChild(btn("🎓 チュートリアル", "", () => showTutorial()));
  infoRow.appendChild(btn("📖 遊び方", "", () => showHelp()));
  infoRow.appendChild(
    btn("💬 感想を送る", "", () => {
      window.open(FEEDBACK_FORM_URL, "_blank", "noopener,noreferrer");
    }),
  );
  actions.append(playRow, compendiumRow, sanctuaryRow, infoRow);
  menu.append(el("h2", "", save ? "冒険を再開" : "新しい冒険"), titleAsc, actions);

  const titleSettings = el("section", "title-settings-panel");
  const settingToggle = (label: string, desc: string, checked: boolean, onChange: (value: boolean) => void) => {
    const row = el("label", "title-setting-toggle");
    const copy = el("span");
    copy.append(el("b", "", label), el("small", "", desc));
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    row.append(copy, input);
    return row;
  };
  titleSettings.append(
    el("h3", "", "⚙️ 設定"),
    compactVolumeControl("SE", gameSettings().seVolume, (value) => { updateSettings({ seVolume: value }); sfx.preview(); }),
    compactVolumeControl("BGM", gameSettings().bgmVolume, (value) => updateSettings({ bgmVolume: value })),
    settingToggle("画面揺れ", "クリティカルや大技で盤面を揺らす", gameSettings().screenShake, (value) => updateSettings({ screenShake: value })),
    settingToggle("演出を軽減", "閃光・衝撃波・細かな粒子を減らす", gameSettings().reducedEffects, (value) => updateSettings({ reducedEffects: value })),
    settingToggle("血の取引を確認", "実行前に確認画面を表示", gameSettings().confirmBloodTrade, (value) => updateSettings({ confirmBloodTrade: value })),
  );
  menuColumn.append(menu, titleSettings);
  layout.append(hero, menuColumn);
  s.appendChild(layout);
  const bgmCredit = el("div", "title-bgm-credit");
  bgmCredit.append("BGM: DOVA-SYNDROME ", Object.assign(document.createElement("a"), {
    href: "https://dova-s.jp/bgm/detail/4596",
    target: "_blank",
    rel: "noopener noreferrer",
    textContent: "「流るる時」by siroimu",
  }));
  s.appendChild(bgmCredit);
  return s;
}

function resumeFrom(save: SaveData) {
  const run = ctx.run!;
  const r = save.resume;
  const node = r.nodeId !== undefined ? run.map.find((n) => n.id === r.nodeId) : undefined;
  switch (r.kind) {
    case "prepare":
      if (node && (node.type === "battle" || node.type === "elite" || node.type === "boss")) {
        ctx.enemyTeam = enemyTeamFor(run.act, node.floor, node.type);
        go({ kind: "prepare", node });
        return;
      }
      break;
    case "shop":
      if (node) {
        go({ kind: "shop", node, rescue: r.rescue ?? false });
        return;
      }
      break;
    case "rest":
      if (node) {
        go({ kind: "rest", node });
        return;
      }
      break;
    case "event":
      if (node) {
        go({ kind: "event", node });
        return;
      }
      break;
    case "actclear":
      if (r.clearedAct) {
        go({ kind: "actclear", clearedAct: r.clearedAct });
        return;
      }
      break;
  }
  go({ kind: "map" });
}

/* ================= スターター選択 ================= */

interface Starter {
  name: string;
  icon: string;
  desc: string;
  units: string[];
  unlock?: string;
  random?: boolean;
}

let selectedAscension: number | null = null;

const STARTERS: Starter[] = [
  {
    name: "鉄壁の布陣",
    icon: "🛡️",
    desc: "戦士と守護者で固く守り、じっくり戦う",
    units: ["swordsman", "shieldbearer", "paladin"],
  },
  {
    name: "魔導の弟子たち",
    icon: "🔮",
    desc: "呪文の火力で盤面を焼き払う",
    units: ["apprentice", "spark", "frostmage"],
  },
  {
    name: "影の一党",
    icon: "🗡️",
    desc: "暗殺者と狂戦士の急襲で敵を刈り取る",
    units: ["rogue", "savage", "shadowblade"],
  },
  {
    name: "死者の行進",
    icon: "💀",
    desc: "倒すほど強くなる死霊の軍勢",
    units: ["skeleton", "acolyte", "necromancer"],
  },
  {
    name: "森の狩人",
    icon: "🏹",
    desc: "射手の手数と風の加護で撃ち抜く",
    units: ["archer", "windarcher", "rogue"],
  },
  {
    name: "竜の血族",
    icon: "🐉",
    desc: "伝説の竜騎士を最初から従える",
    units: ["dragoon", "swordsman", "acolyte"],
    unlock: "beat_dragon",
  },
  {
    name: "運命の三駒",
    icon: "🎲",
    desc: "解放済みのユニットから、毎回ランダムな3体で旅立つ",
    units: [],
    random: true,
  },
];

function rollRandomStarterUnits(): string[] {
  const picked = new Set<string>();
  while (picked.size < 3) picked.add(rollUnitDef(0, picked).id);
  return [...picked];
}

export function renderStarter(): HTMLElement {
  const s = el("div", "center-screen");
  s.appendChild(el("h2", "", "🎴 旅立ちの仲間を選べ"));
  const asc = Math.min(selectedAscension ?? meta().ascUnlocked, meta().ascUnlocked, MAX_ASC);
  s.appendChild(el("div", "starter-asc-label", `🔥 挑戦段位 ${asc}`));

  s.appendChild(el("div", "sub", "最初の部隊がビルドの方向性を決める："));
  const unlocked = STARTERS.filter((st) => !st.unlock || hasUnlock(st.unlock));
  const locked = STARTERS.filter((st) => st.unlock && !hasUnlock(st.unlock));
  const choiceCount = hasLegacy("starter_choice") ? 4 : 3;
  const randomStarter = unlocked.find((st) => st.random);
  const regularPool = unlocked.filter((st) => !st.random).sort(() => Math.random() - 0.5);
  const pool = [...regularPool.slice(0, choiceCount - (randomStarter ? 1 : 0)), ...(randomStarter ? [randomStarter] : [])];
  const row = el("div", "card-row");
  for (const st of pool) {
    const card = el("button", "option-card");
    const unitList = st.random
      ? "🎲 ランダム<br>🎲 ランダム<br>🎲 ランダム"
      : st.units
        .map((id) => {
          const d = UNIT_BY_ID.get(id)!;
          return `${d.icon} ${d.name}`;
        })
        .join("<br>");
    card.innerHTML = `<span class="icon">${st.icon}</span><b>${st.name}</b><br><span style="opacity:.75">${st.desc}</span><br><br>${unitList}`;
    card.addEventListener("click", () => {
      ctx.run = newRun(st.random ? rollRandomStarterUnits() : st.units, asc);
      const afterAncient = () => ascMods(asc).relicPick ? showRelicPick(s) : go({ kind: "map" });
      if (hasLegacy("start_ancient")) showStartAncientPick(s, afterAncient);
      else afterAncient();
    });
    row.appendChild(card);
  }
  for (const st of locked) {
    const card = el("button", "option-card locked");
    card.disabled = true;
    card.innerHTML = `<span class="icon">🔒</span><b>${st.name}</b><br><span style="opacity:.75">解放条件: ${UNLOCK_INFO[st.unlock!]?.cond ?? "???"}</span>`;
    row.appendChild(card);
  }
  s.appendChild(row);
  return s;
}

function showStartAncientPick(s: HTMLElement, onComplete: () => void): void {
  const run = ctx.run!;
  const choices = rollAncientRelicChoices(run.ancientRelics, 3);
  if (choices.length === 0) { onComplete(); return; }
  discoverAncientRelics(choices.map((relic) => relic.id));
  s.innerHTML = "";
  s.append(el("h2", "", "✨ 太古の継承"), el("div", "sub", "旅立ちに持ち込むエンシェントレリックを1つ選ぼう："));
  const row = el("div", "card-row ancient-choice-row");
  for (const relic of choices) {
    const card = el("button", "option-card ancient-card");
    card.innerHTML = `<span class="icon">${relic.icon}</span><b>${relic.name}</b><br><span>${relic.desc}</span>`;
    card.addEventListener("click", () => {
      run.ancientRelics.push(relic.id);
      sfx.craft();
      onComplete();
    });
    row.appendChild(card);
  }
  s.appendChild(row);
}

/** アセンションLv20: 開始時レリック3択（スターター画面を差し替えて表示） */
function showRelicPick(s: HTMLElement) {
  const run = ctx.run!;
  const choices = rollRelicChoices(run.relics, 3);
  if (choices.length === 0) {
    go({ kind: "map" });
    return;
  }
  discoverRelics(choices.map((relic) => relic.id));
  s.innerHTML = "";
  s.appendChild(el("h2", "", "🏺 始まりの遺物"));
  s.appendChild(el("div", "sub", "旅立ちに1つ、レリックを持っていける："));
  const row = el("div", "card-row");
  for (const r of choices) {
    const card = el("button", "option-card relic-card");
    card.innerHTML = `<span class="icon">${r.icon}</span><b>${r.name}</b><br>${r.desc}`;
    card.addEventListener("click", () => {
      run.relics.push(r.id);
      go({ kind: "map" });
    });
    row.appendChild(card);
  }
  s.appendChild(row);
}

/* ================= マップ ================= */

export function renderMap(): HTMLElement {
  const run = ctx.run!;
  const s = el("div");
  s.appendChild(hud(run));

  // 幕の掟
  const rule = ACT_RULE_BY_ID.get(run.actRule);
  if (rule) {
    const banner = el("div", "act-rule");
    banner.innerHTML = `${rule.icon} <b>幕の掟「${rule.name}」</b>　<span class="asc-debuff">▼ ${rule.debuff}</span>　<span class="asc-buff">▲ ${rule.buff}</span>`;
    s.appendChild(banner);
  }

  const wrap = el("div", "map-wrap");
  const inner = el("div", "map-inner");
  const rowH = 84;
  const height = FLOOR_COUNT * rowH;
  inner.style.height = `${height}px`;

  const xPct = (col: number) => 12.5 + col * 25;
  const yPx = (floor: number) => (FLOOR_COUNT - 1 - floor) * rowH + rowH / 2;

  // 接続線
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const n of run.map) {
    for (const nid of n.next) {
      const t = run.map.find((m) => m.id === nid)!;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", `${xPct(n.col)}%`);
      line.setAttribute("y1", `${yPx(n.floor)}`);
      line.setAttribute("x2", `${xPct(t.col)}%`);
      line.setAttribute("y2", `${yPx(t.floor)}`);
      svg.appendChild(line);
    }
  }
  inner.appendChild(svg);

  const current = run.map.find((n) => n.id === run.currentNodeId) ?? null;
  const available = current
    ? run.map.filter((n) => current.next.includes(n.id))
    : run.map.filter((n) => n.floor === 0);
  // ボス戦に敗北した場合など行き先がないときは、現在ノードに再挑戦できる
  if (current && available.length === 0) available.push(current);

  const nodeTip = el("div", "map-node-tooltip");
  inner.appendChild(nodeTip);
  const nodeDetail = (node: MapNode): string => {
    const floor = `第${run.act}幕・フロア${node.floor + 1}`;
    if (node.type === "battle") return `<b>⚔️ 通常戦</b><span>${floor}</span><small>勝利報酬：約${goldReward(node)}G ＋ ユニット選択</small>`;
    if (node.type === "elite") return `<b>💀 エリート戦</b><span>${floor}</span><small>アイテム確定 ＋ レリック3択</small>`;
    if (node.type === "shop") return `<b>🛒 ショップ</b><span>所持金 ${run.gold}G</span><small>ユニット・アイテム・レリックを購入</small>`;
    if (node.type === "rest") return `<b>🏕️ 休憩地点</b><span>現在HP ${run.playerHp}/${run.playerMaxHp}</span><small>HP回復またはユニット複製</small>`;
    if (node.type === "event") return `<b>❓ イベント</b><span>${floor}</span><small>選択によって報酬や代償が発生</small>`;
    const baseLoss = Math.ceil((5 + 2 * run.act + ascMods(run.asc).loseDamage + (ACT_RULE_BY_ID.get(run.actRule)?.e.loseDamage ?? 0)) * 1.5);
    return `<b>👑 ボス戦</b><span>${floor}</span><small>敗北ダメージは最低約${baseLoss}（生存敵で増加）</small>`;
  };

  for (const n of run.map) {
    const isAvail = available.includes(n);
    const b = el("button", "map-node");
    b.textContent = NODE_META[n.type].icon;
    b.title = NODE_META[n.type].label;
    b.style.left = `${xPct(n.col)}%`;
    b.style.top = `${yPx(n.floor)}px`;
    if (n === current) b.classList.add("current");
    if (isAvail) {
      b.classList.add("available");
      b.addEventListener("click", () => enterNode(n));
      b.addEventListener("pointerenter", () => {
        nodeTip.innerHTML = nodeDetail(n);
        nodeTip.style.left = `${xPct(n.col)}%`;
        nodeTip.style.top = `${Math.max(6, yPx(n.floor) - 70)}px`;
        nodeTip.classList.add("visible");
      });
      b.addEventListener("pointerleave", () => nodeTip.classList.remove("visible"));
    } else {
      b.disabled = true;
      if (current && n.floor <= current.floor) b.classList.add("visited");
    }
    inner.appendChild(b);
  }
  wrap.appendChild(inner);
  s.appendChild(wrap);

  const legend = el("div", "map-legend");
  for (const t of ["battle", "elite", "shop", "rest", "event", "boss"] as const) {
    legend.appendChild(el("span", "", `${NODE_META[t].icon} ${NODE_META[t].label}`));
  }
  s.appendChild(legend);
  wrap.scrollTop = wrap.scrollHeight;
  return s;
}

function enterNode(node: MapNode) {
  const run = ctx.run!;
  run.currentNodeId = node.id;
  run.floorIndex = node.floor;
  switch (node.type) {
    case "battle":
    case "elite":
    case "boss":
      ctx.enemyTeam = enemyTeamFor(run.act, node.floor, node.type);
      go({ kind: "prepare", node });
      break;
    case "shop":
      go({ kind: "shop", node });
      break;
    case "rest":
      go({ kind: "rest", node });
      break;
    case "event":
      go({ kind: "event", node });
      break;
  }
}

/* ================= 配置（戦闘準備） ================= */

export function renderPrepare(node: MapNode): HTMLElement {
  const run = ctx.run!;
  let selected: number | null = null; // iid
  let selectedEnemy: number | null = null; // ctx.enemyTeam.spawns のインデックス
  let selectedItem: number | null = null; // run.items のインデックス
  let craftMaterialA: string | null = null;
  let craftMaterialB: string | null = null;
  let justDragged = false; // ドラッグ直後のclickイベントを無視するためのフラグ

  const s = el("div");
  s.appendChild(hud(run));
  const area = el("div", "board-area");
  const boardHolder = el("div", "prepare-board-column");
  const side = el("div", "side-panel");
  area.append(boardHolder, side);
  s.appendChild(area);

  const hint = el(
    "div",
    "hint",
    "ユニットはドラッグ＆ドロップで配置・入替え。クリックでステータスを表示（敵もクリックできる）。",
  );
  s.appendChild(hint);

  /** ドラッグ＆ドロップ対応（クリック選択と共存） */
  function enableDrag(elm: HTMLElement, ou: OwnedUnit) {
    elm.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      let ghost: HTMLElement | null = null;
      const def = unitDef(ou);
      const onMove = (ev: PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
          ghost = el("div", "drag-ghost", def.icon);
          document.body.appendChild(ghost);
          elm.classList.add("dragging");
        }
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!ghost) return; // 動かしていない → 通常のクリックとして処理
        ghost.remove();
        elm.classList.remove("dragging");
        justDragged = true;
        setTimeout(() => (justDragged = false), 50);
        dropAt(ou, ev.clientX, ev.clientY);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  /** ベンチの指定スロット位置へ移動（ベンチの並び順＝roster内の順序を組み替える） */
  function moveToBenchSlot(ou: OwnedUnit, slotIndex: number) {
    ou.pos = null;
    const others = run.roster.filter((u) => u.pos === null && u.iid !== ou.iid);
    const at = Math.max(0, Math.min(slotIndex, others.length));
    const bench = [...others.slice(0, at), ou, ...others.slice(at)];
    run.roster = [...run.roster.filter((u) => u.pos !== null), ...bench];
  }

  function dropAt(ou: OwnedUnit, cx: number, cy: number) {
    const target = document.elementFromPoint(cx, cy);
    const unitEl = target?.closest<HTMLElement>(".unit");
    const slot = target?.closest<HTMLElement>(".bench-slot");
    const cell = target?.closest<HTMLElement>(".cell");

    if (unitEl?.dataset.iid) {
      // 別の自ユニットの上にドロップ → 位置交換
      const other = run.roster.find((o) => o.iid === Number(unitEl.dataset.iid));
      if (other && other.iid !== ou.iid) {
        const tmp = ou.pos;
        ou.pos = other.pos;
        other.pos = tmp;
      }
    } else if (slot) {
      if (slot.dataset.iid) {
        const other = run.roster.find((o) => o.iid === Number(slot.dataset.iid));
        if (other && other.iid !== ou.iid) {
          if (ou.pos === null && other.pos === null) {
            // ベンチ同士 → 並び順を入れ替え
            const ia = run.roster.indexOf(ou);
            const ib = run.roster.indexOf(other);
            [run.roster[ia], run.roster[ib]] = [run.roster[ib], run.roster[ia]];
          } else {
            // 盤面 ⇔ ベンチ → 位置を交換
            const tmp = ou.pos;
            ou.pos = other.pos;
            other.pos = tmp;
          }
        }
      } else {
        // 空きスロットへ → ベンチのその位置に移動
        moveToBenchSlot(ou, Number(slot.dataset.slot));
      }
    } else if (cell && cell.dataset.y !== undefined) {
      const x = Number(cell.dataset.x);
      const y = Number(cell.dataset.y);
      if (y >= 4) {
        const fromBench = ou.pos === null;
        if (fromBench && boardUnits(run).length >= teamCap(run)) {
          hint.textContent = `⚠️ 配置上限は${teamCap(run)}体まで！`;
          refresh();
          return;
        }
        ou.pos = { x, y };
      }
    }
    selected = null;
    refresh();
  }

  function equipItem(itemIdx: number, iid: number) {
    const itemId = run.items[itemIdx];
    const ou = run.roster.find((o) => o.iid === iid);
    if (itemId === undefined || !ou) return;
    if (ou.item) run.items.push(ou.item); // 既存装備は在庫に戻す
    ou.item = itemId;
    run.items.splice(itemIdx, 1);
    selectedItem = null;
    refresh();
  }

  function setCraftMaterial(slot: "a" | "b", itemId: string) {
    if (!BASE_ITEM_IDS.includes(itemId as (typeof BASE_ITEM_IDS)[number])) {
      hint.textContent = "⚠️ 合成済みアイテムは素材にできない";
      return;
    }
    if (slot === "a") craftMaterialA = itemId;
    else craftMaterialB = itemId;
    selectedItem = null;
    selected = null;
    refresh();
  }

  /** アイテムチップのドラッグ（ユニットへドロップで装備） */
  function enableItemDrag(elm: HTMLElement, itemIdx: number) {
    elm.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      let ghost: HTMLElement | null = null;
      const icon = ITEM_BY_ID.get(run.items[itemIdx])!.icon;
      const onMove = (ev: PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
          ghost = el("div", "drag-ghost", icon);
          document.body.appendChild(ghost);
          elm.classList.add("dragging");
        }
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
        document.querySelectorAll(".craft-material-slot.drag-over").forEach((x) => x.classList.remove("drag-over"));
        document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".craft-material-slot")?.classList.add("drag-over");
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!ghost) return;
        ghost.remove();
        elm.classList.remove("dragging");
        document.querySelectorAll(".craft-material-slot.drag-over").forEach((x) => x.classList.remove("drag-over"));
        justDragged = true;
        setTimeout(() => (justDragged = false), 50);
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const craftSlot = target?.closest<HTMLElement>(".craft-material-slot");
        if (craftSlot?.dataset.craftSlot) {
          setCraftMaterial(craftSlot.dataset.craftSlot as "a" | "b", run.items[itemIdx]);
          return;
        }
        const holder =
          target?.closest<HTMLElement>(".unit") ?? target?.closest<HTMLElement>(".bench-slot");
        if (holder?.dataset.iid) equipItem(itemIdx, Number(holder.dataset.iid));
        else refresh();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  function refresh() {
    boardHolder.innerHTML = "";
    side.innerHTML = "";

    const compendium = btn("📚 図鑑", "prepare-compendium-btn", () => showCompendium());
    compendium.title = "ユニット・シナジー・アイテム図鑑";
    boardHolder.appendChild(compendium);

    const { wrap } = makeBoard();

    // 敵プレビュー（アセンション・幕の掟込みの実効値を表示）
    const em = enemyMults(run, node.type as "battle" | "elite" | "boss");
    ctx.enemyTeam!.spawns.forEach((sp, idx) => {
      const u = el("div", "unit enemy");
      const pos = cellPos(sp.x, sp.y);
      u.style.left = pos.left;
      u.style.top = pos.top;
      u.append(el("div", "icon", sp.def.icon));
      const hp = Math.round(sp.def.hp * ctx.enemyTeam!.scale * em.hp);
      const atk = Math.round(sp.def.atk * ctx.enemyTeam!.scale * em.atk);
      u.title = `${sp.def.name}\nHP ${hp} / 攻撃 ${atk}${sp.def.skill ? `\nスキル: ${sp.def.skill.name}` : ""}`;
      tagEnemyTooltip(u, sp.def);
      if (idx === selectedEnemy) u.classList.add("selected");
      u.addEventListener("click", () => {
        if (justDragged) return;
        selectedEnemy = selectedEnemy === idx ? null : idx;
        selected = null;
        selectedItem = null;
        refresh();
      });
      wrap.appendChild(u);
    });

    // 自ユニット（盤面）
    for (const ou of boardUnits(run)) {
      const def = unitDef(ou);
      const u = el("div", "unit ally");
      u.dataset.iid = String(ou.iid);
      if (ou.iid === selected) u.classList.add("selected");
      const pos = cellPos(ou.pos!.x, ou.pos!.y);
      u.style.left = pos.left;
      u.style.top = pos.top;
      const unitIcon = el("div", "icon");
      unitIcon.appendChild(unitArt(def));
      u.append(el("div", "stars", starsText(ou.star)), unitIcon);
      if (ou.item) {
        const d = ITEM_BY_ID.get(ou.item)!;
        const badge = el("div", "item-badge");
        badge.appendChild(itemArt(d));
        badge.title = `${d.name}: ${d.desc}`;
        u.appendChild(badge);
      }
      u.addEventListener("click", () => onUnitClick(ou));
      enableDrag(u, ou);
      wrap.appendChild(u);
    }

    boardHolder.appendChild(wrap);

    // ベンチ
    const bench = el("div", "bench");
    const bu = benchUnits(run);
    for (let i = 0; i < BENCH_SIZE; i++) {
      const slot = el("div", "bench-slot");
      slot.dataset.slot = String(i);
      const ou = bu[i];
      if (ou) {
        const def = unitDef(ou);
        slot.dataset.iid = String(ou.iid);
        if (ou.iid === selected) slot.classList.add("selected");
        const benchIcon = el("div", "icon");
        benchIcon.appendChild(unitArt(def));
        slot.append(benchIcon, el("div", "stars", starsText(ou.star)));
        if (ou.item) {
          const d = ITEM_BY_ID.get(ou.item)!;
          const badge = el("div", "item-badge");
          badge.appendChild(itemArt(d));
          badge.title = `${d.name}: ${d.desc}`;
          slot.appendChild(badge);
        }
        slot.title = def.name;
        slot.addEventListener("click", () => onUnitClick(ou));
        enableDrag(slot, ou);
      }
      bench.appendChild(slot);
    }
    boardHolder.appendChild(bench);

    // アイテム在庫
    const itemBar = el("div", "item-bar");
    itemBar.appendChild(el("span", "item-bar-label", "🎒"));
    if (run.items.length === 0) {
      itemBar.appendChild(el("span", "hint-inline", "アイテムなし（戦闘やショップで入手）"));
    }
    run.items.forEach((id, idx) => {
      const d = ITEM_BY_ID.get(id)!;
      const chip = el("button", "item-chip");
      chip.appendChild(itemArt(d));
      chip.title = `${d.name}: ${d.desc}\nユニットまたは合成素材スロットへドラッグ`;
      if (idx === selectedItem) chip.classList.add("selected");
      chip.addEventListener("click", () => {
        if (justDragged) return;
        selectedItem = selectedItem === idx ? null : idx;
        selected = null;
        refresh();
      });
      enableItemDrag(chip, idx);
      itemBar.appendChild(chip);
    });
    boardHolder.appendChild(itemBar);

    // 合成工房: 通常アイテムを2つ選び、完成品を確認して合成
    const counts = new Map<string, number>();
    for (const id of run.items) counts.set(id, (counts.get(id) ?? 0) + 1);
    const availableBases = BASE_ITEM_IDS.filter((id) => (counts.get(id) ?? 0) > 0);
    if (availableBases.length > 0) {
      if (craftMaterialA && !availableBases.includes(craftMaterialA as (typeof BASE_ITEM_IDS)[number])) craftMaterialA = null;
      if (craftMaterialB && !availableBases.includes(craftMaterialB as (typeof BASE_ITEM_IDS)[number])) craftMaterialB = null;
      const workbench = el("div", "craft-workbench");
      const craftHead = el("div", "craft-workbench-head");
      craftHead.append(el("b", "", "⚒️ 合成工房"), el("small", "", "通常アイテムを2つ選択"));
      workbench.appendChild(craftHead);
      const controls = el("div", "craft-controls");
      const makeSlot = (current: string | null, slot: "a" | "b") => {
        const box = el("button", `craft-material-slot${current ? " filled" : ""}`);
        box.dataset.craftSlot = slot;
        if (current) {
          const item = ITEM_BY_ID.get(current)!;
          box.append(itemArt(item), el("b", "", item.name), el("small", "", "クリックで外す"));
          box.title = `${item.name}: ${item.desc}\n別の素材をドロップすると入れ替え`;
        } else {
          box.innerHTML = `<span>＋</span><b>素材${slot === "a" ? "1" : "2"}</b><small>ここへドロップ</small>`;
        }
        box.addEventListener("click", () => {
          if (selectedItem !== null) {
            setCraftMaterial(slot, run.items[selectedItem]);
            return;
          }
          if (slot === "a") craftMaterialA = null;
          else craftMaterialB = null;
          refresh();
        });
        return box;
      };
      controls.append(makeSlot(craftMaterialA, "a"), el("span", "craft-plus", "＋"), makeSlot(craftMaterialB, "b"));
      workbench.appendChild(controls);

      const enoughMaterials = Boolean(
        craftMaterialA && craftMaterialB &&
        (craftMaterialA !== craftMaterialB || (counts.get(craftMaterialA) ?? 0) >= 2),
      );
      const resultId = craftMaterialA && craftMaterialB && enoughMaterials
        ? craftResult(craftMaterialA, craftMaterialB)
        : undefined;
      const result = el("div", `craft-preview${resultId ? " ready" : ""}`);
      if (resultId) {
        const up = ITEM_BY_ID.get(resultId)!;
        const resultText = el("span");
        resultText.append(el("b", "", up.name), el("small", "", up.desc));
        result.append(itemArt(up, "craft-result-icon"), resultText);
        const craftButton = btn("合成する", "craft-btn", () => {
          const a = craftMaterialA!;
          const b = craftMaterialB!;
          const removeOne = (id: string) => {
            const index = run.items.indexOf(id);
            if (index >= 0) run.items.splice(index, 1);
          };
          removeOne(a);
          removeOne(b);
          run.items.push(resultId);
          selectedItem = null;
          craftMaterialA = null;
          craftMaterialB = null;
          let text = `⚒️ ${up.icon} ${up.name} を合成した！（${up.desc}）`;
          if (ascMods(run.asc).craftSalvage && Math.random() < 0.5) {
            const salvaged = Math.random() < 0.5 ? a : b;
            run.items.push(salvaged);
            text += ` 鍛冶の心得で${ITEM_BY_ID.get(salvaged)!.name}が残った！`;
          }
          hint.textContent = text;
          bumpCounter("crafts");
          sfx.craft();
          refresh();
        });
        result.appendChild(craftButton);
      } else {
        result.textContent = craftMaterialA === craftMaterialB && craftMaterialA
          ? "同じ素材を合成するには2個必要"
          : "素材を2つ選ぶと完成品を表示";
      }
      workbench.appendChild(result);
      boardHolder.appendChild(workbench);
    }

    // ツールバー
    const bar = el("div", "toolbar");
    const cap = teamCap(run);
    bar.append(
      el("span", "", `配置 ${boardUnits(run).length}/${cap}`),
      btn("⚔️ 戦闘開始", "primary", () => {
        // 盤面に空きがあればベンチの左から自動で埋める
        autoPlace(run);
        if (boardUnits(run).length === 0) {
          hint.textContent = "⚠️ 最低1体は配置しよう！";
          refresh();
          return;
        }
        go({ kind: "battle", node });
      }),
    );
    boardHolder.appendChild(bar);

    // サイドパネル
    side.appendChild(traitPanel(boardUnits(run)));
    const sel = run.roster.find((o) => o.iid === selected);
    if (sel) {
      side.appendChild(unitInfoPanel(
        sel,
        () => {
          sellUnit(run, sel.iid);
          selected = null;
          refresh();
        },
        () => {
          if (sel.item) {
            run.items.push(sel.item);
            sel.item = null;
          }
          refresh();
        },
      ));
    } else if (selectedEnemy !== null) {
      const sp = ctx.enemyTeam!.spawns[selectedEnemy];
      if (sp) side.appendChild(enemyInfoPanel(sp.def, ctx.enemyTeam!.scale, em));
    }
  }

  /** クリックはステータス表示のみ（移動・入替えはドラッグ＆ドロップ） */
  function onUnitClick(ou: OwnedUnit) {
    if (justDragged) return;
    if (selectedItem !== null) {
      equipItem(selectedItem, ou.iid);
      return;
    }
    selected = selected === ou.iid ? null : ou.iid;
    selectedEnemy = null;
    refresh();
  }

  refresh();
  return s;
}

/** 射程の表記（例: 近距離(1)） */
function rangeLabel(range: number): string {
  const kind = range <= 1 ? "近距離" : range === 2 ? "中距離" : "遠距離";
  return `${kind}(${range})`;
}

function statRows(p: HTMLElement, rows: [string, string][]) {
  for (const [k, v] of rows) {
    const r = el("div", "row");
    r.append(el("span", "", k), el("span", "", v));
    p.appendChild(r);
  }
}

function unitInfoPanel(ou: OwnedUnit, onSell: () => void, onUnequip?: () => void): HTMLElement {
  const run = ctx.run!;
  const def = unitDef(ou);
  // シナジー・アイテム・レリック込みの実効ステータス（戦闘と同じ計算）
  const cu = previewAllyStats(run, ou);
  const p = el("div", "panel unit-info");
  const title = el("h3");
  title.append(
    unitArt(def),
    document.createTextNode(` ${def.name} ${starsText(ou.star)} `),
    el("em", `unit-cost-badge cost-${def.cost}`, `コスト${def.cost}`),
  );
  p.appendChild(title);
  statRows(p, [
    ["HP", cu.shield > 0 ? `${cu.maxHp}（🛡+${cu.shield}）` : String(cu.maxHp)],
    ["攻撃力", String(cu.atk)],
    ["攻撃速度", cu.atkSpeed.toFixed(2)],
    ["クリティカル率", `${Math.round(cu.critChance * 100)}%`],
    ["クリティカルダメージ", `${Math.round(cu.critMult * 100)}%`],
    ["射程", rangeLabel(cu.range)],
    ["防御", String(cu.armor)],
    ["開始マナ", `${cu.mana} / ${cu.maxMana}`],
    ["特性", def.traits.map((t) => `${TRAITS[t].icon}${TRAITS[t].name}`).join(" ")],
  ]);
  const skill = el("div", "skill");
  skill.innerHTML = `<b>${def.skill.name}</b> <em class="skill-scaling ${def.skill.scaling}">${skillScalingLabel(def.skill.scaling)}</em>（マナ${def.skill.mana}）<br>${def.skill.desc}`;
  p.appendChild(skill);
  if (ou.item) {
    const d = ITEM_BY_ID.get(ou.item)!;
    const itemRow = el("div", "skill");
    itemRow.append(document.createTextNode("装備: "), itemArt(d), document.createTextNode(` ${d.name}`), document.createElement("br"), document.createTextNode(d.desc));
    p.appendChild(itemRow);
  }
  const sellValue = def.cost * (ou.star === 1 ? 1 : ou.star === 2 ? 3 : 9);
  const bar = el("div", "toolbar");
  if (ou.item && onUnequip) bar.appendChild(btn("装備を外す", "", onUnequip));
  bar.appendChild(btn(`売却 (+${sellValue}G)`, "", onSell));
  p.appendChild(bar);
  return p;
}

/** 敵ユニットのステータス（アセンション・幕の掟の強化を反映した実効値） */
function enemyInfoPanel(def: EnemyDef, scale: number, em: ReturnType<typeof enemyMults>): HTMLElement {
  const p = el("div", "panel unit-info enemy-info");
  p.appendChild(el("h3", "", `${def.icon} ${def.name}（敵）`));
  statRows(p, [
    ["HP", String(Math.round(def.hp * scale * em.hp))],
    ["攻撃力", String(Math.round(def.atk * scale * em.atk))],
    ["攻撃速度", (def.atkSpeed * em.as).toFixed(2)],
    ["クリティカル率", `${Math.round(ENEMY_CRIT_CHANCE * 100)}%`],
    ["クリティカルダメージ", `${Math.round(CRIT_MULT * 100)}%`],
    ["射程", rangeLabel(def.range)],
    ["防御", String(def.armor + em.armor)],
  ]);
  const skill = el("div", "skill");
  if (def.skill) {
    skill.innerHTML = `<b>${def.skill.name}</b> <em class="skill-scaling ${def.skill.scaling}">${skillScalingLabel(def.skill.scaling)}</em>（マナ${def.skill.mana}）<br>${def.skill.desc}`;
  } else {
    skill.innerHTML = `<span style="opacity:.7">スキルなし（通常攻撃のみ）</span>`;
  }
  p.appendChild(skill);
  return p;
}

/* ================= 戦闘 ================= */

function checkVictoryAchievements(run: RunState, node: MapNode): void {
  const board = boardUnits(run);
  const traits = computeTraits(board, run.ancientRelics);
  const activeTraits = traits.filter((trait) => trait.tier > 0);
  const maxedTraits = activeTraits.filter((trait) => trait.tier >= TRAITS[trait.trait].thresholds.length);
  const defs = board.map(unitDef);

  if (node.type === "battle") grantUnlock("first_battle");
  if (run.playerHp <= 5) grantUnlock("low_hp_win");
  if (board.length >= 6) grantUnlock("board_six");
  if (board.length >= 10) grantUnlock("board_ten");
  if (node.type === "boss" && board.length <= 3) grantUnlock("boss_three");
  if (board.length > 0 && board.every((unit) => unit.star >= 2)) grantUnlock("all_star2");
  if (run.roster.filter((unit) => unit.star === 3).length >= 3) grantUnlock("three_star3");
  if (defs.length > 0 && defs.every((def) => def.cost >= 4)) grantUnlock("high_cost_only");
  if (defs.filter((def) => def.cost === 1).length >= 5) grantUnlock("five_cost1");
  if (activeTraits.length >= 1) grantUnlock("first_synergy");
  if (activeTraits.length >= 4) grantUnlock("four_synergies");
  if (maxedTraits.length >= 1) grantUnlock("max_synergy");
  if (maxedTraits.length >= 2) grantUnlock("two_max_synergies");
  if (activeTraits.length >= 7) grantUnlock("seven_synergies");
  if (run.relics.length >= 8) grantUnlock("relic_eight");
  if (node.type === "boss") {
    const craftedIds = new Set<string>(Object.values(CRAFT_RECIPES));
    if (board.some((unit) => unit.item && craftedIds.has(unit.item))) grantUnlock("crafted_boss");
  }
}

export function renderBattle(node: MapNode): HTMLElement {
  const run = ctx.run!;
  const battle = new Battle(run, ctx.enemyTeam!, node.type as "battle" | "elite" | "boss");

  const s = el("div");
  s.appendChild(hud(run, () => {
    clearInterval(timer);
    go({ kind: "gameover", win: false, abandoned: true });
  }));
  const area = el("div", "board-area");
  const boardHolder = el("div");
  const side = el("div", "side-panel");
  side.appendChild(traitPanel(boardUnits(run)));
  area.append(boardHolder, side);
  s.appendChild(area);

  const { wrap } = makeBoard();
  boardHolder.appendChild(wrap);

  // ユニット要素
  const unitEls = new Map<
    number,
    { root: HTMLElement; hp: HTMLElement; shield: HTMLElement; mana: HTMLElement | null; hpText: HTMLElement; statuses: HTMLElement }
  >();
  for (const cu of battle.units) {
    const u = el("div", `unit ${cu.side}`);
    const pos = cellPos(cu.x, cu.y);
    u.style.left = pos.left;
    u.style.top = pos.top;
    u.title = cu.name;
    if (cu.side === "enemy") {
      const enemyDef = ctx.enemyTeam?.spawns.find((spawn) => spawn.def.name === cu.name)?.def;
      if (enemyDef) tagEnemyTooltip(u, enemyDef);
    }
    const combatIcon = el("div", "icon", cu.icon);
    if (cu.side === "ally") {
      const def = UNITS.find((candidate) => candidate.name === cu.name);
      if (def) { combatIcon.textContent = ""; combatIcon.appendChild(unitArt(def)); }
    }
    u.append(el("div", "stars", cu.side === "ally" ? starsText(cu.star) : ""), combatIcon);
    const bars = el("div", "bars");
    const hpBar = el("div", "bar hp");
    const hpFill = el("i", "fill-hp");
    const shieldFill = el("i", "fill-shield");
    const hpText = el("span", "bar-label");
    hpBar.append(hpFill, shieldFill, hpText);
    bars.appendChild(hpBar);
    let manaFill: HTMLElement | null = null;
    if (cu.skill) {
      const manaBar = el("div", "bar mana");
      manaFill = el("i");
      manaBar.appendChild(manaFill);
      bars.appendChild(manaBar);
    }
    const statuses = el("div", "unit-statuses");
    u.append(bars, statuses);
    wrap.appendChild(u);
    unitEls.set(cu.uid, { root: u, hp: hpFill, shield: shieldFill, mana: manaFill, hpText, statuses });
  }

  let speed = ctx.battleSpeed;
  const bar = el("div", "toolbar");
  const speedBtn = btn(`⏩ 速度 x${speed}`, "", () => {
    speed = speed >= 3 ? 1 : speed + 1;
    ctx.battleSpeed = speed;
    speedBtn.textContent = `⏩ 速度 x${speed}`;
    clearInterval(timer);
    timer = window.setInterval(step, TICK_MS / speed);
  });
  bar.appendChild(speedBtn);
  boardHolder.appendChild(bar);

  const unitByUid = new Map(battle.units.map((u) => [u.uid, u]));

  function syncView(cu: CombatUnit) {
    const e = unitEls.get(cu.uid)!;
    const pos = cellPos(cu.x, cu.y);
    e.root.style.left = pos.left;
    e.root.style.top = pos.top;
    // バー全体を「HP + シールド」で按分し、シールド分を白く積む
    const total = cu.maxHp + cu.shield;
    const hpPct = Math.max(0, (cu.hp / total) * 100);
    const shPct = Math.max(0, (cu.shield / total) * 100);
    e.hp.style.width = `${hpPct}%`;
    e.shield.style.left = `${hpPct}%`;
    e.shield.style.width = `${shPct}%`;
    e.hpText.textContent = cu.shield > 0 ? `${Math.ceil(cu.hp)} +${Math.ceil(cu.shield)}` : `${Math.ceil(cu.hp)}`;
    if (e.mana) e.mana.style.width = `${Math.min(100, (cu.mana / cu.maxMana) * 100)}%`;
    e.root.classList.toggle("stunned", cu.alive && cu.stunTicks > 0);
    const statusList: Array<[boolean, string, string]> = [
      [cu.stunTicks > 0, "💫", "スタン"],
      [cu.silenceTicks > 0, "🔇", "沈黙"],
      [cu.poisonTicks > 0 || cu.parasitePct > 0, "☠️", "毒・寄生"],
      [cu.fearTicks > 0, "😱", "恐怖"],
      [cu.slowTicks > 0, "🐌", "速度低下"],
      [cu.shield > 0, "🛡️", "シールド"],
      [cu.ghostTicks > 0, "👻", "霊体"],
    ];
    e.statuses.innerHTML = "";
    for (const [, icon, label] of statusList.filter(([active]) => active).slice(0, 4)) {
      const badge = el("span", "", icon);
      badge.title = label;
      e.statuses.appendChild(badge);
    }
    if (!cu.alive && !e.root.classList.contains("dead")) {
      // 残っている演出クラスが死亡アニメーションを上書きしないよう除去
      e.root.classList.remove("lunge", "casting", "hit-flash");
      e.root.classList.add("dead");
      // 保険: アニメーションが何かの理由で走らなくても確実に消す
      const root = e.root;
      setTimeout(() => {
        root.style.opacity = "0";
      }, 600);
    }
    if (cu.alive && e.root.classList.contains("dead")) {
      e.root.classList.remove("dead");
      e.root.style.opacity = "1";
    }
  }

  /** クラスを付け直してCSSアニメーションを再生する（終了時に自動除去） */
  function replay(elm: HTMLElement, cls: string) {
    elm.classList.remove(cls);
    void elm.offsetWidth;
    elm.classList.add(cls);
    elm.addEventListener("animationend", () => elm.classList.remove(cls), { once: true });
  }

  function shakeBoard() {
    if (!gameSettings().screenShake || gameSettings().reducedEffects) return;
    replay(wrap, "shake");
  }

  function cellCenter(x: number, y: number): { left: string; top: string } {
    return {
      left: `calc(6px + ${x} * (var(--cell) + 2px) + var(--cell) / 2)`,
      top: `calc(6px + ${y} * (var(--cell) + 2px) + var(--cell) / 2)`,
    };
  }

  function fireProjectile(from: CombatUnit, to: CombatUnit) {
    const p = el("div", `projectile ${from.side}`);
    const a = cellCenter(from.x, from.y);
    p.style.left = a.left;
    p.style.top = a.top;
    wrap.appendChild(p);
    void p.offsetWidth; // 反映してからtransitionで飛ばす
    const b = cellCenter(to.x, to.y);
    p.style.left = b.left;
    p.style.top = b.top;
    setTimeout(() => p.remove(), 220);
  }

  /** 一定時間で消える演出要素をセル中心に置く */
  function spawnFx(cls: string, x: number, y: number, life: number): HTMLElement {
    const f = el("div", cls);
    const c = cellCenter(x, y);
    f.style.left = c.left;
    f.style.top = c.top;
    wrap.appendChild(f);
    setTimeout(() => f.remove(), life);
    return f;
  }

  /** スキル弾: 発射→着弾で爆発 */
  function spawnSkillshot(fromX: number, fromY: number, toX: number, toY: number, fx: string) {
    const p = spawnFx(`skillshot ${fx}`, fromX, fromY, 260);
    void p.offsetWidth;
    const b = cellCenter(toX, toY);
    p.style.left = b.left;
    p.style.top = b.top;
    setTimeout(() => {
      spawnFx(`impact ${fx}`, toX, toY, 450);
      spawnFx(`impact-ring ${fx}`, toX, toY, 520);
      if (!gameSettings().reducedEffects) {
        for (let i = 0; i < 5; i++) {
          const spark = spawnFx(`impact-spark ${fx}`, toX, toY, 520);
          spark.style.setProperty("--sx", `${(Math.random() - 0.5) * 72}px`);
          spark.style.setProperty("--sy", `${(Math.random() - 0.5) * 72}px`);
        }
      }
    }, 220);
  }

  /** スキル発動者の足元に溜めの魔法陣と放射粒子を出す。 */
  function spawnCastAura(cu: CombatUnit) {
    const fx = cu.skill?.fx ?? (cu.skill?.scaling === "attack" ? "phys" : "holy");
    spawnFx(`cast-aura ${fx}`, cu.x, cu.y, 620);
    spawnFx(`cast-core ${fx}`, cu.x, cu.y, 480);
    if (gameSettings().reducedEffects) return;
    for (let i = 0; i < 6; i++) {
      const mote = spawnFx(`cast-mote ${fx}`, cu.x, cu.y, 650);
      const angle = (Math.PI * 2 * i) / 6;
      mote.style.setProperty("--mx", `${Math.cos(angle) * 42}px`);
      mote.style.setProperty("--my", `${Math.sin(angle) * 42}px`);
      mote.style.animationDelay = `${i * 30}ms`;
    }
  }

  /** 3コスト以上の固有技。色だけでなく形と動きもスキル系統ごとに変える。 */
  function spawnSignatureFx(cu: CombatUnit) {
    if (cu.cost < 3 || !cu.skill) return;
    const name = cu.skill.name;
    const groups: Array<[string, string, string[]]> = [
      ["fire", "🔥", ["星落とし", "火山核", "終末火山", "灰より還る", "狐火輪舞"]],
      ["storm", "⚡", ["雷門", "風雷環", "超電導嵐", "照準砲列", "必中未来落星"]],
      ["holy", "✦", ["聖域展開", "未来の選定", "救済の翼", "世界樹の芽吹き", "英霊降下", "双星霊薬", "星血均衡", "魂の万能薬"]],
      ["blade", "✕", ["竜槍滑空", "六道斬", "影縫い", "猛進再突撃", "一閃・無明", "断層隆起", "装甲強奪突撃", "紅月断", "追奏短剣・狂詩曲"]],
      ["time", "◷", ["氷河宮殿", "時代逆行", "三秒前の残響", "事象の地平線", "因果固定の錨", "重圧圧縮命令", "奈落重力胞子"]],
      ["blood", "◆", ["冥府の契約", "貪欲な偽装", "血盟の不落旗", "戦肉捕食", "紅い夜", "巡る血月障壁"]],
      ["resonance", "♫", ["反響する静寂", "魔力の再編曲", "三響の星鐘", "星なき夜", "戦利品散布"]],
      ["mirror", "◇", ["生ける贋作", "同胞完全擬態", "双貌の大勝負", "運命反転", "三つの災い顔", "運命の六面体"]],
    ];
    const match = groups.find(([, , names]) => names.includes(name));
    const kind = match?.[0] ?? "void";
    const glyph = match?.[1] ?? "✧";
    const stage = spawnFx(`signature-stage signature-${kind}`, cu.x, cu.y, gameSettings().reducedEffects ? 480 : 900);
    stage.append(el("i", "signature-ring ring-one"), el("i", "signature-ring ring-two"), el("b", "signature-glyph", glyph));
    if (!gameSettings().reducedEffects) {
      for (let i = 0; i < 8; i++) {
        const particle = el("span", "signature-particle");
        particle.style.setProperty("--angle", `${i * 45}deg`);
        particle.style.animationDelay = `${i * 35}ms`;
        stage.appendChild(particle);
      }
    }
  }

  /** 着弾爆発 + 広がる衝撃波の円（+氷は雪の結晶） */
  function spawnBlastWave(x: number, y: number, kind: "fire" | "frost" | "phys" | "shadow" | "bolt") {
    spawnFx(`aoe-blast ${kind}`, x, y, 500);
    spawnFx(`shockwave ${kind}`, x, y, 650);
    if (!gameSettings().reducedEffects) {
      const echo = spawnFx(`shockwave shockwave-echo ${kind}`, x, y, 850);
      echo.style.animationDelay = "110ms";
    }
    if (kind === "frost") {
      for (let i = 0; i < 5; i++) {
        const flake = spawnFx("snowflake", x, y, 900);
        flake.textContent = "❄";
        flake.style.setProperty("--dx", `${(Math.random() - 0.5) * 90}px`);
        flake.style.setProperty("--dy", `${(Math.random() - 0.5) * 90}px`);
        flake.style.animationDelay = `${i * 40}ms`;
      }
    }
    shakeBoard();
  }

  function handleEvent(ev: BattleEvent) {
    switch (ev.type) {
      case "attack": {
        const from = unitByUid.get(ev.fromUid)!;
        const to = unitByUid.get(ev.toUid)!;
        if (!from.alive) break; // 同tick内で倒れた場合はモーション不要
        if (ev.ranged) {
          fireProjectile(from, to);
        } else {
          const e = unitEls.get(ev.fromUid)!.root;
          e.style.setProperty("--lx", `${Math.sign(to.x - from.x) * 9}px`);
          e.style.setProperty("--ly", `${Math.sign(to.y - from.y) * 9}px`);
          replay(e, "lunge");
        }
        break;
      }
      case "hit": {
        const cu = unitByUid.get(ev.uid);
        const e = unitEls.get(ev.uid);
        if (e && cu?.alive) replay(e.root, "hit-flash");
        if (ev.crit) {
          shakeBoard();
          sfx.crit();
        } else {
          sfx.hit();
        }
        break;
      }
      case "cast": {
        const cu = unitByUid.get(ev.uid);
        const e = unitEls.get(ev.uid);
        if (e && cu?.alive) { replay(e.root, "casting"); spawnCastAura(cu); spawnSignatureFx(cu); }
        sfx.cast();
        break;
      }
      case "aoe": {
        if (ev.kind === "fire") {
          // メテオ: 上空から隕石が落ちてから爆発
          const meteor = spawnFx("meteor", ev.x, ev.y - 3, 320);
          void meteor.offsetWidth;
          const c = cellCenter(ev.x, ev.y);
          meteor.style.left = c.left;
          meteor.style.top = c.top;
          setTimeout(() => spawnBlastWave(ev.x, ev.y, "fire"), 280);
        } else if (ev.kind === "bolt") {
          // 落雷: 上から光の柱が落ちて爆発
          spawnFx("lightning-strike", ev.x, ev.y, 350);
          spawnBlastWave(ev.x, ev.y, "bolt");
        } else {
          spawnBlastWave(ev.x, ev.y, ev.kind);
        }
        sfx.blast();
        break;
      }
      case "skillshot": {
        const from = unitByUid.get(ev.fromUid)!;
        spawnSkillshot(from.x, from.y, ev.toX, ev.toY, ev.fx);
        break;
      }
      case "slash": {
        spawnFx("slash-fx", ev.x, ev.y, 300);
        if (!gameSettings().reducedEffects) {
          const second = spawnFx("slash-fx slash-fx-second", ev.x, ev.y, 380);
          second.style.animationDelay = "70ms";
        }
        break;
      }
      case "buff": {
        const e = unitEls.get(ev.uid);
        if (!e) break;
        const b = el("div", `buff-fx ${ev.fx}`);
        if (ev.fx === "heal") {
          for (let i = 0; i < 3; i++) {
            const sp = el("span", "sparkle", "✨");
            sp.style.left = `${15 + i * 28}%`;
            sp.style.animationDelay = `${i * 110}ms`;
            b.appendChild(sp);
          }
        }
        e.root.appendChild(b);
        setTimeout(() => b.remove(), 800);
        sfx.heal();
        break;
      }
      case "death": {
        // syncView が .dead を付けてアニメーションが走る
        sfx.death();
        break;
      }
    }
  }

  function step() {
    battle.tick();
    for (const cu of battle.units) syncView(cu);
    for (const ev of battle.events) handleEvent(ev);
    for (const f of battle.floats) {
      const ft = el("div", `float-text ${f.cls}`, f.text);
      const jitterX = (Math.random() - 0.5) * 20;
      ft.style.left = `calc(6px + ${f.x} * (var(--cell) + 2px) + var(--cell) / 2 + ${jitterX}px)`;
      ft.style.top = `calc(2px + ${f.y} * (var(--cell) + 2px))`;
      wrap.appendChild(ft);
      setTimeout(() => ft.remove(), 800);
    }
    const res = battle.result;
    if (res) {
      clearInterval(timer);
      // 勝敗バナーを表示してから遷移
      const banner = el("div", `battle-banner ${res}`, res === "win" ? "🎉 勝利！" : "💀 敗北…");
      wrap.appendChild(banner);
      if (res === "win") sfx.win();
      else sfx.lose();
      setTimeout(() => finish(res), 1400);
    }
  }

  function finish(res: "win" | "lose") {
    ctx.lastBattleReport = battle.summary();
    battle.settleRunRewards(run, res === "win");
    if (res === "win" && battle.bonusGold > 0) run.gold += battle.bonusGold;
    if (res === "win") {
      run.battleCount++;
      if (run.relics.includes("victoryPurse") && run.battleCount % 3 === 0) run.gold += 8;
      const magnetGain = run.relics.includes("salvageMagnet") && battle.hasSurvivingEquippedAlly ? 0.08 : 0;
      bumpCounter("battleWins");
      if (node.type === "elite") bumpCounter("eliteWins");
      checkVictoryAchievements(run, node);
      if (node.type === "boss") {
        run.relicItemDropBonus = Math.min(0.24, run.relicItemDropBonus + magnetGain);
        if (run.act >= 3) {
          go({ kind: "gameover", win: true });
        } else {
          go({ kind: "actclear", clearedAct: run.act });
        }
        return;
      }
      run.gold += goldReward(node);
      // アセンションLv10「商人の血」: 利子
      if (ascMods(run.asc).interest) run.gold += Math.min(5, Math.floor(run.gold / 10));
      if (run.relics.includes("healCharm")) {
        run.playerHp = Math.min(run.playerMaxHp, run.playerHp + 3);
      }
      go({ kind: "result", node, win: true, hpLost: 0 });
      run.relicItemDropBonus = Math.min(0.24, run.relicItemDropBonus + magnetGain);
    } else {
      let hpLost =
        5 +
        2 * run.act +
        2 * battle.survivingEnemies +
        ascMods(run.asc).loseDamage +
        (ACT_RULE_BY_ID.get(run.actRule)?.e.loseDamage ?? 0);
      if (node.type === "boss") hpLost = Math.ceil(hpLost * 1.5); // ボス戦の敗北は痛手が大きい
      if (run.relics.includes("ironWill")) hpLost = Math.ceil(hpLost / 2);
      run.playerHp = Math.max(0, run.playerHp - hpLost);
      run.damageTaken += hpLost;
      if (run.playerHp <= 0) go({ kind: "gameover", win: false });
      else go({ kind: "result", node, win: false, hpLost });
    }
  }

  let timer = window.setInterval(step, TICK_MS / speed);
  return s;
}

function goldReward(node: MapNode): number {
  const run = ctx.run!;
  // 後半の所持金だけが膨らまないよう、通常戦は緩やか・エリートは明確な差をつける
  const base = node.type === "elite" ? 13 + node.floor : 7 + Math.ceil(node.floor * 0.6);
  return (
    base +
    (run.act - 1) * 2 +
    (run.relics.includes("goldenEgg") ? 4 : 0) +
    ascMods(run.asc).winGold +
    (ACT_RULE_BY_ID.get(run.actRule)?.e.winGold ?? 0)
  );
}

/* ================= リザルト ================= */

export function renderResult(node: MapNode, win: boolean, hpLost: number): HTMLElement {
  return withTraitSide(ctx.run!, buildResult(node, win, hpLost)).root;
}

function buildResult(node: MapNode, win: boolean, hpLost: number): HTMLElement {
  const run = ctx.run!;
  const s = el("div", "center-screen");
  const battleReport = () => {
    const wrap = el("section", "battle-report");
    const allies = ctx.lastBattleReport.filter((row) => row.side === "ally").sort((a, b) => b.damageDealt - a.damageDealt);
    const totalDamage = Math.max(1, allies.reduce((sum, row) => sum + row.damageDealt, 0));
    const title = el("div", "battle-report-title");
    title.append(el("b", "", "📊 戦闘レポート"), el("small", "", `味方合計ダメージ ${allies.reduce((sum, row) => sum + row.damageDealt, 0).toLocaleString()}`));
    wrap.appendChild(title);
    const table = el("div", "report-table");
    const head = el("div", "report-head");
    head.append(
      el("span", "", "ユニット"),
      el("span", "", "与ダメージ"),
      el("span", "", "被ダメージ"),
      el("span", "", "回復"),
      el("span", "", "シールド"),
      el("span", "", "スキル"),
    );
    table.appendChild(head);
    for (const row of allies) {
      const line = el("div", "report-row");
      const identity = el("span", "report-unit", `${row.icon} ${row.name} ${"★".repeat(row.star)}`);
      const damage = el("span", "report-damage", row.damageDealt.toLocaleString());
      const meter = el("i", "report-meter"); meter.style.setProperty("--share", `${Math.max(2, row.damageDealt / totalDamage * 100)}%`);
      damage.appendChild(meter);
      line.append(identity, damage, el("span", "", row.damageTaken.toLocaleString()), el("span", "", row.healing.toLocaleString()), el("span", "", row.shielding.toLocaleString()), el("span", "", `${row.casts}回`));
      table.appendChild(line);
    }
    wrap.appendChild(table);
    return wrap;
  };

  if (!win) {
    s.appendChild(el("h2", "", "💔 敗北…"));
    s.appendChild(el("div", "sub", `${hpLost} のダメージを受けた（残りHP ${run.playerHp}）`));
    if (node.type === "boss") {
      s.appendChild(
        el("div", "sub", "手負いの君の前に、戦場を漁る闇商人が現れた。\n体勢を立て直してから再挑戦しよう。"),
      );
      s.appendChild(btn("🛒 闇商人のもとへ駆け込む", "primary", () => {
        run.rescueBloodTradesRemaining = 2;
        go({ kind: "shop", node, rescue: true });
      }));
      s.appendChild(battleReport());
    } else {
      s.appendChild(btn("マップへ戻る", "primary", () => go({ kind: "map" })));
      s.appendChild(battleReport());
    }
    return s;
  }

  s.appendChild(el("h2", "", "🎉 勝利！"));

  // アイテムドロップ（エリートは確定、通常戦闘は30%+補正）
  const dropChance =
    0.3 +
    run.relicItemDropBonus +
    ascMods(run.asc).itemDropPct / 100 +
    (ACT_RULE_BY_ID.get(run.actRule)?.e.itemDropPct ?? 0) / 100 +
    (run.relics.includes("anvil") ? 0.15 : 0);
  run.relicItemDropBonus = 0;
  if (node.type === "elite" || Math.random() < dropChance) {
    const itemId = rollItem();
    run.items.push(itemId);
    const d = ITEM_BY_ID.get(itemId)!;
    s.appendChild(el("div", "sub", `🎒 アイテムを入手: ${d.icon} ${d.name}（${d.desc}）`));
  }

  if (node.type === "elite") {
    // エリート報酬: レリック3択
    s.appendChild(el("div", "sub", `💰 ${goldReward(node)}G を獲得！ レリックを1つ選ぼう：`));
    const relics = rollRelicChoices(run.relics, 3);
    if (relics.length === 0) {
      run.gold += 10;
      s.appendChild(el("div", "sub", "レリックはすべて集めた！代わりに +10G"));
      s.appendChild(btn("マップへ戻る", "primary", () => go({ kind: "map" })));
      s.appendChild(battleReport());
      return s;
    }
    discoverRelics(relics.map((relic) => relic.id));
    const row = el("div", "card-row");
    for (const r of relics) {
      const card = el("button", "option-card");
      card.innerHTML = `<span class="icon">${r.icon}</span><b>${r.name}</b><br>${r.desc}`;
      card.addEventListener("click", () => {
        run.relics.push(r.id);
        go({ kind: "map" });
      });
      row.appendChild(card);
    }
    s.appendChild(row);
    s.appendChild(btn("スキップ (+4G)", "", () => {
      run.gold += 4;
      go({ kind: "map" });
    }));
    s.appendChild(battleReport());
    return s;
  }

  s.appendChild(el("div", "sub", `💰 ${goldReward(node)}G を獲得！ 仲間を1体選ぼう：`));
  s.appendChild(rosterStrip(run));
  const gf = globalFloor(run);
  const maxed = maxedDefIds(run);
  const rewardChoiceCount = 3 + legacyLevel("reward_choice");
  let choices: UnitDef[] = Array.from({ length: rewardChoiceCount }, () => rollUnitDef(gf, maxed));
  let rewardRerolls = hasLegacy("reward_reroll") ? 1 : 0;
  const row = el("div", "card-row");
  const msg = el("div", "sub", "");
  const renderChoices = () => {
    row.innerHTML = "";
    for (const def of choices) {
      row.appendChild(unitCard(def, `仲間にする`, () => {
        if (!addUnit(run, def)) {
          showRewardBenchSale(def, () => go({ kind: "map" }));
          return;
        }
        go({ kind: "map" });
      }));
    }
  };
  renderChoices();
  s.appendChild(row);
  s.appendChild(msg);
  const rewardActions = el("div", "toolbar");
  if (rewardRerolls > 0) rewardActions.appendChild(btn("🎲 候補をリロール（1回）", "", () => {
    if (rewardRerolls <= 0) return;
    rewardRerolls--;
    choices = Array.from({ length: rewardChoiceCount }, () => rollUnitDef(gf, maxed));
    renderChoices();
    (rewardActions.firstElementChild as HTMLButtonElement).disabled = true;
    (rewardActions.firstElementChild as HTMLButtonElement).textContent = "🎲 リロール使用済み";
  }));
  rewardActions.appendChild(btn("スキップ (+2G)", "", () => {
      run.gold += 2;
      go({ kind: "map" });
    }));
  s.appendChild(rewardActions);
  s.appendChild(battleReport());
  return s;
}

function unitCard(def: UnitDef, action: string, onClick: () => void): HTMLElement {
  const c = el("button", `unit-card cost-${def.cost}`);
  const icon = el("div", "icon");
  icon.appendChild(unitArt(def));
  c.append(
    icon,
    el("div", "name", `${def.name}`),
    el("div", "cost", `コスト ${def.cost}`),
    el("div", "traits", def.traits.map((t) => `${TRAITS[t].icon}${TRAITS[t].name}`).join(" ")),
    el("div", "skill", `${def.skill.name}【${skillScalingLabel(def.skill.scaling)}】: ${def.skill.desc}`),
    el("div", "", `HP ${def.hp} / 攻撃 ${def.atk}`),
  );
  c.title = action;
  c.addEventListener("click", onClick);
  return c;
}

/* ================= ショップ ================= */

export function renderShop(node: MapNode, rescue = false): HTMLElement {
  const run = ctx.run!;
  // 救済ショップ（ボス敗北後の闇商人）は割高。アセンション・幕の掟の割増も加算
  const markup =
    ascMods(run.asc).shopMarkup + (ACT_RULE_BY_ID.get(run.actRule)?.e.shopMarkup ?? 0);
  const unitPrice = (def: UnitDef) => (rescue ? def.cost * 2 : def.cost) + markup;
  const itemPrice = Math.max(1, (rescue ? 9 : 5) + markup - (run.relics.includes("discountTag") ? 2 : 0));
  const relicPrice = Math.max(1, (rescue ? 20 : 14) + markup - (run.relics.includes("discountTag") ? 3 : 0));
  const rerollPrice = Math.max(1, (rescue ? 3 : 2) - (run.relics.includes("luckyCoin") ? 1 : 0));

  const s = el("div");
  s.appendChild(hud(run));
  const center = el("div", "center-screen");
  center.appendChild(el("h2", "", rescue ? "🕯️ 戦場の闇商人" : "🛒 ショップ"));
  const msg = el(
    "div",
    "sub",
    rescue
      ? "「おや、ボロボロじゃないか。売ってやるよ…相場より高いがね」（価格割増）"
      : "ユニットを雇入れよう（コスト分のゴールドが必要）",
  );
  center.appendChild(msg);
  const bloodTrade = el("div", "blood-trade");
  center.appendChild(bloodTrade);
  const benchStatus = el("div", "shop-bench-status");
  center.appendChild(benchStatus);
  const stripHolder = el("div");
  stripHolder.appendChild(rosterStrip(run));
  center.appendChild(stripHolder);

  let offers: (UnitDef | null)[] = rollOffers();
  const itemRerollMax = legacyLevel("item_reroll_");
  const shopKey = run.act * 1000 + node.id + (rescue ? 500 : 0);
  if (run.shopRerollNodeId !== shopKey) {
    run.shopRerollNodeId = shopKey;
    run.shopItemRerolls = itemRerollMax;
  }
  let itemOffers: (string | null)[] = run.carriedShopItems.slice(0, 2);
  run.carriedShopItems = [];
  while (itemOffers.length < 2) itemOffers.push(rollItem());
  const relicGuaranteed = rescue || (ACT_RULE_BY_ID.get(run.actRule)?.e.shopRelic ?? false);
  let relicOffer: string | null =
    relicGuaranteed || Math.random() < 0.35 ? (rollRelicChoices(run.relics, 1)[0]?.id ?? null) : null;
  if (relicOffer) discoverRelics([relicOffer]);
  const row = el("div", "card-row compact");
  const goodsRow = el("div", "card-row");
  const bar = el("div", "toolbar");

  function rollOffers(): (UnitDef | null)[] {
    const maxed = maxedDefIds(run);
    const offerCount = hasLegacy("shop_extra_offer") ? 6 : 5;
    return Array.from({ length: offerCount }, () => rollUnitDef(globalFloor(run), maxed));
  }

  function refresh() {
    row.innerHTML = "";
    goodsRow.innerHTML = "";
    bloodTrade.innerHTML = "";
    const tradesRemaining = run.rescueBloodTradesRemaining ?? 2;
    const canShowBloodTrade = rescue && run.gold < relicPrice && tradesRemaining > 0;
    bloodTrade.classList.toggle("visible", canShowBloodTrade);
    if (canShowBloodTrade) {
      bloodTrade.append(
        el("div", "blood-trade-copy", `🩸 血の取引（残り${tradesRemaining}回）\n最大HPを5捧げ、15Gを受け取る`),
        btn("取引する", "danger", () => {
          showBloodTradeConfirm(run, () => {
            const remaining = run.rescueBloodTradesRemaining ?? 2;
            if (run.playerMaxHp <= 5 || remaining <= 0) return;
            run.playerMaxHp -= 5;
            run.playerHp = Math.min(run.playerHp, run.playerMaxHp);
            run.gold += 15;
            run.rescueBloodTradesRemaining = remaining - 1;
            showNormalMessage(msg, "🩸 最大HPを5捧げ、15Gを受け取った…");
            sfx.coin();
            rerenderAll();
          });
        }),
      );
      const tradeButton = bloodTrade.querySelector("button")!;
      if (run.playerMaxHp <= 5) {
        tradeButton.setAttribute("disabled", "");
        tradeButton.textContent = "これ以上は捧げられない";
      }
    }
    const remainingBench = Math.max(0, BENCH_SIZE - benchUnits(run).length);
    benchStatus.textContent = `🪑 ベンチ残り ${remainingBench} / ${BENCH_SIZE}枠`;
    benchStatus.classList.toggle("full", remainingBench === 0);

    // アイテム・レリック販売
    for (let i = 0; i < itemOffers.length; i++) {
      const id = itemOffers[i];
      if (!id) continue;
      const d = ITEM_BY_ID.get(id)!;
      const card = el("button", "option-card");
      const shopIcon = el("span", "icon");
      shopIcon.appendChild(itemArt(d));
      card.append(shopIcon, el("b", "", d.name), document.createElement("br"), document.createTextNode(d.desc), document.createElement("br"), el("span", "gold-text", `💰 ${itemPrice}G`));
      card.addEventListener("click", () => {
        if (run.gold < itemPrice) {
          showAttentionMessage(msg, `⚠️ ゴールドが足りない！ あと ${itemPrice - run.gold}G 必要です`);
          return;
        }
        run.gold -= itemPrice;
        run.items.push(id);
        itemOffers[i] = null;
        showNormalMessage(msg, `${d.name} を購入した！（配置画面で装備しよう）`);
        sfx.coin();
        rerenderAll();
      });
      goodsRow.appendChild(card);
    }
    if (relicOffer) {
      const r = RELIC_BY_ID.get(relicOffer)!;
      const card = el("button", "option-card relic-card");
      card.innerHTML = `<span class="icon">${r.icon}</span><b>${r.name}</b>（レリック）<br>${r.desc}<br><span class="gold-text">💰 ${relicPrice}G</span>`;
      card.addEventListener("click", () => {
        if (run.gold < relicPrice) {
          showAttentionMessage(msg, `⚠️ ゴールドが足りない！ あと ${relicPrice - run.gold}G 必要です`);
          return;
        }
        run.gold -= relicPrice;
        run.relics.push(relicOffer!);
        showNormalMessage(msg, `レリック「${r.name}」を手に入れた！`);
        relicOffer = null;
        sfx.coin();
        rerenderAll();
      });
      goodsRow.appendChild(card);
    }
    for (let i = 0; i < offers.length; i++) {
      const def = offers[i];
      if (!def) continue;
      const upgradeStar = purchaseStarUpgrade(run, def.id);
      const boardCopies = boardUnits(run).filter((unit) => unit.defId === def.id).length;
      const benchCopies = benchUnits(run).filter((unit) => unit.defId === def.id).length;
      const card = unitCard(def, "購入", () => {
        if (run.gold < unitPrice(def)) {
          showAttentionMessage(msg, `⚠️ ゴールドが足りない！ あと ${unitPrice(def) - run.gold}G 必要です`);
          return;
        }
        if (!addUnit(run, def)) {
          showAttentionMessage(msg, "⚠️ ベンチがいっぱいです！ 下の手持ちユニットを売却してください");
          return;
        }
        run.gold -= unitPrice(def);
        offers[i] = null;
        showNormalMessage(msg, `${def.name} を雇入れた！`);
        sfx.coin();
        rerenderAll();
      });
      if (boardCopies > 0 || benchCopies > 0) {
        const labels = el("div", "shop-owned-labels");
        if (boardCopies > 0) labels.appendChild(el("span", "board", `盤面 ${boardCopies}`));
        if (benchCopies > 0) labels.appendChild(el("span", "bench", `ベンチ ${benchCopies}`));
        card.appendChild(labels);
      }
      if (upgradeStar) {
        card.classList.add("shop-star-upgrade");
        card.appendChild(el("div", "shop-upgrade-badge", `✨ 購入で★${upgradeStar}へアップ！`));
      }
      card.appendChild(el("div", "cost", `💰 ${unitPrice(def)}G で購入`));
      row.appendChild(card);
    }

    bar.innerHTML = "";
    bar.append(
      btn(`🎲 リロール (${rerollPrice}G)`, "", () => {
        if (run.gold < rerollPrice) {
          showAttentionMessage(msg, `⚠️ ゴールドが足りない！ あと ${rerollPrice - run.gold}G 必要です`);
          return;
        }
        run.gold -= rerollPrice;
        offers = rollOffers();
        rerenderAll();
      }),
      ...(itemRerollMax > 0
        ? [btn(`🔄 アイテム更新（残り${run.shopItemRerolls}回）`, "", () => {
            if (run.shopItemRerolls <= 0) {
              showAttentionMessage(msg, "⚠️ このショップでのアイテム更新は使い切りました");
              return;
            }
            run.shopItemRerolls--;
            itemOffers = [rollItem(), rollItem()];
            saveGame({ v: 1, run, battleSpeed: ctx.battleSpeed, resume: { kind: "shop", nodeId: node.id, rescue } });
            sfx.craft();
            rerenderAll();
          })]
        : []),
      btn("マップへ戻る", "primary", () => {
        const carryCount = legacyLevel("item_carry_");
        run.carriedShopItems = itemOffers.filter((id): id is string => id !== null).slice(0, carryCount);
        go({ kind: "map" });
      }),
    );
  }

  // 手持ちの売却
  const rosterPanel = el("div", "center-screen");
  function refreshRoster() {
    rosterPanel.innerHTML = "";
    if (run.roster.length === 0) return;
    rosterPanel.appendChild(el("div", "sub", "手持ちユニット（クリックで売却）"));
    const list = el("div", "roster-list");
    for (const ou of run.roster) {
      const def = unitDef(ou);
      const onBoard = ou.pos !== null;
      const chip = el("div", `roster-chip ${onBoard ? "on-board" : "on-bench"}`);
      chip.dataset.unitTooltip = def.id;
      chip.title = onBoard
        ? `盤面に配置中（${ou.pos!.x + 1}列・${ou.pos!.y + 1}行）`
        : "ベンチで待機中";
      const sellValue = def.cost * (ou.star === 1 ? 1 : ou.star === 2 ? 3 : 9);
      chip.append(
        el("span", `roster-location ${onBoard ? "board" : "bench"}`, onBoard ? "盤面" : "ベンチ"),
        el("span", "", `${def.icon} ${def.name} ${starsText(ou.star)}`),
        btn(`売却 +${sellValue}G`, "", () => {
          sellUnit(run, ou.iid);
          sfx.coin();
          rerenderAll();
        }),
      );
      list.appendChild(chip);
    }
    rosterPanel.appendChild(list);
  }

  function rerenderAll() {
    s.replaceChild(hud(run), s.firstChild!);
    stripHolder.innerHTML = "";
    stripHolder.appendChild(rosterStrip(run));
    refresh();
    refreshRoster();
    side.refreshSide(); // 売却などで盤面が変わればシナジーも更新
  }

  center.append(row, goodsRow, bar);
  const side = withTraitSide(run, center);
  s.append(side.root, rosterPanel);
  refresh();
  refreshRoster();
  return s;
}

/* ================= 休憩 ================= */

export function renderRest(_node: MapNode): HTMLElement {
  const run = ctx.run!;
  const s = el("div");
  s.appendChild(hud(run));
  const center = el("div", "center-screen");
  center.appendChild(el("h2", "", "🏕️ 休憩地点"));
  center.appendChild(el("div", "sub", "焚き火のそばで一息つこう。どちらか選べる："));
  center.appendChild(rosterStrip(run));

  // 回復量: アセンションで半減、幕の掟「疫病の風」で2倍
  let healAmt = 18;
  if (ascMods(run.asc).restHalf) healAmt = Math.floor(healAmt / 2);
  healAmt = Math.round(healAmt * (ACT_RULE_BY_ID.get(run.actRule)?.e.restMult ?? 1));
  if (run.relics.includes("campKit")) healAmt += 5;
  if (hasLegacy("rest_mastery")) healAmt += 8;

  const row = el("div", "card-row");
  const heal = el("button", "option-card");
  heal.innerHTML = `<span class="icon">💤</span><b>休息する</b><br>HPを ${healAmt} 回復する${run.relics.includes("campKit") ? "<br>野営道具: 最大HP +1" : ""}${hasLegacy("rest_mastery") ? "<br>上質な寝袋: 回復量 +8" : ""}`;
  const train = el("button", "option-card");
  train.innerHTML = `<span class="icon">🏋️</span><b>特訓する</b><br>手持ちのランダムなユニットの複製を1体得る（星アップの近道）${run.relics.includes("campKit") ? "<br>野営道具: 最大HP +1" : ""}`;

  function done(text: string) {
    center.innerHTML = "";
    center.appendChild(el("h2", "", "🏕️"));
    center.appendChild(el("div", "sub", text));
    center.appendChild(btn("マップへ戻る", "primary", () => go({ kind: "map" })));
    s.replaceChild(hud(run), s.firstChild!);
  }

  heal.addEventListener("click", () => {
    if (run.relics.includes("campKit")) { run.playerMaxHp += 1; run.playerHp += 1; }
    const amount = Math.min(healAmt, run.playerMaxHp - run.playerHp);
    run.playerHp += amount;
    done(`ぐっすり眠った。HPが ${amount} 回復した！`);
  });
  train.addEventListener("click", () => {
    if (run.relics.includes("campKit")) { run.playerMaxHp += 1; run.playerHp += 1; }
    // ★3は複製しても無駄なので対象から除外
    const pool = run.roster.filter((u) => u.star < 3);
    if (pool.length === 0) {
      done("特訓できる仲間がいなかった…（★3は既に極まっている）");
      return;
    }
    const target = pool[Math.floor(Math.random() * pool.length)];
    const def = unitDef(target);
    if (!addUnit(run, def)) {
      showRewardBenchSale(def, () => done(`${def.icon} ${def.name} の複製を獲得した！`));
      return;
    }
    done(`${def.icon} ${def.name} の複製を獲得した！`);
  });

  row.append(heal, train);
  center.appendChild(row);
  s.appendChild(withTraitSide(run, center).root);
  return s;
}

/* ================= イベント ================= */

interface GameEvent {
  icon: string;
  title: string;
  desc: string;
  options: {
    label: string;
    // effect: 結果テキストを返すだけの単純な選択肢
    effect?: (run: RunState) => string;
    // custom: center を自由に描き換える選択肢（done で結果画面へ）
    custom?: (run: RunState, center: HTMLElement, done: (text: string) => void) => void;
  }[];
}

const EVENTS: GameEvent[] = [
  {
    icon: "🎁",
    title: "怪しい宝箱",
    desc: "道端に豪華な宝箱が置かれている。罠の匂いもするが…",
    options: [
      {
        label: "開ける",
        effect: (run) => {
          if (Math.random() < 0.55) {
            run.gold += 25;
            return "宝箱には金貨が詰まっていた！ +25G";
          }
          run.playerHp = Math.max(1, run.playerHp - 6);
          return "罠だった！ 毒針が刺さり 6 ダメージ…";
        },
      },
      { label: "立ち去る", effect: () => "君は誘惑に打ち勝った。何も起きなかった。" },
    ],
  },
  {
    icon: "🧙",
    title: "旅の傭兵商人",
    desc: "「腕利きを3人連れてきた。1人だけ、格安の6Gで譲るぜ」",
    options: [
      {
        label: "品定めする (6G)",
        custom: (run, center, done) => {
          const PRICE = 6;
          if (run.gold < PRICE) {
            done("ゴールドが足りなかった…商人は肩をすくめて去っていった。");
            return;
          }
          // 通常ショップより格上（通算フロア+4）のユニットを3体提示し、選んで雇える
          const gf = globalFloor(run) + 4;
          const maxed = maxedDefIds(run);
          const cands = [rollUnitDef(gf, maxed), rollUnitDef(gf, maxed), rollUnitDef(gf, maxed)];
          center.innerHTML = "";
          center.appendChild(el("h2", "", "🧙 旅の傭兵商人"));
          center.appendChild(el("div", "sub", `1人選んで雇おう（${PRICE}G）`));
          const row = el("div", "card-row compact");
          for (const def of cands) {
            row.appendChild(
              unitCard(def, "雇う", () => {
                if (run.gold < PRICE) {
                  done("ゴールドが足りない！");
                  return;
                }
                if (!addUnit(run, def)) {
                  done("ベンチが一杯で雇えなかった…");
                  return;
                }
                run.gold -= PRICE;
                sfx.coin();
                done(`${def.icon} ${def.name} が仲間になった！`);
              }),
            );
          }
          center.appendChild(row);
          center.appendChild(btn("やっぱりやめる", "", () => done("君は首を横に振った。商人は去っていった。")));
        },
      },
      { label: "断る", effect: () => "商人は肩をすくめて去っていった。" },
    ],
  },
  {
    icon: "⛲",
    title: "癒しの泉",
    desc: "淡く光る泉を見つけた。神聖な力を感じる。",
    options: [
      {
        label: "水を飲む",
        effect: (run) => {
          const amount = Math.min(12, run.playerMaxHp - run.playerHp);
          run.playerHp += amount;
          return `体が軽くなった。HPが ${amount} 回復した！`;
        },
      },
      {
        label: "祈りを捧げる",
        effect: (run) => {
          run.playerMaxHp += 3;
          run.playerHp += 3;
          return "泉の加護を得た。最大HPが 3 増えた！";
        },
      },
    ],
  },
  {
    icon: "🗿",
    title: "古代の祭壇",
    desc: "「血ヲ捧ゲヨ。サスレバ力ヲ授ケン」…頭に直接声が響く。",
    options: [
      {
        label: "血を捧げる (HP-7)",
        effect: (run) => {
          run.playerHp = Math.max(1, run.playerHp - 7);
          const c = rollRelicChoices(run.relics, 1)[0];
          if (!c) {
            run.gold += 15;
            return "祭壇は沈黙している…足元に金貨が落ちていた (+15G)";
          }
          run.relics.push(c.id);
          discoverRelics([c.id]);
          return `${c.icon} レリック「${c.name}」を授かった！（${c.desc}）`;
        },
      },
      { label: "立ち去る", effect: () => "君は不気味な祭壇に背を向けた。" },
    ],
  },
];

export function renderEvent(_node: MapNode): HTMLElement {
  const run = ctx.run!;
  const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  const s = el("div");
  s.appendChild(hud(run));
  const center = el("div", "center-screen");
  center.appendChild(el("h2", "", `${ev.icon} ${ev.title}`));
  center.appendChild(el("div", "sub", ev.desc));
  center.appendChild(rosterStrip(run));

  const done = (text: string) => {
    center.innerHTML = "";
    center.appendChild(el("h2", "", ev.icon));
    center.appendChild(el("div", "sub", text));
    center.appendChild(btn("マップへ戻る", "primary", () => go({ kind: "map" })));
    s.replaceChild(hud(run), s.firstChild!);
  };

  const row = el("div", "card-row");
  for (const opt of ev.options) {
    const card = el("button", "option-card");
    card.innerHTML = `<b>${opt.label}</b>`;
    card.addEventListener("click", () => {
      if (opt.custom) {
        opt.custom(run, center, done);
        s.replaceChild(hud(run), s.firstChild!);
      } else {
        done(opt.effect!(run));
      }
    });
    row.appendChild(card);
  }
  center.appendChild(row);
  s.appendChild(withTraitSide(run, center).root);
  return s;
}

/* ================= 幕クリア ================= */

export function renderActClear(clearedAct: number): HTMLElement {
  const run = ctx.run!;
  if (clearedAct === 1) {
    grantUnlock("reach_act2");
    grantUnlock("clear_act1");
    if (run.damageTaken === 0) grantUnlock("flawless_act1");
  }
  if (clearedAct === 2) grantUnlock("beat_dragon");
  const s = el("div", "center-screen");
  const persist = () =>
    saveGame({
      v: 1,
      run,
      battleSpeed: ctx.battleSpeed,
      resume: { kind: "actclear", clearedAct },
    });

  const proceed = () => {
    run.pendingAncientChoices = [];
    run.gold += 20;
    run.playerHp = Math.min(run.playerMaxHp, run.playerHp + 15);
    run.act = clearedAct + 1;
    run.floorIndex = 0;
    run.currentNodeId = null;
    run.map = generateMap();
    run.actRule = rollActRule();
    go({ kind: "map" });
  };

  const render = () => {
    s.innerHTML = "";
    s.appendChild(el("h2", "", `🏆 第${clearedAct}幕 クリア！`));
    s.appendChild(
      el("div", "sub", `第${clearedAct}幕の主を打ち倒した！\n報酬: 💰 20G ＋ ❤️ HP 15回復`),
    );

    const alreadyClaimed = run.ancientRewardActs.includes(clearedAct);
    if (!alreadyClaimed) {
      if (run.pendingAncientChoices.length === 0) {
        run.pendingAncientChoices = rollAncientRelicChoices(run.ancientRelics, 3).map((r) => r.id);
        persist();
      }
      discoverAncientRelics(run.pendingAncientChoices);
      s.appendChild(el("h3", "ancient-heading", "✨ エンシェントレリックを1つ選ぼう"));
      s.appendChild(el("div", "sub", "通常のレリックを超える、強力で特殊な遺物。選択はラン終了まで変更できない。"));
      const row = el("div", "card-row ancient-choice-row");
      for (const id of run.pendingAncientChoices) {
        const relic = ANCIENT_RELIC_BY_ID.get(id);
        if (!relic) continue;
        const card = el("button", "option-card ancient-card");
        card.innerHTML = `<span class="icon">${relic.icon}</span><b>${relic.name}</b><br><span>${relic.desc}</span>`;
        card.addEventListener("click", () => {
          run.ancientRelics.push(relic.id);
          run.ancientRewardActs.push(clearedAct);
          run.pendingAncientChoices = [];
          persist();
          sfx.craft();
          render();
        });
        row.appendChild(card);
      }
      s.appendChild(row);
      run.ancientRerollUsedActs ??= [];
      if (hasLegacy("ancient_reroll") && !run.ancientRerollUsedActs.includes(clearedAct)) {
        s.appendChild(btn("🔮 古代の候補をリロール（1回）", "", () => {
          const excluded = [...run.ancientRelics, ...run.pendingAncientChoices];
          const rerolled = rollAncientRelicChoices(excluded, 3).map((relic) => relic.id);
          if (rerolled.length === 0) return;
          run.pendingAncientChoices = rerolled;
          run.ancientRerollUsedActs!.push(clearedAct);
          discoverAncientRelics(rerolled);
          persist();
          sfx.craft();
          render();
        }));
      }
      return;
    }

    const obtained = ANCIENT_RELIC_BY_ID.get(run.ancientRelics[run.ancientRelics.length - 1]);
    if (obtained) {
      const result = el("div", "ancient-obtained");
      result.innerHTML = `<span>${obtained.icon}</span><b>${obtained.name}</b><small>${obtained.desc}</small>`;
      s.appendChild(result);
    }
    s.appendChild(el("div", "sub", "だが旅はまだ終わらない…さらなる強敵が待ち受ける。"));
    s.appendChild(btn(`第${clearedAct + 1}幕へ進む`, "primary", proceed));
  };

  render();
  return s;
}

/* ================= ゲームオーバー ================= */

function fmtTime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, "0")}秒`;
}

export function renderGameover(win: boolean, abandoned = false): HTMLElement {
  const run = ctx.run!;
  const s = el("div", "center-screen");
  const m = meta();
  let earnedShards = 0;
  const firstResultRender = !run.legacyRewarded;
  if (firstResultRender) {
    const progress = (run.act - 1) * 10 + run.floorIndex + 1;
    earnedShards = 5 + progress + run.battleCount * 2 + run.asc * 2 + (win ? 35 : 0);
    m.memoryShards += earnedShards;
    run.legacyRewarded = true;
    saveMeta();
  }
  if (win) {
    const clearMs = Date.now() - run.startedAt;
    const isBestTime = m.records.bestClearMs === null || clearMs < m.records.bestClearMs;
    m.records.totalWins++;
    if (m.records.totalWins >= 3) grantUnlock("clear_three");
    if (run.ancientRelics.length >= 2) grantUnlock("ancient_two_clear");
    if (run.asc >= 20) grantUnlock("ascension20_clear");
    if (isBestTime) m.records.bestClearMs = clearMs;
    if (run.battleCount > m.records.bestBattleWins) m.records.bestBattleWins = run.battleCount;
    if (run.asc > m.records.ascBest) m.records.ascBest = run.asc;
    let ascMsg = "";
    if (run.asc >= m.ascUnlocked && m.ascUnlocked < MAX_ASC) {
      m.ascUnlocked = run.asc + 1;
      ascMsg = `\n🔥 挑戦段位 ${m.ascUnlocked} が解放された！`;
    }
    saveMeta();
    grantUnlock("first_clear");

    s.appendChild(el("h2", "", "👑 魔王討伐！"));
    s.appendChild(
      el(
        "div",
        "sub",
        `全3幕を制覇した！（挑戦段位 ${run.asc}）\n` +
          `クリアタイム: ${fmtTime(clearMs)}${isBestTime ? " 🏅自己ベスト！" : ""}\n` +
          `戦闘勝利数: ${run.battleCount} / 被ダメージ: ${run.damageTaken} / 残りHP: ${run.playerHp}` +
          ascMsg,
      ),
    );
  } else {
    s.appendChild(el("h2", "", abandoned ? "🏳️ 冒険を切り上げた" : "☠️ 力尽きた…"));
    s.appendChild(
      el(
        "div",
        "sub",
        `第${run.act}幕 フロア ${run.floorIndex + 1} で冒険は終わった。戦闘勝利数: ${run.battleCount}${abandoned ? "（途中終了）" : ""}`,
      ),
    );
  }
  if (firstResultRender) {
    const finalTraits = computeTraits(boardUnits(run), run.ancientRelics).filter((trait) => trait.tier > 0);
    const top = abandoned
      ? null
      : ctx.lastBattleReport.filter((row) => row.side === "ally").sort((a, b) => b.damageDealt - a.damageDealt)[0] ?? null;
    m.lastRunRecord = {
      win,
      abandoned,
      act: run.act,
      floor: run.floorIndex + 1,
      asc: run.asc,
      endedAt: Date.now(),
      units: run.roster.map((unit) => ({ defId: unit.defId, star: unit.star, item: unit.item, onBoard: unit.pos !== null })),
      traits: finalTraits.map((trait) => ({ id: trait.trait, tier: trait.tier, count: trait.count })),
      relics: [...run.relics],
      ancientRelics: [...run.ancientRelics],
      topDamageUnit: top ? { name: top.name, damage: top.damageDealt } : null,
    };
    saveMeta();
  }
  if (earnedShards > 0) {
    const reward = el("div", "memory-reward");
    reward.innerHTML = `<b>🔹 記憶の欠片 +${earnedShards}</b><small>到達地点・戦闘勝利数・挑戦段位から算出（所持 ${m.memoryShards}）</small>`;
    s.appendChild(reward);
  }
  const activeTraits = computeTraits(boardUnits(run), run.ancientRelics).filter((trait) => trait.tier > 0);
  const summary = el("div", "run-summary");
  summary.innerHTML = `<b>今回の編成</b><span>配置 ${boardUnits(run).length}体 ／ ★合計 ${boardUnits(run).reduce((sum, unit) => sum + unit.star, 0)}</span><span>発動シナジー ${activeTraits.length}種 ／ 古代レリック ${run.ancientRelics.length}個</span>`;
  s.appendChild(summary);
  const nextLegacy = LEGACY_UPGRADES
    .filter((up) => !hasLegacy(up.id) && (!up.requires || hasLegacy(up.requires)))
    .sort((a, b) => a.cost - b.cost)[0];
  if (nextLegacy) {
    s.appendChild(el("div", "post-run-goal", m.memoryShards >= nextLegacy.cost
      ? `✨ ${nextLegacy.name}を記憶の祭壇で解放できます`
      : `次の解放「${nextLegacy.name}」まで 🔹${nextLegacy.cost - m.memoryShards}`));
  }
  const actions = el("div", "toolbar gameover-actions");
  actions.append(
    btn("🔮 記憶の祭壇へ", nextLegacy && m.memoryShards >= nextLegacy.cost ? "primary" : "", () => showLegacySanctum()),
    btn("同じ段位でもう一度", "primary", () => { selectedAscension = run.asc; go({ kind: "starter" }); }),
    btn("タイトルへ戻る", "", () => go({ kind: "title" })),
  );
  s.appendChild(actions);
  return s;
}
