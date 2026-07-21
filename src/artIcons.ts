import type { TraitId, UnitDef } from "./types";
import type { ItemDef } from "./data/relics";
import { ITEMS } from "./data/relics";
import { TRAITS } from "./data/units";

declare const __ICON_BUILD_VERSION__: string;

type ArtKind = "item";

function art(kind: ArtKind, index: number, fallback: string, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `art-icon art-${kind}${className ? ` ${className}` : ""}`;
  span.textContent = fallback;
  span.setAttribute("aria-label", fallback);
  const folder = "items";
  span.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/icons/${folder}/${index}.png?v=${__ICON_BUILD_VERSION__}")`;
  return span;
}

export function unitArt(def: UnitDef, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = def.icon;
  span.setAttribute("aria-label", def.name);
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
  const dataIndex = Math.max(0, ITEMS.findIndex((i) => i.id === item.id));
  return art("item", dataIndex + 1, item.icon, className);
}

export function replaceWithUnitArt(target: HTMLElement, def: UnitDef): void {
  target.textContent = "";
  target.appendChild(unitArt(def));
}
