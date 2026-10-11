// 和弦进行库：以"调式主音 + 音级偏移"定义，任意移调。
// steps: [{ root: 相对主音的半音偏移, type: 和弦类型 id, beats: 时值(拍) }]
import { getChordById, chordVoicing, PITCH_NAMES, jianpuDegree } from './theory/chords.js';

const MAJOR_ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
// 小调以自然小调音级为基准（i ii° III iv v VI VII），非自然音级加变音记号
const MINOR_ROMAN = ['i', '♭II', 'ii', 'III', 'IV', 'iv', '♯iv', 'v', 'VI', '♯VI', 'VII', '♯VII'];

// 小写罗马 = 该音级上叠小三度类和弦（m/m7/dim 系）；其余大写（含属七/大系）
export function romanFor(offset, typeId, mode = 'major') {
  const sym = getChordById(typeId).symbol;
  const minorish = (sym[0] === 'm' && sym[1] !== 'a') || sym.startsWith('dim');
  const base = (mode === 'minor' ? MINOR_ROMAN : MAJOR_ROMAN)[offset];
  return minorish ? base.toLowerCase() : base.toUpperCase();
}

// 进行按用途分类：进行页要按类别成组读，训练轨也要按类别出题
export const PROG_CATEGORIES = [
  { id: 'pop',   name: '流行' },
  { id: 'minor', name: '小调与情绪' },
  { id: 'jazz',  name: '爵士' },
  { id: 'mode',  name: '调式' },
  { id: 'blues', name: '布鲁斯' },
];

// scale 决定简谱级数怎么拼写。就近取音级是不行的：利底亚要 ♯4、混合利底亚要 ♭7，
// 两个正好在「就近」上打平、偏好相反，所以必须按调式音阶的下标取。
const SCALES = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};
const MAJOR_SCALE = SCALES.major;

function P(id, category, name, desc, mode, steps, scale) {
  return { id, category, name, desc, mode, scale: scale || mode, steps };
}

