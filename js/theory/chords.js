// 和弦字典：全项目唯一的和弦定义权威。
// - intervals：相对根音的半音数组（升序），构成音 = 根音 + intervals（纯函数）
// - roles：与 intervals 平行的音级角色标签（1/♭3/5/♭7/9/11/13…）
// - stage：听辨训练难度阶段（1–5），P1 使用
// 构成音一律用 MIDI 编号表示（执行约束：音高换算唯一入口在 theory/notes.js）。

export const CHORD_GROUPS = [
  { id: 'triad',      name: '三和弦' },
  { id: 'sixth',      name: '六和弦' },
  { id: 'seventh',    name: '七和弦' },
  { id: 'ninth',      name: '九和弦' },
  { id: 'eleventh',   name: '十一和弦' },
  { id: 'thirteenth', name: '十三和弦' },
  { id: 'altered',    name: '变化 / 特殊' },
];

// 工厂：保持条目字段一致，避免手写对象漏字段
function T(id, symbol, name, group, stage, intervals, roles, color) {
  return { id, symbol, name, group, stage, intervals, roles, color };
}

export const CHORD_TYPES = [
  // —— 三和弦（7）——
  T('maj',   'maj',        '大三和弦',   'triad',   1, [0, 4, 7],      ['1', '3', '5'],          '明亮、稳定，一切和声语言的基准。'),
  T('m',     'm',          '小三和弦',   'triad',   1, [0, 3, 7],      ['1', '♭3', '5'],         '暗淡、柔和，大三和弦的"阴影版"。'),
  T('dim',   'dim',        '减三和弦',   'triad',   1, [0, 3, 6],      ['1', '♭3', '♭5'],        '收缩、不安定，强烈渴望被解决。'),
  T('aug',   'aug',        '增三和弦',   'triad',   1, [0, 4, 8],      ['1', '3', '♯5'],         '悬浮、扩张，方向感消失的魔法感和弦。'),
  T('sus2',  'sus2',       '挂二和弦',   'triad',   2, [0, 2, 7],      ['1', '2', '5'],          '空灵、开放，悬在空中不落地。'),
  T('sus4',  'sus4',       '挂四和弦',   'triad',   2, [0, 5, 7],      ['1', '4', '5'],          '期待感最强，耳朵一直等 4 度落回 3 度。'),
  T('5',     '5',          '纯五度（强力和弦）', 'triad', 2, [0, 7], ['1', '5'],            '空洞、有力，摇滚吉他的声音。'),

  // —— 六和弦（3）——
  T('6',     '6',          '大六和弦',   'sixth',   2, [0, 4, 7, 9],   ['1', '3', '5', '6'],     '明亮里带一点复古甜味。'),
  T('m6',    'm6',         '小六和弦',   'sixth',   2, [0, 3, 7, 9],   ['1', '♭3', '5', '6'],    '柔和但暗藏张力，爵士小调常客。'),
  T('69',    '6/9',        '六九和弦',   'sixth',   4, [0, 4, 7, 9, 14], ['1', '3', '5', '6', '9'], '明快又时髦，结尾彩蛋感和弦。'),

  // —— 七和弦（8）——
  T('maj7',  'maj7',       '大七和弦',   'seventh', 3, [0, 4, 7, 11],  ['1', '3', '5', '7'],     '漂浮、丝滑，爵士与 City Pop 的标志。'),
  T('7',     '7',          '属七和弦',   'seventh', 3, [0, 4, 7, 10],  ['1', '3', '5', '♭7'],    '天生的"要解决"，向主和弦冲刺的引擎。'),
  T('m7',    'm7',         '小七和弦',   'seventh', 3, [0, 3, 7, 10],  ['1', '♭3', '5', '♭7'],   '松弛、不争不抢的柔和小调。'),
  T('mMaj7', 'mMaj7',      '小大七和弦', 'seventh', 3, [0, 3, 7, 11],  ['1', '♭3', '5', '7'],    '小调的暗 + 大七度的亮，神秘而忧郁。'),
  T('m7b5',  'm7♭5',       '半减七和弦', 'seventh', 3, [0, 3, 6, 10],  ['1', '♭3', '♭5', '♭7'],  '阴郁的暗流，二世系和弦的主力。'),
  T('dim7',  'dim7',       '减七和弦',   'seventh', 3, [0, 3, 6, 9],   ['1', '♭3', '♭5', '♭♭7'], '极度紧张、对称结构，转调连接的万能楔子。'),
  T('7#5',   '7♯5',        '增属七和弦', 'seventh', 5, [0, 4, 8, 10],  ['1', '3', '♯5', '♭7'],   '变化属七的"推背感"，法式印象派常客。'),
  T('7sus4', '7sus4',      '属七挂四',   'seventh', 3, [0, 5, 7, 10],  ['1', '4', '5', '♭7'],    '挂着不解决却已经带属七的暗流。'),

  // —— 九和弦（6）——
  T('add9',  'add9',       '加九和弦',   'ninth',   4, [0, 4, 7, 14],  ['1', '3', '5', '9'],     '现代流行开场的清爽色彩（无七音）。'),
  T('madd9', 'm(add9)',    '小加九和弦', 'ninth',   4, [0, 3, 7, 14],  ['1', '♭3', '5', '9'],    '柔和小调加一点空气感。'),
  T('9',     '9',          '属九和弦',   'ninth',   4, [0, 4, 7, 10, 14], ['1', '3', '5', '♭7', '9'], '流动、放克，比属七更"晃"。'),
  T('maj9',  'maj9',       '大九和弦',   'ninth',   4, [0, 4, 7, 11, 14], ['1', '3', '5', '7', '9'], '华丽又温柔，R&B 抒情曲首选。'),
  T('m9',    'm9',         '小九和弦',   'ninth',   4, [0, 3, 7, 10, 14], ['1', '♭3', '5', '♭7', '9'], '慵懒、氛围感十足的城市夜晚。'),
  T('9sus4', '9sus4',      '九挂四',     'ninth',   4, [0, 5, 7, 10, 14], ['1', '4', '5', '♭7', '9'], '福音/流行里"悬着走"的过门和弦。'),

  // —— 十一和弦（2）——
  T('11',    '11',         '十一和弦',   'eleventh', 5, [0, 4, 7, 10, 14, 17], ['1', '3', '5', '♭7', '9', '11'], '延伸感拉满，爵士横向和声的大楼。'),
  T('m11',   'm11',        '小十一和弦', 'eleventh', 5, [0, 3, 7, 10, 14, 17], ['1', '♭3', '5', '♭7', '9', '11'], '宽阔的暗色氛围，电影感十足。'),

  // —— 十三和弦（4）——
  T('13',    '13',         '十三和弦',   'thirteenth', 5, [0, 4, 7, 10, 14, 21], ['1', '3', '5', '♭7', '9', '13'], '爵士终止式的高级形态，信息量最大。'),
  T('maj13', 'maj13',      '大十三和弦', 'thirteenth', 5, [0, 4, 7, 11, 14, 21], ['1', '3', '5', '7', '9', '13'], '宏大而透亮的收尾。'),
  T('m13',   'm13',        '小十三和弦', 'thirteenth', 5, [0, 3, 7, 10, 14, 21], ['1', '♭3', '5', '♭7', '9', '13'], '深邃的暗色长廊。'),
  T('13sus4','13sus4',     '十三挂四',   'thirteenth', 5, [0, 5, 7, 10, 14, 21], ['1', '4', '5', '♭7', '9', '13'], '一整条悬空链条，福音结束前的"挂"。'),

  // —— 变化 / 特殊（9）——
  T('maj7#11', 'maj7♯11',  '利底亚七和弦', 'altered', 5, [0, 4, 7, 11, 18], ['1', '3', '5', '7', '♯11'], '梦幻、电影升空镜头的标志性声音。'),
  T('7b5',   '7♭5',        '变化属七（降五）', 'altered', 5, [0, 4, 6, 10], ['1', '3', '♭5', '♭7'], '对称、恍惚的属七变体。'),
  T('7b9',   '7♭9',        '变化属七（降九）', 'altered', 5, [0, 4, 7, 10, 13], ['1', '3', '5', '♭7', '♭9'], '戏剧化的紧张，古典小调属七的 Jazz 形态。'),
  T('7#9',   '7♯9',        '变化属七（升九）', 'altered', 5, [0, 4, 7, 10, 15], ['1', '3', '5', '♭7', '♯9'], '蓝调"Electric Ladyland"之声，一暗一亮挤在一起。'),
  T('7b13',  '7♭13',       '变化属七（降十三）', 'altered', 5, [0, 4, 7, 10, 20], ['1', '3', '5', '♭7', '♭13'], '拉丁与波萨诺瓦的辛辣味。'),
  T('7alt',  '7alt',       '全变化属七',   'altered', 5, [0, 4, 8, 10, 15], ['1', '3', '♯5', '♭7', '♯9'], '自由爵士的万花筒（♯9+♯5 变体）。'),
  T('mMaj9', 'mMaj9',      '小大九和弦',   'altered', 5, [0, 3, 7, 11, 14], ['1', '♭3', '5', '7', '9'], '忧郁里透出光泽，电影配乐宠儿。'),
  T('augMaj7', 'aug(maj7)', '增大七和弦',  'altered', 5, [0, 4, 8, 11],  ['1', '3', '♯5', '7'],    '失重、梦境边缘的悬浮感。'),
  T('dimMaj7', 'dim(maj7)', '减大七和弦',  'altered', 5, [0, 3, 6, 11],  ['1', '♭3', '♭5', '7'],   '古典式的诡异与凄美。'),
];

