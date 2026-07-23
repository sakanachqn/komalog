import { isMuted } from "./sound";
import { gameSettings } from "./settings";

export type BgmScene = "title" | "stage1" | "stage2" | "stage3";

const BGM_PATHS: Record<BgmScene, string> = {
  title: `${import.meta.env.BASE_URL}assets/bgm-title.mp3`,
  stage1: `${import.meta.env.BASE_URL}assets/bgm-stage1.mp3`,
  stage2: `${import.meta.env.BASE_URL}assets/bgm-stage2.mp3`,
  stage3: `${import.meta.env.BASE_URL}assets/bgm-stage3.mp3`,
};
const BGM_START_OFFSETS: Record<BgmScene, number> = {
  title: 2,
  stage1: 3,
  stage2: 0,
  stage3: 0,
};

const FADE_SECONDS = 1.6;
const FADE_MS = FADE_SECONDS * 1000;

interface Track {
  scene: BgmScene;
  audio: HTMLAudioElement;
  gain: number;
  fromGain: number;
  targetGain: number;
  fadeStartedAt: number;
  loopGain: number;
  loopFadeInAt: number | null;
  started: boolean;
}

let initialized = false;
let desiredScene: BgmScene = "title";
let tracks: Track[] = [];

function syncVolume(track: Track): void {
  track.audio.muted = isMuted() || !gameSettings().bgmEnabled;
  track.audio.volume = Math.max(0, Math.min(1, gameSettings().bgmVolume * track.gain * track.loopGain));
}

async function startTrack(track: Track): Promise<void> {
  if (track.started) return;
  // オフセット曲はメタデータ取得後にシークし、冒頭が一瞬鳴るのを防ぐ。
  if (BGM_START_OFFSETS[track.scene] > 0 && track.audio.readyState < HTMLMediaElement.HAVE_METADATA) {
    track.audio.load();
    return;
  }
  if (track.audio.currentTime < BGM_START_OFFSETS[track.scene]) {
    track.audio.currentTime = BGM_START_OFFSETS[track.scene];
  }
  syncVolume(track);
  try {
    await track.audio.play();
    track.started = true;
  } catch {
    // ブラウザの自動再生制限中、または音源がまだ未配置。次の操作で再試行する。
  }
}

function createTrack(scene: BgmScene, initialGain: number): Track {
  const audio = new Audio(BGM_PATHS[scene]);
  audio.loop = false;
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  const track: Track = {
    scene,
    audio,
    gain: initialGain,
    fromGain: initialGain,
    targetGain: 1,
    fadeStartedAt: performance.now(),
    loopGain: 1,
    loopFadeInAt: null,
    started: false,
  };
  audio.addEventListener("ended", () => restartLoop(track));
  audio.addEventListener("error", () => {
    track.started = false;
    // 一時的な読込失敗や、開発中に後から音源を配置した場合もトラックを破棄しない。
    console.warn(`[BGM] 読み込みに失敗しました: ${audio.src}`);
  });
  audio.addEventListener("canplay", () => {
    if (track.targetGain > 0 && !track.started) void startTrack(track);
  });
  audio.addEventListener("loadedmetadata", () => {
    const offset = BGM_START_OFFSETS[scene];
    if (offset > 0 && audio.duration > offset) audio.currentTime = offset;
    if (track.targetGain > 0 && !track.started) void startTrack(track);
  });
  syncVolume(track);
  return track;
}

function restartLoop(track: Track): void {
  track.audio.currentTime = Math.min(BGM_START_OFFSETS[track.scene], Math.max(0, track.audio.duration - 0.1));
  track.loopGain = 0;
  track.loopFadeInAt = performance.now();
  track.started = false;
  syncVolume(track);
  void startTrack(track);
}

function beginFade(track: Track, target: number, now = performance.now()): void {
  track.fromGain = track.gain;
  track.targetGain = target;
  track.fadeStartedAt = now;
}

/** 画面に対応するBGMへ、共通のフェード時間で自動切り替えする。 */
export function setBgmScene(scene: BgmScene): void {
  desiredScene = scene;
  if (!initialized) return;
  const active = tracks.find((track) => track.scene === scene && track.targetGain > 0);
  if (active) return;

  const now = performance.now();
  for (const track of tracks) beginFade(track, 0, now);
  const next = createTrack(scene, 0);
  tracks.push(next);
  beginFade(next, 1, now);
  void startTrack(next);
}

function updateTrack(track: Track, now: number): void {
  const fadeProgress = Math.min(1, Math.max(0, (now - track.fadeStartedAt) / FADE_MS));
  track.gain = track.fromGain + (track.targetGain - track.fromGain) * fadeProgress;

  if (track.started && !track.audio.paused && Number.isFinite(track.audio.duration) && track.audio.duration > 0) {
    const remaining = track.audio.duration - track.audio.currentTime;
    if (track.loopFadeInAt !== null) {
      track.loopGain = Math.min(1, (now - track.loopFadeInAt) / FADE_MS);
      if (track.loopGain >= 1) track.loopFadeInAt = null;
    } else if (remaining <= FADE_SECONDS) {
      track.loopGain = Math.max(0, remaining / FADE_SECONDS);
      if (remaining <= 0.06) restartLoop(track);
    } else {
      track.loopGain = 1;
    }
  }
  syncVolume(track);
}

function update(now: number): void {
  for (const track of tracks) updateTrack(track, now);
  tracks = tracks.filter((track) => {
    if (track.targetGain > 0 || track.gain > 0.002) return true;
    track.audio.pause();
    track.audio.src = "";
    return false;
  });
  requestAnimationFrame(update);
}

/** 4種類のBGMを初期化する。実際の曲は画面遷移に応じて遅延読み込みされる。 */
export function initBgm(): void {
  if (initialized) return;
  initialized = true;
  const first = createTrack(desiredScene, 0);
  tracks.push(first);
  beginFade(first, 1);

  const retry = () => {
    for (const track of tracks) {
      if (track.targetGain <= 0) continue;
      if (track.audio.error) track.audio.load();
      void startTrack(track);
    }
  };
  document.addEventListener("pointerdown", retry);
  document.addEventListener("keydown", retry);
  window.addEventListener("komalog-audio-change", () => {
    for (const track of tracks) syncVolume(track);
  });
  requestAnimationFrame(update);
  void startTrack(first);
}
