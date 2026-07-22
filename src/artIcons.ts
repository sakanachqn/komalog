import type { TraitId, UnitDef } from "./types";
import type { ItemDef } from "./data/relics";
import { ITEMS } from "./data/relics";
import { TRAITS } from "./data/units";

declare const __ICON_BUILD_VERSION__: string;

export function unitArt(def: UnitDef, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = def.icon;
  span.setAttribute("aria-label", def.name);
  span.dataset.unitTooltip = def.id;
  return span;
}

export function synergyArt(id: TraitId, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = TRAITS[id].icon;
  span.setAttribute("aria-label", TRAITS[id].name);
  return span;
}

export function itemArt(item: ItemDef, className = ""): HTMLSpanElement {
  const dataIndex = Math.max(0, ITEMS.findIndex((entry) => entry.id === item.id));
  const span = document.createElement("span");
  span.className = `art-icon art-item${className ? ` ${className}` : ""}`;
  span.textContent = item.icon;
  span.setAttribute("aria-label", item.name);
  span.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/icons/items/${dataIndex + 1}.png?v=${__ICON_BUILD_VERSION__}")`;
  span.dataset.itemTooltip = item.id;
  return span;
}

export function replaceWithUnitArt(target: HTMLElement, def: UnitDef): void {
  target.textContent = "";
  target.appendChild(unitArt(def));
}