export const PROGRESSIONS = [
  P('pop', 'pop', '流行万用 I–V–vi–IV', '无数流行歌的和声骨架，情绪推进最顺滑。', 'major', [
    { root: 0, type: 'maj', beats: 4 }, { root: 7, type: 'maj', beats: 4 },
    { root: 9, type: 'm', beats: 4 }, { root: 5, type: 'maj', beats: 4 },
  ]),
  P('fifties', 'pop', '50 年代经典 I–vi–IV–V', '复古甜味的多莉羊循环。', 'major', [
    { root: 0, type: 'maj', beats: 4 }, { root: 9, type: 'm', beats: 4 },
    { root: 5, type: 'maj', beats: 4 }, { root: 7, type: 'maj', beats: 4 },
  ]),
  P('cn-4536251', 'pop', '华语流行 4536251', '华语抒情歌最常走的一条下行级数，从 IV 一路滑回 I。', 'major', [
    { root: 5, type: 'maj', beats: 4 }, { root: 7, type: 'maj', beats: 4 },
    { root: 4, type: 'm', beats: 4 }, { root: 9, type: 'm', beats: 4 },
    { root: 2, type: 'm', beats: 4 }, { root: 7, type: 'maj', beats: 4 },
    { root: 0, type: 'maj', beats: 4 },
  ]),
  P('pop-6415', 'pop', '卡农式 6415 vi–IV–I–V', '大调骨架套上小调起头的颜色，副歌推升常用。', 'major', [
    { root: 9, type: 'm', beats: 4 }, { root: 5, type: 'maj', beats: 4 },
    { root: 0, type: 'maj', beats: 4 }, { root: 7, type: 'maj', beats: 4 },
  ]),
  P('jazz-ii-v-i', 'jazz', '爵士终止 ii–V–I', '爵士和声的最小完整单元，标准终止式。', 'major', [
    { root: 2, type: 'm7', beats: 4 }, { root: 7, type: '7', beats: 4 },
    { root: 0, type: 'maj7', beats: 8 },
  ]),
  P('circle', 'jazz', '圈运动进 I–vi–ii–V', '五度圈驱动的经典连接，副歌前奏常客。', 'major', [
    { root: 0, type: 'maj7', beats: 4 }, { root: 9, type: 'm7', beats: 4 },
    { root: 2, type: 'm7', beats: 4 }, { root: 7, type: '7', beats: 4 },
  ]),
  P('jazz-turnaround', 'jazz', '转位圈 iii–vi–ii–V', '把圈运动进从三级起跳，尾声转圈用。', 'major', [
    { root: 4, type: 'm7', beats: 4 }, { root: 9, type: 'm7', beats: 4 },
    { root: 2, type: 'm7', beats: 4 }, { root: 7, type: '7', beats: 4 },
  ]),
  P('canon', 'pop', '卡农进行 I–V–vi–iii–IV–I–IV–V', '帕赫贝尔《卡农》和声骨架。', 'major', [
    { root: 0, type: 'maj', beats: 4 }, { root: 7, type: 'maj', beats: 4 },
    { root: 9, type: 'm', beats: 4 }, { root: 4, type: 'm', beats: 4 },
    { root: 5, type: 'maj', beats: 4 }, { root: 0, type: 'maj', beats: 4 },
    { root: 5, type: 'maj', beats: 4 }, { root: 7, type: 'maj', beats: 4 },
  ]),
  P('blues12', 'blues', '12 小节布鲁斯 I7–IV7–V7', '布鲁斯与早期摇滚的十二小节框架。', 'major', [
    { root: 0, type: '7', beats: 4 }, { root: 5, type: '7', beats: 4 },
    { root: 0, type: '7', beats: 4 }, { root: 0, type: '7', beats: 4 },
    { root: 5, type: '7', beats: 4 }, { root: 5, type: '7', beats: 4 },
    { root: 0, type: '7', beats: 4 }, { root: 0, type: '7', beats: 4 },
    { root: 7, type: '7', beats: 4 }, { root: 5, type: '7', beats: 4 },
    { root: 0, type: '7', beats: 4 }, { root: 7, type: '7', beats: 4 },
  ]),
  P('minor-pop', 'minor', '小调流行 i–VI–III–VII', '忧郁向流行/摇滚的常用循环。', 'minor', [
    { root: 0, type: 'm', beats: 4 }, { root: 8, type: 'maj', beats: 4 },
    { root: 3, type: 'maj', beats: 4 }, { root: 10, type: 'maj', beats: 4 },
  ]),
  P('sad-minor', 'minor', '小调终止 i–iv–V7', '悲剧收束的最小单元，和声小调风味。', 'minor', [
    { root: 0, type: 'm', beats: 4 }, { root: 5, type: 'm', beats: 4 },
    { root: 7, type: '7', beats: 8 },
  ]),
  P('andalusian', 'minor', '安达卢西亚终止 i–VII–VI–V7', '弗拉门戈与西班牙风的下行四音，最浓的异域感。', 'minor', [
    { root: 0, type: 'm', beats: 4 }, { root: 10, type: 'maj', beats: 4 },
    { root: 8, type: 'maj', beats: 4 }, { root: 7, type: '7', beats: 4 },
  ]),
  P('mode-dorian', 'mode', '多利亚 i–IV–VII', '大六度带来的那点亮，是它和自然小调的全部区别。', 'minor', [
    { root: 0, type: 'm7', beats: 4 }, { root: 5, type: '7', beats: 4 },
    { root: 10, type: 'maj7', beats: 8 },
  ], 'dorian'),
  P('mode-phrygian', 'mode', '弗利几亚 i–II–i', '降二级一压下来，西班牙与金属的味道就出来了。', 'minor', [
    { root: 0, type: 'm', beats: 4 }, { root: 1, type: 'maj', beats: 4 },
    { root: 0, type: 'm', beats: 8 },
  ], 'phrygian'),
  P('mode-lydian', 'mode', '利底亚 I–II–I', '升四度让二级变成大三和弦，失重与开阔的来源。', 'major', [
    { root: 0, type: 'maj7', beats: 4 }, { root: 2, type: '7', beats: 4 },
    { root: 0, type: 'maj7', beats: 8 },
  ], 'lydian'),
  P('mode-mixolydian', 'mode', '混合利底亚 I–VII–IV', '降七级的大三和弦，摇滚与布鲁斯的常态。', 'major', [
    { root: 0, type: 'maj', beats: 4 }, { root: 10, type: 'maj', beats: 4 },
    { root: 5, type: 'maj', beats: 8 },
  ], 'mixolydian'),
];

