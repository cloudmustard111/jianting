// 节奏型库：全项目唯一的节奏定义权威。
// 分两组，因为两种练习对「节奏型」的要求不一样：
//   CELLS_4 —— 长度固定 4 个音、正好 4 拍。简谱轨与旋律轨换节奏型时靠它原样保留音高序列。
//   PATTERNS —— 音数不定、以「起音位置 + 时值」描述。节奏轨按起音位置点网格作答，用这一组。

// 4 拍 × 4 个位置，每条都正好 4 拍：换型时音高一一对应
export const CELLS_4 = [
  { id: 'even',    symbol: '四个四分',   parts: [1, 1, 1, 1] },
  { id: 'paired',  symbol: '八分对',     parts: [0.5, 0.5, 1, 2] },
  { id: 'midpair', symbol: '中段八分对', parts: [1, 0.5, 0.5, 2] },
  { id: 'dotted',  symbol: '附点',       parts: [1, 1.5, 0.5, 1] },
  { id: 'rest',    symbol: '含休止',     parts: [1, 1, 0.5, 1.5], restAt: 1 },
];

export function getCellById(id) {
  const c = CELLS_4.find((x) => x.id === id);
  if (!c) throw new Error(`未知节奏型: ${id}`);
  return c;
}

// 起音位置 + 时值（拍）。一条 pattern 总和 4 拍 = 一小节。
export const PATTERNS = [
  { id: 'rq:quarter',   symbol: '四分',   name: '每拍一个，最稳的骨架',
    notes: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  { id: 'rq:eighths',   symbol: '八分',   name: '前半小节八分连走',
    notes: [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]] },
  { id: 'rq:rest',      symbol: '休止',   name: '第三拍整拍留空',
    notes: [[0, 1], [1, 1], [3, 1]] },
  { id: 'rq:dotted',    symbol: '附点',   name: '长短短，附点吃掉后面一半',
    notes: [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1]] },
  { id: 'rq:sixteenth', symbol: '十六分', name: '第二拍一拍四连',
    notes: [[0, 1], [1, 0.25], [1.25, 0.25], [1.5, 0.25], [1.75, 0.25], [2, 1], [3, 1]] },
  { id: 'rq:sync',      symbol: '切分',   name: '重音从强拍挪到弱拍上',
    notes: [[0, 1], [1, 0.5], [1.5, 1], [2.5, 0.5], [3, 1]] },
];

export function getPatternById(id) {
  const p = PATTERNS.find((x) => x.id === id);
  if (!p) throw new Error(`未知节奏型: ${id}`);
  return p;
}

// 一小节的十六分网格：16 格，格子宽 0.25 拍
export const GRID_STEP = 0.25;
export const GRID_CELLS = 16;

// 一条 pattern → 起音所在的格子下标（作答网格比对用）
export function onsetCells(pattern) {
  return pattern.notes.map(([start]) => Math.round(start / GRID_STEP));
}

// 把音高序列塞进一条 pattern：同一时刻只留一个音（节奏轨是单音色打击感）
export function patternToNotes(pattern, midi, { accentMidi = midi } = {}) {
  return pattern.notes.map(([startBeats, durBeats], i) => ({
    midi: i === 0 ? accentMidi : midi,
    startBeats,
    durBeats,
  }));
}

// 作答网格 vs 目标：按起音位置比。多点是「抢拍」，少点是「漏拍」。
export function diffOnsets(userCells, targetCells) {
  const u = new Set(userCells);
  const t = new Set(targetCells);
  const hit = [...t].filter((c) => u.has(c));
  const extra = [...u].filter((c) => !t.has(c)).sort((a, b) => a - b);
  const missing = [...t].filter((c) => !u.has(c)).sort((a, b) => a - b);
  return {
    hit: hit.length,
    total: t.size,
    extra,
    missing,
    perfect: extra.length === 0 && missing.length === 0 && u.size === t.size,
  };
}

// 格子下标 → 「第几拍的第几个十六分」，批注里说人话用
export function cellLabel(cell) {
  return `第 ${Math.floor(cell / 4) + 1} 拍第 ${(cell % 4) + 1} 个十六分`;
}
