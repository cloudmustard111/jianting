// 音高换算唯一实现：任何模块不得重复实现音高/移调换算（执行约束 7）。
import { CONFIG } from '../config.js';

const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const NOTE_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];

// "C4" / "Ds4"(即 D#4) / "Fb3" → MIDI 编号。Salamander 采样文件名采用 s 表示升号。
export function noteNameToMidi(name) {
  const m = /^([A-G])(s|b|#)?(-?\d+)$/.exec(name);
  if (!m) throw new Error(`非法音名: ${name}`);
  const acc = (m[2] === 's' || m[2] === '#') ? 1 : (m[2] === 'b' ? -1 : 0);
  return 12 * (parseInt(m[3], 10) + 1) + LETTER_SEMITONE[m[1]] + acc;
}

export function midiToName(midi) {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// MIDI 编号 → 频率（A4 = MIDI 69 = 440Hz）
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 拍 → 秒（时间换算唯一入口；单位约定见 config.music.beatUnit / bpm）
export function beatsToSecondsAt(beats, bpm) {
  if (CONFIG.music.beatUnit !== 'quarter') throw new Error(`未实现的节拍单位: ${CONFIG.music.beatUnit}`);
  return beats * (60 / bpm);
}

// 默认按全局速度；变速试听（旋律重建的慢速练习）显式传 bpm
export function beatsToSeconds(beats, bpm = CONFIG.music.bpm) {
  return beatsToSecondsAt(beats, bpm);
}

// 从可用采样音高中选最近的一个（两侧等距时取较低者）
export function nearestSampleMidi(midi, sampleMidis) {
  if (!sampleMidis || sampleMidis.length === 0) throw new Error('无可用采样');
  let best = sampleMidis[0];
  for (const s of sampleMidis) {
    if (Math.abs(s - midi) < Math.abs(best - midi)) best = s;
  }
  return best;
}

// 变速重映射：采样实际音高 → 目标音高所需的播放速率
export function playbackRate(targetMidi, sampleMidi) {
  return Math.pow(2, (targetMidi - sampleMidi) / 12);
}

// 播放音域钳制（超出采样覆盖范围时收拢到边界）
export function clampToRange(midi) {
  return Math.max(CONFIG.music.rangeLow, Math.min(CONFIG.music.rangeHigh, midi));
}
