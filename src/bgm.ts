import { isMuted } from "./sound";
import { gameSettings } from "./settings";

const BGM_PATH = `${import.meta.env.BASE_URL}assets/bgm.mp3`;
let player: HTMLAudioElement | null = null;
let started = false;

function syncVolume(): void {
  if (!player) return;
  player.muted = isMuted();
  player.volume = Math.max(0, Math.min(1, gameSettings().bgmVolume));
}

async function start(): Promise<void> {
  if (!player || started) return;
  syncVolume();
  try {
    await player.play();
    started = true;
  } catch {
    // 自動再生制限中、または音源配置前。次のユーザー操作で再試行する。
  }
}

/** public/assets/bgm.mp3 を全画面共通でループ再生する。 */
export function initBgm(): void {
  if (player) return;
  player = new Audio(BGM_PATH);
  player.loop = true;
  player.preload = "auto";
  player.setAttribute("playsinline", "");
  syncVolume();

  const retry = () => { void start(); };
  document.addEventListener("pointerdown", retry);
  document.addEventListener("keydown", retry);
  window.addEventListener("komalog-audio-change", syncVolume);
  void start();
}
