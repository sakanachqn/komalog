/** WebAudioで合成する軽量効果音。音源ファイル不要。
 *  耳に刺さらないよう、サイン/三角波＋ソフトアタック＋マスターローパスで丸い音にしている。 */

let actx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try {
  muted = localStorage.getItem("acr-muted") === "1";
} catch {
  /* noop */
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem("acr-muted", muted ? "1" : "0");
  } catch {
    /* noop */
  }
  return muted;
}

/** マスター経路: 全SFX → ゲイン → ローパス(2kHz) → 出力。高域の刺さりをまとめてカット */
function out(): GainNode | null {
  try {
    if (!actx) {
      actx = new AudioContext();
      master = actx.createGain();
      master.gain.value = 0.7;
      const lowpass = actx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 2000;
      lowpass.Q.value = 0.5;
      master.connect(lowpass).connect(actx.destination);
    }
    if (actx.state === "suspended") void actx.resume();
    return master;
  } catch {
    return null;
  }
}

/** 同種の音の鳴らしすぎ防止 */
const lastPlayed: Record<string, number> = {};
function throttle(key: string, ms: number): boolean {
  const now = performance.now();
  if (now - (lastPlayed[key] ?? 0) < ms) return false;
  lastPlayed[key] = now;
  return true;
}

const ATTACK = 0.012; // ソフトアタック（クリックノイズ防止）

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  freqEnd?: number,
  delay = 0,
) {
  const dest = out();
  if (!dest || !actx) return;
  const t0 = actx.currentTime + delay;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + ATTACK);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, filterFreq: number) {
  const dest = out();
  if (!dest || !actx) return;
  const t0 = actx.currentTime;
  const len = Math.max(1, Math.floor(actx.sampleRate * dur));
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource();
  src.buffer = buf;
  const filter = actx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  const gain = actx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + ATTACK);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(gain).connect(dest);
  src.start(t0);
}

export const sfx = {
  /** 通常攻撃ヒット: こもった短いポフ音 */
  hit() {
    if (muted || !throttle("hit", 120)) return;
    noise(0.07, 0.12, 700);
  },
  /** クリティカル: 少し重いポフ+低い三角波 */
  crit() {
    if (muted || !throttle("crit", 150)) return;
    noise(0.11, 0.18, 900);
    tone(180, 0.14, "triangle", 0.12, 90);
  },
  /** スキル詠唱: やわらかい上昇音 */
  cast() {
    if (muted || !throttle("cast", 180)) return;
    tone(440, 0.18, "sine", 0.13, 720);
  },
  /** 範囲爆発: 低くこもったドン */
  blast() {
    if (muted || !throttle("blast", 220)) return;
    noise(0.32, 0.2, 380);
    tone(100, 0.3, "triangle", 0.12, 45);
  },
  /** ユニット死亡: 下降する三角波 */
  death() {
    if (muted || !throttle("death", 150)) return;
    tone(260, 0.3, "triangle", 0.08, 60);
  },
  /** 回復・シールド: 澄んだ上昇サイン */
  heal() {
    if (muted || !throttle("heal", 250)) return;
    tone(520, 0.16, "sine", 0.1, 780);
  },
  /** 購入・売却・報酬: 丸い2音チャイム */
  coin() {
    if (muted) return;
    tone(660, 0.09, "sine", 0.12);
    tone(990, 0.12, "sine", 0.12, undefined, 0.07);
  },
  /** 合成: 低いコツン+柔らかい上昇音 */
  craft() {
    if (muted) return;
    tone(200, 0.12, "triangle", 0.13, 150);
    tone(400, 0.18, "sine", 0.13, 620, 0.1);
  },
  /** 勝利ジングル: サイン波アルペジオ */
  win() {
    if (muted) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.22, "sine", 0.12, undefined, i * 0.13));
  },
  /** 敗北: ゆっくり下降 */
  lose() {
    if (muted) return;
    const notes = [392, 311, 233];
    notes.forEach((f, i) => tone(f, 0.35, "sine", 0.11, undefined, i * 0.2));
  },
};