export function getProgressionById(id) {
  const p = PROGRESSIONS.find((x) => x.id === id);
  if (!p) throw new Error('未知进行: ' + id);
  return p;
}

export function progressionsByCategory(categoryId) {
  return PROGRESSIONS.filter((p) => p.category === categoryId);
}

export function categoryName(categoryId) {
  const c = PROG_CATEGORIES.find((x) => x.id === categoryId);
  return c ? c.name : categoryId;
}

// 罗马数字序列（训练选项与批注都用它当「身份证」）
export function progressionRomans(prog) {
  return prog.steps.map((s) => romanFor(s.root, s.type, prog.mode));
}

// 进行里的音要按**调式拼写**读，不能套用半音偏移表：
// 弗利几亚的二级音是降二级（♭2），写成 ♯1 会和学生看到的调式音阶自相矛盾。
// 规则与调式音阶一致——与大调音的差决定升降号；等距时偏升号（利底亚的 ♯4 靠这条胜出）。
// 借来的变化音级（不在声明音阶里）退回通用规则：与大调音的差决定升降号，等距时偏升号
export function degreeLabelForOffset(offset) {
  const o = ((offset % 12) + 12) % 12;
  let best = 0;
  let bestDiff = 99;
  for (let i = 0; i < MAJOR_SCALE.length; i++) {
    let d = o - MAJOR_SCALE[i];
    if (d > 6) d -= 12;
    if (d < -6) d += 12;
    if (Math.abs(d) < Math.abs(bestDiff) || (Math.abs(d) === Math.abs(bestDiff) && d > bestDiff)) {
      best = i;
      bestDiff = d;
    }
  }
  const accidental = bestDiff === 0 ? '' : (bestDiff > 0 ? '♯' : '♭');
  return accidental + String(best + 1);
}

function labelInScale(scaleName, offset) {
  const scale = SCALES[scaleName] || SCALES.major;
  const o = ((offset % 12) + 12) % 12;
  const idx = scale.indexOf(o);
  if (idx < 0) return degreeLabelForOffset(o);
  const diff = o - MAJOR_SCALE[idx];
  return (diff === 0 ? '' : diff > 0 ? '♯' : '♭') + String(idx + 1);
}

// 简谱级数序列：罗马数字是功能和声的说法，简谱级数是这个应用的说法，两个都给
export function progressionDegreeLabels(prog) {
  return prog.steps.map((s) => labelInScale(prog.scale, s.root));
}

// 展开为可播放/可导出的数据：主音 tonicPc（0–11）
// 每步: { roman, label, rootPc, chord, startBeats, durBeats, midis }
export function progressionNotes(prog, tonicPc) {
  if (!Number.isInteger(tonicPc) || tonicPc < 0 || tonicPc > 11) throw new Error('非法主音: ' + tonicPc);
  let t = 0;
  const steps = prog.steps.map((s) => {
    const chord = getChordById(s.type);
    const rootPc = (tonicPc + s.root) % 12;
    const v = chordVoicing(rootPc, chord);
    const step = {
      roman: romanFor(s.root, s.type, prog.mode),
      label: PITCH_NAMES[rootPc] + chord.symbol,
      rootPc, chord, midis: v.midis, roles: v.roles,
      startBeats: t, durBeats: s.beats,
    };
    t += s.beats;
    return step;
  });
  return { steps, totalBeats: t };
}

// 展开为音符平面列表（播放/导出共用）：每音稍微留断音间隙
export function progressionFlatNotes(progData, gapBeats = 0.05) {
  const notes = [];
  for (const st of progData.steps) {
    for (const m of st.midis) {
      notes.push({ midi: m, startBeats: st.startBeats, durBeats: st.durBeats - gapBeats });
    }
  }
  return notes;
}
