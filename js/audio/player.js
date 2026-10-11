// 音乐操作层：单音 / 和弦 / 旋律 / 停止。所有时间以"拍"为单位，换算唯一入口 theory/notes.beatsToSeconds。
import { CONFIG } from '../config.js';
import { clampToRange, beatsToSeconds } from '../theory/notes.js';
import { engine } from './engine.js';

export const player = {
  // 单音（键盘点击、试听）：立即发声
  playNote(midi, { velocity = CONFIG.audio.defaultVelocity, durationBeats = null } = {}) {
    if (!engine.ctx) return null;
    const durationSec = durationBeats == null
      ? CONFIG.audio.defaultNoteSec
      : beatsToSeconds(durationBeats);
    return engine.playMidi(clampToRange(midi), engine.now() + 0.001, durationSec, velocity);
  },

  // 和弦：多个音同时发声
  playChord(midis, { velocity = CONFIG.audio.defaultVelocity, durationBeats = 2 } = {}) {
    if (!engine.ctx) return [];
    const sec = beatsToSeconds(durationBeats);
    const t0 = engine.now() + 0.001;
    return midis.map((m) => engine.playMidi(clampToRange(m), t0, sec, velocity));
  },

  // 琶音：midis 从低到高依次发声
  playArpeggio(midis, {
    velocity = CONFIG.audio.defaultVelocity,
    stepBeats = CONFIG.chords.arpeggioStepBeats,
    noteBeats = CONFIG.chords.arpeggioNoteBeats,
  } = {}) {
    if (!engine.ctx) return { voices: [], totalSec: 0 };
    const stepSec = beatsToSeconds(stepBeats);
    const noteSec = beatsToSeconds(noteBeats);
    const t0 = engine.now() + 0.05;
    const voices = midis.map((m, i) => engine.playMidi(clampToRange(m), t0 + i * stepSec, noteSec, velocity));
    return { voices, totalSec: (midis.length - 1) * stepSec + noteSec };
  },

  // 旋律：notes = [{ midi, startBeats, durBeats }]，统一音符模型（M2 起附加 jianpu 字段）
  playMelody(notes, { velocity = CONFIG.audio.defaultVelocity, bpm = CONFIG.music.bpm } = {}) {
    if (!engine.ctx) return { voices: [], totalSec: 0 };
    const t0 = engine.now() + 0.08;
    let totalSec = 0;
    const voices = [];
    for (const n of notes) {
      // 变速试听：旋律重建的慢速练习靠它，一处 bpm 决定整段的快慢
      const startSec = beatsToSeconds(n.startBeats, bpm);
      const durSec = beatsToSeconds(n.durBeats, bpm);
      totalSec = Math.max(totalSec, startSec + durSec);
      voices.push(engine.playMidi(clampToRange(n.midi), t0 + startSec, durSec, n.velocity ?? velocity));
    }
    return { voices, totalSec };
  },

  stopAll() {
    return engine.stopAll();
  },
};
