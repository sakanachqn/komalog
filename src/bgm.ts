import { isMuted } from "./sound";
import { gameSettings } from "./settings";

const BGM_PATH = `${import.meta.env.BASE_URL}assets/bgm.mp3`;
const LOOP_FADE_SECONDS = 1.6;
let player: HTMLAudioElement | null = null;
let started = false;
let fadeGain = 1;
let fadePhase: "normal" | "out" | "in" = "normal";
let fadeInStartedAt = 0;

function syncVolume(): void {
  if (!player) return;
  player.muted = isMuted();
  player.volume = Math.max(0, Math.min(1, gameSettings().bgmVolume * fadeGain));
}

function restartWithFadeIn(): void {
  if (!player) return;
  player.currentTime = 0;
  fadePhase = "in";
  fadeGain = 0;
  fadeInStartedAt = performance.now();
  syncVolume();
  void player.play().catch(() => { started = false; });
}

function updateLoopFade(now: number): void {
  if (player && started && !player.paused && Number.isFinite(player.duration) && player.duration > 0) {
    const remaining = player.duration - player.currentTime;
    if (fadePhase === "normal" && remaining <= LOOP_FADE_SECONDS) fadePhase = "out";

    if (fadePhase === "out") {
      fadeGain = Math.max(0, Math.min(1, remaining / LOOP_FADE_SECONDS));
      syncVolume();
      // 無音近くまで下がったところで先頭へ戻し、MP3末尾の切れ目を隠す。
      if (remaining <= 0.06) restartWithFadeIn();
    } else if (fadePhase === "in") {
      fadeGain = Math.max(0, Math.min(1, (now - fadeInStartedAt) / (LOOP_FADE_SECONDS * 1000)));
      syncVolume();
      if (fadeGain >= 1) fadePhase = "normal";
    }
  }
  requestAnimationFrame(updateLoopFade);
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
  player.loop = false;
  player.preload = "auto";
  player.setAttribute("playsinline", "");
  // バックグラウンドタブなどで描画更新が止まった場合の保険。
  player.addEventListener("ended", restartWithFadeIn);
  syncVolume();

  const retry = () => { void start(); };
  document.addEventListener("pointerdown", retry);
  document.addEventListener("keydown", retry);
  window.addEventListener("komalog-audio-change", syncVolume);
  requestAnimationFrame(updateLoopFade);
  void start();
}