// —— 简谱级数（签名交互的数据层）——
// 相对主音的音级偏移 → 简谱级数记号。习惯法：升号上挂（♯1 ♯4），降号下挂（♭3 ♭6 ♭7）。
const JIANPU_OFFSETS = {
  0: ['1', ''], 1: ['1', '♯'], 2: ['2', ''], 3: ['3', '♭'], 4: ['3', ''], 5: ['4', ''],
  6: ['4', '♯'], 7: ['5', ''], 8: ['6', '♭'], 9: ['6', ''], 10: ['7', '♭'], 11: ['7', ''],
};

export function jianpuDegree(rootPc, keyPc = 0) {
  if (!Number.isInteger(rootPc) || rootPc < 0 || rootPc > 11) throw new Error(`非法根音音级: ${rootPc}`);
  if (!Number.isInteger(keyPc) || keyPc < 0 || keyPc > 11) throw new Error(`非法主音音级: ${keyPc}`);
  const offset = ((rootPc - keyPc) % 12 + 12) % 12;
  const [degree, accidental] = JIANPU_OFFSETS[offset];
  return { degree, accidental, label: accidental + degree };
}

// 展示用音名（与 notes.js 的 NOTE_NAMES 机器名不同：此处面向界面显示）
export const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function getChordById(id) {
  const c = CHORD_TYPES.find((t) => t.id === id);
  if (!c) throw new Error(`未知和弦类型: ${id}`);
  return c;
}

