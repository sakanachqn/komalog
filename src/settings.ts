export interface GameSettings {
  seVolume: number;
  bgmVolume: number;
  screenShake: boolean;
  reducedEffects: boolean;
  confirmBloodTrade: boolean;
}

const KEY = "komalog-settings-v1";
const defaults: GameSettings = { seVolume: 0.7, bgmVolume: 0.32, screenShake: true, reducedEffects: false, confirmBloodTrade: true };
let current = load();

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<GameSettings> & { volume?: number };
      // 旧「全体音量」を、当時とほぼ同じ聞こえ方になる2系統へ移行する。
      return {
        ...defaults,
        ...saved,
        seVolume: saved.seVolume ?? saved.volume ?? defaults.seVolume,
        bgmVolume: saved.bgmVolume ?? (saved.volume !== undefined ? saved.volume * 0.45 : defaults.bgmVolume),
      };
    }
  } catch { /* noop */ }
  return { ...defaults };
}

export function gameSettings(): GameSettings { return current; }

export function updateSettings(patch: Partial<GameSettings>): GameSettings {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* noop */ }
  applySettingsClass();
  window.dispatchEvent(new Event("komalog-audio-change"));
  return current;
}

export function applySettingsClass(): void {
  document.documentElement.classList.toggle("reduce-effects", current.reducedEffects);
}
