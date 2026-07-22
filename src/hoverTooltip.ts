import { CRAFT_RECIPES, ITEM_BY_ID } from "./data/relics";
import { TRAITS, UNIT_BY_ID } from "./data/units";
import type { EnemyDef, TraitId } from "./types";

function rangeLabel(range: number): string {
  const kind = range <= 1 ? "近距離" : range === 2 ? "中距離" : "遠距離";
  return `${kind}(${range})`;
}

function scalingLabel(scaling: "attack" | "spell"): string {
  return scaling === "attack" ? "⚔️ 攻撃力参照" : "🔮 呪文威力参照";
}

/** 定義IDを持たない敵にも共通のユニットツールチップを付与する。 */
export function tagEnemyTooltip(target: HTMLElement, def: EnemyDef): void {
  target.dataset.hoverName = def.name;
  target.dataset.hoverRange = rangeLabel(def.range);
  target.dataset.hoverTraits = "敵ユニット";
  target.dataset.hoverSkillName = def.skill?.name ?? "通常攻撃";
  target.dataset.hoverSkillDesc = def.skill?.desc ?? "固有スキルなし";
  target.dataset.hoverSkillScaling = def.skill ? scalingLabel(def.skill.scaling) : "";
}

function tooltipHtml(target: HTMLElement): string | null {
  const unitTarget = target.closest<HTMLElement>("[data-unit-tooltip]");
  if (unitTarget) {
    const def = UNIT_BY_ID.get(unitTarget.dataset.unitTooltip!);
    if (!def) return null;
    const traits = def.traits.map((id: TraitId) => `${TRAITS[id].icon}${TRAITS[id].name}`).join("　");
    return `<b>${def.icon} ${def.name}</b><div class="hover-meta"><span>射程</span><strong>${rangeLabel(def.range)}</strong></div><div class="hover-meta"><span>特性</span><strong>${traits}</strong></div><div class="hover-skill"><small>スキル</small><b>${def.skill.name}</b><em class="skill-scaling ${def.skill.scaling}">${scalingLabel(def.skill.scaling)}</em><p>${def.skill.desc}</p></div>`;
  }

  const itemTarget = target.closest<HTMLElement>("[data-item-tooltip]");
  if (itemTarget) {
    const item = ITEM_BY_ID.get(itemTarget.dataset.itemTooltip!);
    if (!item) return null;
    const isMaterial = Object.keys(CRAFT_RECIPES).some((key) => key.split("+").includes(item.id));
    const isResult = Object.values(CRAFT_RECIPES).includes(item.id);
    const category = isMaterial && isResult ? "合成素材・合成品" : isMaterial ? "合成素材" : isResult ? "合成アイテム" : "アイテム";
    return `<b>${item.icon} ${item.name}</b><div class="hover-item-kind">${category}</div><div class="hover-skill"><small>効果</small><p>${item.desc}</p></div>`;
  }

  const traitTarget = target.closest<HTMLElement>("[data-trait-tooltip]");
  if (traitTarget) {
    const id = traitTarget.dataset.traitTooltip as TraitId;
    const info = TRAITS[id];
    if (!info) return null;
    const tier = Number(traitTarget.dataset.traitTier ?? 0);
    const levels = info.thresholds
      .map((threshold, index) => `<div class="${index + 1 === tier ? "current" : ""}">&lt;${threshold}体&gt; ${info.desc(index + 1)}</div>`)
      .join("");
    return `<b>${info.icon} ${info.name}</b><small class="trait-threshold-label">発動閾値: ${info.thresholds.join(" / ")}</small><div class="hover-trait-levels">${levels}</div>`;
  }

  const enemyTarget = target.closest<HTMLElement>("[data-hover-name]");
  if (enemyTarget) {
    const scaling = enemyTarget.dataset.hoverSkillScaling;
    return `<b>${enemyTarget.dataset.hoverName}</b><div class="hover-meta"><span>射程</span><strong>${enemyTarget.dataset.hoverRange}</strong></div><div class="hover-meta"><span>特性</span><strong>${enemyTarget.dataset.hoverTraits}</strong></div><div class="hover-skill"><small>スキル</small><b>${enemyTarget.dataset.hoverSkillName}</b>${scaling ? `<em class="skill-scaling ${enemyTarget.dataset.hoverSkillScaling?.includes("攻撃") ? "attack" : "spell"}">${scaling}</em>` : ""}<p>${enemyTarget.dataset.hoverSkillDesc}</p></div>`;
  }
  return null;
}

export function initHoverTooltips(): void {
  const tip = document.createElement("div");
  tip.className = "hover-tooltip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);

  const position = (event: PointerEvent) => {
    const gap = 16;
    const width = tip.offsetWidth || 300;
    const height = tip.offsetHeight || 180;
    const left = Math.min(event.clientX + gap, window.innerWidth - width - 10);
    const top = Math.min(event.clientY + gap, window.innerHeight - height - 10);
    tip.style.left = `${Math.max(10, left)}px`;
    tip.style.top = `${Math.max(10, top)}px`;
  };

  document.addEventListener("pointerover", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const html = tooltipHtml(event.target);
    if (!html) return;
    tip.innerHTML = html;
    tip.classList.add("visible");
    position(event);
  });
  document.addEventListener("pointermove", (event) => {
    if (tip.classList.contains("visible")) position(event);
  });
  document.addEventListener("pointerout", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const related = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    const source = event.target.closest("[data-unit-tooltip], [data-item-tooltip], [data-trait-tooltip], [data-hover-name]");
    if (source && (!related || !source.contains(related))) tip.classList.remove("visible");
  });
}