export function chordsByGroup(groupId) {
  return CHORD_TYPES.filter((t) => t.group === groupId);
}

export function chordsByStage(stage) {
  return CHORD_TYPES.filter((t) => t.stage === stage);
}

// —— 声位（查询与练耳共用的唯一规则）——
// 根音锚定在 C3–B3（MIDI 48–59）：rootPc 为 0–11 的音级（0=C），
// 构成音 = 48 + rootPc + interval。最高音 ≤ 48+11+21 = 80（G♯5），不超出采样音域。
// —— 转位：改变的是低音，不是和弦本身 ——
// 原位把根音放最低；第 n 转位把最低的 n 个音各上移一个八度，低音因此落到第三个、第五个……音上。
// 上限收到第三转位：九和弦以上通常只谈「有转位这回事」，再往上堆既不好听也顶到采样上界。
export const INVERSION_NAMES = ['原位', '第一转位', '第二转位', '第三转位'];

export function maxInversion(chord) {
  return Math.min(INVERSION_NAMES.length - 1, chord.intervals.length - 1);
}

export function chordVoicing(rootPc, chord, inversion = 0) {
  if (!Number.isInteger(rootPc) || rootPc < 0 || rootPc > 11) throw new Error(`非法根音音级: ${rootPc}`);
  const inv = Math.max(0, Math.min(maxInversion(chord), inversion));
  const base = 48 + rootPc;
  // 上移之后顺序会变，roles 必须跟着重排，否则「1–3–5」会和实际音高对不上
  const pairs = chord.intervals
    .map((i, k) => ({ midi: base + i + (k < inv ? 12 : 0), role: chord.roles[k], isRoot: i === 0 }))
    .sort((a, b) => a.midi - b.midi);
  return {
    rootPc,
    rootMidi: base,
    bassMidi: pairs[0].midi,
    rootNoteMidi: pairs.find((p) => p.isRoot).midi,
    rootIndex: pairs.findIndex((p) => p.isRoot),
    midis: pairs.map((p) => p.midi),
    roles: pairs.map((p) => p.role),
    inversion: inv,
    inversionName: INVERSION_NAMES[inv],
    isInversion: inv > 0,
  };
}

