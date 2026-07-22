export interface GameSettings {
  volume: number;
  screenShake: boolean;
  reducedEffects: boolean;
}

const KEY = "komalog-settings-v1";
const defaults: GameSettings = { volume: 0.7, screenShake: true, reducedEffects: false };
let current = load();

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* noop */ }
  return { ...defaults };
}

export function gameSettings(): GameSettings { return current; }

export function updateSettings(patch: Partial<GameSettings>): GameSettings {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* noop */ }
  applySettingsClass();
  return current;
}

export function applySettingsClass(): void {
  document.documentElement.classList.toggle("reduce-effects", current.reducedEffects);
}
