// 标准 SMF（Standard MIDI File）编码器 + 结构解析器。
// 格式 0 / 单轨 / 动态读取 config.midi.ppq。导出后必须经 smfInfo 校验（字节级真实编码，非 JSON 改名）。
import { CONFIG } from '../config.js';
import { clampToRange } from '../theory/notes.js';

// —— 变长数量（VLQ）编码 ——
function vlq(n) {
  if (n < 0) throw new Error('VLQ 负数: ' + n);
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return out;
}
function u16(n) { return [(n >> 8) & 0xff, n & 0xff]; }
function u32(n) { return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]; }
function ascii(s) { return [...s].map((c) => c.charCodeAt(0) & 0x7f); }

// notes: [{ midi, startBeats, durBeats, velocity? }]
export function buildSMF({ notes, bpm = CONFIG.music.bpm, ppq = CONFIG.midi.ppq, trackName = 'ChordLab' }) {
  const events = [];
  for (const n of notes) {
    const midi = clampToRange(n.midi);
    const start = Math.round(n.startBeats * ppq);
    const dur = Math.round(n.durBeats * ppq);
    if (dur <= 0) continue;
    const vel = Math.max(1, Math.min(127, Math.round((n.velocity ?? CONFIG.audio.defaultVelocity) * 127)));
    events.push({ tick: start, order: 1, bytes: [0x90, midi, vel] });       // Note On
    events.push({ tick: start + dur, order: 0, bytes: [0x80, midi, 0] });   // Note Off（同 tick 时先 Off 后 On，避免粘音）
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  if (trackName.length > 127) throw new Error('trackName 过长（SMF meta 长度为单字节）');
  const usPerQuarter = Math.round(60000000 / bpm);
  const meta = [
    ...vlq(0), 0xFF, 0x03, trackName.length, ...ascii(trackName),                    // 轨道名
    ...vlq(0), 0xFF, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff, // 速度
    ...vlq(0), 0xFF, 0x58, 0x04, 4, 2, 24, 8,                                        // 拍号 4/4
  ];

  const track = [...meta];
  let last = 0;
  for (const ev of events) {
    track.push(...vlq(ev.tick - last), ...ev.bytes);
    last = ev.tick;
  }
  track.push(...vlq(0), 0xFF, 0x2F, 0x00); // End of Track

  return new Uint8Array([
    ...ascii('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(ppq),
    ...ascii('MTrk'), ...u32(track.length), ...track,
  ]);
}

// 触发下载。桌面/浏览器走 a[download]；APK 壳（MainActivity）注册了 window.JiantingSave，
// WebView 里 blob 下载不通，由壳把 base64 字节落盘到系统 Downloads。
export function downloadSMF(bytes, filename) {
  if (window.JiantingSave && typeof window.JiantingSave.save === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    window.JiantingSave.save(btoa(bin), filename);
    return;
  }
  const blob = new Blob([bytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// —— 结构解析器（自检/自动化测试用）：报告文件头、轨道长度、音符事件数、结束标记 ——
export function smfInfo(bytes) {
  const u8 = (i) => bytes[i];
  const str4 = (i) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  const u16 = (i) => (bytes[i] << 8) | bytes[i + 1];
  const u32 = (i) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;

  const info = {
    headerOk: str4(0) === 'MThd' && u32(4) === 6,
    format: u16(8), ntrks: u16(10), ppq: u16(12),
    mtrkOk: str4(14) === 'MTrk',
    trkLen: u32(18),
    noteOn: 0, noteOff: 0, totalTicks: 0, endOfFile: false,
    error: null,
  };
  let i = 22, last = 0;
  const end = 22 + info.trkLen;
  try {
    while (i < end) {
      let delta = 0, b;
      do { b = u8(i++); delta = (delta << 7) | (b & 0x7f); } while (b & 0x80);
      last += delta;
      const st = u8(i++);
      if (st === 0xFF) {
        const type = u8(i++); const len = u8(i++);
        if (type === 0x2F) info.endOfFile = true;
        i += len;
      } else if (st === 0x90) {
        const note = u8(i++); const vel = u8(i++);
        if (vel > 0) info.noteOn++; else info.noteOff++;
        if (note > 127) throw new Error('音符编号越界 @' + i);
      } else if (st === 0x80) {
        i += 2; info.noteOff++;
      } else {
        throw new Error('未知状态字节 0x' + st.toString(16) + ' @' + i);
      }
    }
  } catch (e) { info.error = String(e.message || e); }
  info.totalTicks = last;
  info.bytesLen = bytes.length;
  info.structOk = info.headerOk && info.mtrkOk && info.format === 0 && info.ntrks === 1
    && info.endOfFile && !info.error && i === end;
  return info;
}