// 音程公式串（如 "1–3–♯5–♭7"）
export function chordFormula(chord) {
  return chord.roles.join('–');
}

// —— 情绪分类（与结构分组正交的浏览维度）——
// 一个和弦可归属多个情绪；MOOD_INDEX 的每个 id 必须存在于 CHORD_TYPES。
export const CHORD_MOODS = [
  { id: 'bright',    name: '明亮开阔', desc: '大调家族的阳光与清爽' },
  { id: 'dark',      name: '忧郁暗色', desc: '小调与减音符的阴影' },
  { id: 'dreamy',    name: '梦幻悬浮', desc: '七音与增音程的失重感' },
  { id: 'tense',     name: '紧张张力', desc: '渴望被解决的戏剧化声音' },
  { id: 'suspended', name: '悬置期待', desc: '挂着不落地的开放感' },
  { id: 'groove',    name: '慵懒律动', desc: '城市夜晚的松弛与流动' },
  { id: 'power',     name: '力量空洞', desc: '只有根音与五音的摇滚引擎' },
];

export const MOOD_INDEX = {
  bright:    ['maj', '6', '69', 'add9', 'maj9', 'maj13'],
  dark:      ['m', 'm6', 'mMaj7', 'm7b5', 'm9', 'm11', 'm13', 'mMaj9', 'dimMaj7'],
  dreamy:    ['maj7', 'aug', 'sus2', 'augMaj7', 'maj7#11'],
  tense:     ['dim', 'dim7', '7', 'm6', '7b5', '7b9', '7#9', '7b13', '7alt', '7#5'],
  suspended: ['sus4', '7sus4', '9sus4', '13sus4'],
  groove:    ['m7', 'madd9', '9', 'm9', '13', '11', '7'],
  power:     ['5'],
};

// 和弦 id → 其所属情绪（主分类在前）
export function moodsOf(chordId) {
  return CHORD_MOODS.filter((m) => MOOD_INDEX[m.id].includes(chordId));
}

// 情绪 id → 和弦类型列表（按 MOOD_INDEX 顺序，保持主分类在前）
export function chordsOfMood(moodId) {
  return (MOOD_INDEX[moodId] || []).map(getChordById);
}

