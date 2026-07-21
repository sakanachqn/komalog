import type { TraitId, UnitDef } from "./types";
import type { ItemDef } from "./data/relics";
import { ITEMS } from "./data/relics";
import { TRAITS, UNITS } from "./data/units";

type ArtKind = "unit" | "item";

function art(kind: ArtKind, index: number, fallback: string, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `art-icon art-${kind}${className ? ` ${className}` : ""}`;
  span.textContent = fallback;
  span.setAttribute("aria-label", fallback);
  const folder = kind === "unit" ? "units" : "items";
  span.style.backgroundImage = `url("${import.meta.env.BASE_URL}assets/icons/${folder}/${index}.png")`;
  return span;
}

export function unitArt(def: UnitDef, className = ""): HTMLSpanElement {
  return art("unit", Math.max(0, UNITS.findIndex((u) => u.id === def.id)) + 1, def.icon, className);
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