// —— 调式：七个中古调式，以及它们的调内和弦 ——
// 调式 = 同一批音换个主音视角。级数一律按首调唱名读（多利亚 = 1 2 ♭3 4 5 6 ♭7），
// 所以调性切换器选的主音就是调式的主音，全页级数记号照旧跟着重算。
export const MODES = [
  { id: 'ionian',     name: '伊奥尼亚',   alias: '大调',       intervals: [0, 2, 4, 5, 7, 9, 11],
    character: '一切和声语言的基准，明亮而稳定。' },
  { id: 'dorian',     name: '多利亚',     alias: '♭3 ♭7 小调', intervals: [0, 2, 3, 5, 7, 9, 10],
    character: '小调的暗配上大六度的亮，爵士与凯尔特常客。' },
  { id: 'phrygian',   name: '弗利几亚',   alias: '♭2 小调',    intervals: [0, 1, 3, 5, 7, 8, 10],
    character: '一开口就是 ♭2 的压迫感，西班牙与金属的味道。' },
  { id: 'lydian',     name: '利底亚',     alias: '♯4 大调',    intervals: [0, 2, 4, 6, 7, 9, 11],
    character: '升四度带来失重与开阔，电影升空镜头的标配。' },
  { id: 'mixolydian', name: '混合利底亚', alias: '♭7 大调',    intervals: [0, 2, 4, 5, 7, 9, 10],
    character: '大调骨架配上 ♭7，摇滚与布鲁斯的常态。' },
  { id: 'aeolian',    name: '爱奥利亚',   alias: '自然小调',   intervals: [0, 2, 3, 5, 7, 8, 10],
    character: '最熟悉的小调，忧郁而完整。' },
  { id: 'locrian',    name: '洛克里亚',   alias: '♭2 ♭5 小调', intervals: [0, 1, 3, 5, 6, 8, 10],
    character: '主和弦本身就是减和弦，唯一无法安定的调式。' },
];

export function getModeById(id) {
  const m = MODES.find((x) => x.id === id);
  if (!m) throw new Error(`未知调式: ${id}`);
  return m;
}

// 大调音阶：调式音级的升降号由「与该度大调音的差」决定，而不是套用半音偏移表。
// 弗利几亚的二级音必须是 ♭2（降二级），写成 ♯1 在同一屏里会和学生看到的音阶自相矛盾。
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

// 调式音阶的简谱读法，例如多利亚 → ['1','2','♭3','4','5','6','♭7']
export function modeScaleLabels(modeId) {
  return getModeById(modeId).intervals.map((_, i) => modeDegreeLabel(modeId, i + 1));
}

// 调式第 degree 级（1–7）的简谱记号
export function modeDegreeLabel(modeId, degree) {
  const iv = getModeById(modeId).intervals[degree - 1];
  const diff = iv - MAJOR_SCALE[degree - 1];
  const accidental = diff === 0 ? '' : (diff > 0 ? '♯' : '♭');
  return accidental + String(degree);
}

// 调内第 degree 级（1–7）的和弦：按三度叠置在音阶上取音，再回和弦字典里认领类型。
// 于是「调式里的和弦」与「查询手册里的和弦」永远是同一份定义，不存在第二套数据。
export function modeChord(modeId, degree, { sevenths = false } = {}) {
  const scale = getModeById(modeId).intervals;
  const size = sevenths ? 4 : 3;
  const picked = [];
  for (let k = 0; k < size; k++) {
    const idx = degree - 1 + k * 2;
    picked.push(scale[idx % 7] + 12 * Math.floor(idx / 7));
  }
  const intervals = picked.map((v) => v - picked[0]);
  const type = CHORD_TYPES.find((t) => t.intervals.length === intervals.length
    && t.intervals.every((v, i) => v === intervals[i]));
  return { modeId, degree, sevenths, intervals, type };
}
