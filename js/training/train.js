// 听辨训练核心逻辑（纯函数，Node 可测）：出题、错题队列（SRS）、自适应难度。
// 所有阈值来自 config.training，业务侧不散落硬编码（执行约束 8）。
import { chordsByStage, getChordById } from '../theory/chords.js';
import { RELATION_IDS, getIntervalById } from '../theory/intervals.js';
import { CELLS_4, getPatternById } from '../theory/rhythm.js';
import { PROGRESSIONS, progressionRomans, progressionDegreeLabels } from '../progressions.js';
import { maxInversion, INVERSION_NAMES } from '../theory/chords.js';
import { CONFIG } from '../config.js';

// 类型是否到期需要复习（从未练过 = 立即到期）
export function isDue(rec, now) {
  if (!rec || rec.seen === 0) return true;
  return rec.dueAt <= now;
}

// —— 和弦轨第 6 阶段：转位 ——
// 听一个和弦，判断低音站在哪个音上。和弦类型只从常见的一批里挑，
// 干扰项就是同一个和弦的其他转位——所以答对说明听的是低音，不是和弦色彩。
export const INVERSION_STAGE = 6;

export const INVERSION_ITEMS = [
  { id: 'inv:root',   symbol: '原位',     name: '根音在最低' },
  { id: 'inv:first',  symbol: '第一转位', name: '三音在最低' },
  { id: 'inv:second', symbol: '第二转位', name: '五音在最低' },
  { id: 'inv:third',  symbol: '第三转位', name: '七音在最低' },
];

const INVERSION_IDS = INVERSION_ITEMS.map((x) => x.id);
const INVERSION_CHORD_POOL = ['maj', 'm', 'dim', 'aug', 'maj7', '7', 'm7', 'm7b5', 'dim7'];

export function getInversionItem(id) {
  const it = INVERSION_ITEMS.find((x) => x.id === id);
  if (!it) throw new Error(`未知转位项: ${id}`);
  return it;
}

function pickInversionQuestion({ srs, level, now, rng }) {
  const chordId = INVERSION_CHORD_POOL[Math.floor(rng() * INVERSION_CHORD_POOL.length)];
  const chord = getChordById(chordId);
  const valid = INVERSION_IDS.slice(0, maxInversion(chord) + 1);
  const { targetId, fromReviewQueue } = pickTarget(valid, srs, now, rng);
  return {
    kind: 'inversion', stage: INVERSION_STAGE, level: clampLevel(level),
    targetId, fromReviewQueue,
    rootPc: Math.floor(rng() * 12),
    typeId: chordId,
    inversion: valid.indexOf(targetId),
    optionIds: shuffle(valid, rng),
    correctOptionId: targetId,
    prompt: '听这个和弦，低音站在哪个音上？',
  };
}

// 出题：到期题型优先（错题队列），否则全阶段池随机；
// 干扰项优先同结构组（听感更接近，区分价值更高）。
export function pickQuestion({ stage, srs, level, now = Date.now(), rng = Math.random }) {
  if (stage === INVERSION_STAGE) return pickInversionQuestion({ srs, level, now, rng });
  const pool = chordsByStage(stage);
  if (pool.length === 0) throw new Error('阶段无题型: ' + stage);
  const due = pool.filter((t) => isDue(srs[t.id], now));
  const candidates = due.length > 0 ? due : pool;
  const target = candidates[Math.floor(rng() * candidates.length)];
  const optCount = CONFIG.training.optionsByLevel[level];
  const distractors = pickDistractors(target.id, pool, optCount - 1, rng);
  return {
    stage, level,
    targetId: target.id,
    rootPc: Math.floor(rng() * 12),
    optionIds: shuffle([target.id, ...distractors], rng),
    fromReviewQueue: due.length > 0,
  };
}

function pickDistractors(targetId, pool, n, rng) {
  const target = pool.find((t) => t.id === targetId);
  const others = pool.filter((t) => t.id !== targetId);
  const sameGroup = shuffle(others.filter((t) => t.group === target.group), rng);
  const crossGroup = shuffle(others.filter((t) => t.group !== target.group), rng);
  return [...sameGroup, ...crossGroup].slice(0, n).map((t) => t.id);
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 答题后更新 SRS 状态：答对间隔翻倍（封顶），答错间隔归零（立即重练）
export function applySrs(rec, correct, now = Date.now()) {
  const t = CONFIG.training.srs;
  const r = rec
    ? { ...rec }
    : { typeId: null, seen: 0, correct: 0, streakRight: 0, streakWrong: 0, intervalMs: 0, dueAt: 0, lastSeen: 0 };
  r.seen += 1;
  r.lastSeen = now;
  if (correct) {
    r.correct += 1;
    r.streakRight += 1;
    r.streakWrong = 0;
    r.intervalMs = r.intervalMs === 0 ? t.baseIntervalMs : Math.min(r.intervalMs * t.growth, t.maxIntervalMs);
  } else {
    r.streakWrong += 1;
    r.streakRight = 0;
    r.intervalMs = t.wrongResetMs;
  }
  r.dueAt = now + r.intervalMs;
  return r;
}

// 自适应难度：连对 upStreak 升、连错 downStreak 降；数据不足不调整。
// stageAnswers: [{ correct: boolean }]（按时间升序，仅当前阶段）
export function adjustLevel(stageAnswers, currentLevel) {
  const c = CONFIG.training;
  if (stageAnswers.length < c.minAnswersForAdjust) {
    return { level: currentLevel, reason: `数据不足（${stageAnswers.length}/${c.minAnswersForAdjust}）` };
  }
  const last = stageAnswers[stageAnswers.length - 1].correct;
  let streak = 0;
  for (let i = stageAnswers.length - 1; i >= 0; i--) {
    if (stageAnswers[i].correct === last) streak++; else break;
  }
  if (last && streak >= c.upStreak && currentLevel < c.levels.max) {
    return { level: currentLevel + 1, reason: `连对 ${streak} 题，升级` };
  }
  if (!last && streak >= c.downStreak && currentLevel > c.levels.min) {
    return { level: currentLevel - 1, reason: `连错 ${streak} 题，降级` };
  }
  return { level: currentLevel, reason: '保持' };
}

// 弱项判定：正确率低于阈值且练习次数达标
export function isWeak(rec) {
  const c = CONFIG.training;
  return rec && rec.seen >= c.weakMinSeen && (rec.correct / rec.seen) < c.weakThreshold;
}

// 今日已练题数（answers 流水按本地零点过滤）
export function countToday(answers, now = Date.now()) {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return answers.filter((a) => a.ts >= midnight).length;
}

// ---------- 音程轨 ----------
// 与和弦轨共用同一套 SRS 记录、难度升降和答题流水，只是出题器不同：
// 一阶段只判方向（不出现任何术语），二阶段才给音程名。

function clampLevel(level) {
  const l = CONFIG.training.levels;
  return Math.max(l.min, Math.min(l.max, level));
}

// 到期优先，全到期时取全部；与和弦轨同一策略
function pickTarget(ids, srs, now, rng) {
  const due = ids.filter((id) => isDue(srs[id], now));
  const pool = due.length > 0 ? due : ids;
  return { targetId: pool[Math.floor(rng() * pool.length)], fromReviewQueue: due.length > 0 };
}

// 某个阶段里所有可能出现的训练项 id（弱项列表与阶段标签用）
export function intervalStageItems(stage) {
  if (stage <= 1) return [...RELATION_IDS];
  return [...CONFIG.training.intervals.namesByLevel[CONFIG.training.levels.max]];
}

export function pickIntervalQuestion({ stage, srs, level, now = Date.now(), rng = Math.random }) {
  const cfg = CONFIG.training.intervals;
  const lv = clampLevel(level);
  const span = cfg.highMidi - cfg.lowMidi;

  if (stage <= 1) {
    // 一阶段：第二个音比第一个音 更高 / 更低 / 相同
    const { targetId, fromReviewQueue } = pickTarget(RELATION_IDS, srs, now, rng);
    const [minGap, maxGap] = cfg.relationGapByLevel[lv];
    const gap = targetId === 'rel:same' ? 0 : minGap + Math.floor(rng() * (maxGap - minGap + 1));
    const base = cfg.lowMidi + Math.floor(rng() * (span - gap + 1));
    const ascending = targetId !== 'rel:down';
    return {
      kind: 'interval', stage: 1, level: lv, targetId, fromReviewQueue,
      firstMidi: ascending ? base : base + gap,
      secondMidi: ascending ? base + gap : base,
      semitones: gap,
      ascending,
      optionIds: shuffle(RELATION_IDS, rng),
      prompt: '第二个音比第一个音……',
    };
  }

  // 二阶段：这两个音构成什么音程（方向随机，名称与方向无关）
  const candidates = cfg.namesByLevel[lv];
  const { targetId, fromReviewQueue } = pickTarget(candidates, srs, now, rng);
  const interval = getIntervalById(targetId);
  const optCount = Math.min(CONFIG.training.optionsByLevel[lv], candidates.length);
  const distractors = shuffle(candidates.filter((id) => id !== targetId), rng).slice(0, optCount - 1);
  const base = cfg.lowMidi + Math.floor(rng() * (span - interval.semitones + 1));
  const ascending = rng() < 0.5;
  return {
    kind: 'interval', stage: 2, level: lv, targetId, fromReviewQueue,
    firstMidi: ascending ? base : base + interval.semitones,
    secondMidi: ascending ? base + interval.semitones : base,
    semitones: interval.semitones,
    ascending,
    optionIds: shuffle([targetId, ...distractors], rng),
    prompt: '这两个音构成什么音程？',
  };
}

// ---------- 简谱轨 ----------
// 记号本身没有对错，所以这一轨考「听 → 认简谱」：给若干简谱行，选听对的那个。
// 一次只动一个维度——一阶段音高变、节奏不动；二阶段节奏变、音高不动。
// 干扰项因此都是有教学意义的错法，不是随机噪声，答错也知道错在哪个特征上。

// 可训练的技能（不是具体旋律）：SRS 记的是技能，弱项列表才有意义
export const JIANPU_SKILLS = {
  1: [
    { id: 'jp:step',   symbol: '级数走向', name: '数字往上还是往下' },
    { id: 'jp:octave', symbol: '八度点',   name: '点在数字上面还是下面' },
  ],
  2: [
    { id: 'jp:eighth', symbol: '八分对',   name: '两个八分合起来才是一拍' },
    { id: 'jp:dotted', symbol: '附点',     name: '附点吃掉后面那个音的一半' },
    { id: 'jp:rest',   symbol: '休止',     name: '休止符 0 同样占一拍' },
  ],
};

// 节奏型：每条都正好 4 拍、4 个位置，这样换节奏型时音高序列可以原样保留
const JP_CELLS = CELLS_4;   // 节奏型库搬到了 theory/rhythm.js，这里只借用「四位型」那一组

const JP_CELL_BY_SKILL = {
  'jp:eighth': ['paired', 'midpair'],
  'jp:dotted': ['dotted'],
  'jp:rest':   ['rest'],
};

export function jianpuStageItems(stage) {
  return JIANPU_SKILLS[stage <= 1 ? 1 : 2].map((s) => ({ ...s }));
}

function jpWalk(len, rng, octaveChance) {
  const steps = [];
  let degree = 1 + Math.floor(rng() * 5);   // 起音落在 1–5，避免一上来就顶到 7
  for (let i = 0; i < len; i++) {
    if (i > 0) {
      degree = Math.max(1, Math.min(7, degree + [-2, -1, -1, 1, 1, 2][Math.floor(rng() * 6)]));
    }
    steps.push({
      degree,
      octave: rng() < octaveChance ? 1 : 0,
      dur: 1,
      rest: false,
    });
  }
  return steps;
}

function applyCell(pitches, cell) {
  return pitches.map((p, i) => ({
    degree: p.degree,
    octave: p.octave,
    dur: cell.parts[i],
    rest: cell.restAt === i,
  }));
}

// 音高干扰：把两个相邻音级对调 —— 走向变了，节奏一模一样
function jpSwapAdjacent(steps, rng) {
  const out = steps.map((s) => ({ ...s }));
  const i = Math.floor(rng() * (out.length - 1));
  [out[i].degree, out[i + 1].degree] = [out[i + 1].degree, out[i].degree];
  return out;
}

// 音高干扰：把某一拍挪一级 —— 只是「一个音不一样」，比对调更细
function jpShiftDegree(steps, rng) {
  const out = steps.map((s) => ({ ...s }));
  const i = Math.floor(rng() * out.length);
  out[i].degree = Math.max(1, Math.min(7, out[i].degree + (rng() < 0.5 ? -1 : 1)));
  return out;
}

// 八度干扰：给某一拍加上或去掉高八度点
function jpShiftOctave(steps, rng) {
  const out = steps.map((s) => ({ ...s }));
  const i = Math.floor(rng() * out.length);
  out[i].octave = out[i].octave ? 0 : 1;
  return out;
}

function jpDistinct(base, maker, rng, wants = 3) {
  const seen = new Set([JSON.stringify(base)]);
  const out = [];
  for (let guard = 0; guard < 40 && out.length < wants; guard++) {
    const cand = maker(base, rng);
    const key = JSON.stringify(cand);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cand);
  }
  return out;
}

export function pickJianpuQuestion({ stage, srs, level, now = Date.now(), rng = Math.random }) {
  const lv = clampLevel(level);
  const cfg = CONFIG.training.jianpu;
  const skillIds = JIANPU_SKILLS[stage <= 1 ? 1 : 2].map((s) => s.id);
  const { targetId, fromReviewQueue } = pickTarget(skillIds, srs, now, rng);

  if (stage <= 1) {
    const octaveChance = targetId === 'jp:octave' ? 0.65 : cfg.octaveChance * 0.5;
    const target = jpWalk(4, rng, octaveChance);
    const maker = targetId === 'jp:octave'
      ? (b, r) => jpShiftOctave(b, r)
      : (b, r) => (r() < 0.5 ? jpSwapAdjacent(b, r) : jpShiftDegree(b, r));
    // 干扰项数量跟难度走：L1 四选一，L3 六选一，不能少给
    const wrong = jpDistinct(target, maker, rng, CONFIG.training.optionsByLevel[lv] - 1);
    const opts = shuffle([{ steps: target, ok: true }, ...wrong.map((w) => ({ steps: w, ok: false }))], rng);
    return {
      kind: 'jianpu', stage: 1, level: lv, targetId, fromReviewQueue,
      target,
      optionIds: opts.map((_, i) => `jp-opt-${i}`),
      correctOptionId: `jp-opt-${opts.findIndex((o) => o.ok)}`,
      options: opts.map((o, i) => ({ id: `jp-opt-${i}`, steps: o.steps })),
      prompt: '听一遍，选出你听到的简谱',
    };
  }

  // 二阶段：先把音高定下来，再换节奏型——干扰项与正确答案音高完全相同，只有时值不同
  const pitches = jpWalk(4, rng, 0.15);
  const preferred = JP_CELL_BY_SKILL[targetId] || ['even'];
  const cellId = preferred[Math.floor(rng() * preferred.length)];
  const cell = JP_CELLS.find((c) => c.id === cellId);
  const target = applyCell(pitches, cell);
  const otherCells = shuffle(JP_CELLS.filter((c) => c.id !== cellId), rng)
    .slice(0, Math.min(CONFIG.training.optionsByLevel[lv], JP_CELLS.length) - 1);
  const opts = shuffle(
    [{ steps: target, ok: true }, ...otherCells.map((c) => ({ steps: applyCell(pitches, c), ok: false }))],
    rng,
  );
  return {
    kind: 'jianpu', stage: 2, level: lv, targetId, fromReviewQueue,
    target, cell: cell.symbol,
    optionIds: opts.map((_, i) => `jp-opt-${i}`),
    correctOptionId: `jp-opt-${opts.findIndex((o) => o.ok)}`,
    options: opts.map((o, i) => ({ id: `jp-opt-${i}`, steps: o.steps })),
    prompt: '音高都一样，听的是节奏',
  };
}

// ---------- 旋律重建轨 ----------
// 「听 → 看 → 做」里最后那一步：听完一小节，自己在卷帘上把音符放回去。
// 出题只给「目标」，判卷交给 jianpu.diffMelody（三维：音高 / 起点 / 时值）。

export const MELODY_SKILLS = {
  1: [
    { id: 'mel:step', symbol: '级进', name: '相邻音级上下走动' },
    { id: 'mel:leap', symbol: '跳进', name: '隔开一级以上的跳' },
  ],
  2: [
    { id: 'mel:eighth', symbol: '八分', name: '两个八分合起来是一拍' },
    { id: 'mel:dotted', symbol: '附点', name: '附点吃掉后面那个音的一半' },
  ],
};

export function melodyStageItems(stage) {
  return MELODY_SKILLS[stage <= 1 ? 1 : 2].map((s) => ({ ...s }));
}

// 音高走向：level 越高，步幅越小、跳进越少，越难靠轮廓猜
function melodyDegrees(len, rng, style) {
  const out = [];
  let degree = 1 + Math.floor(rng() * 5);
  for (let i = 0; i < len; i++) {
    if (i > 0) {
      const big = style === 'leap' && rng() < 0.7;
      const pool = big ? [-4, -3, 3, 4] : [-2, -1, -1, 1, 1, 2];
      degree = Math.max(1, Math.min(7, degree + pool[Math.floor(rng() * pool.length)]));
    }
    out.push(degree);
  }
  return out;
}

export function pickMelodyQuestion({ stage, srs, level, now = Date.now(), rng = Math.random }) {
  const lv = clampLevel(level);
  const skillIds = MELODY_SKILLS[stage <= 1 ? 1 : 2].map((s) => s.id);
  const { targetId, fromReviewQueue } = pickTarget(skillIds, srs, now, rng);

  if (stage <= 1) {
    const style = targetId === 'mel:leap' ? 'leap' : 'step';
    const degrees = melodyDegrees(4, rng, style);
    return {
      kind: 'melody', stage: 1, level: lv, targetId, fromReviewQueue,
      steps: degrees.map((d) => ({ degree: d, octave: 0, dur: 1, rest: false })),
      cell: '四个四分',
      prompt: '听一小节，在卷帘上把四个音放回去',
    };
  }

  // 二阶段：音高简单一些，难点在节奏；目标与作答都吸附到半拍网格
  const degrees = melodyDegrees(4, rng, 'step');
  const preferred = targetId === 'mel:dotted' ? ['dotted'] : ['paired', 'midpair'];
  const cellId = preferred[Math.floor(rng() * preferred.length)];
  const cell = JP_CELLS.find((c) => c.id === cellId);
  return {
    kind: 'melody', stage: 2, level: lv, targetId, fromReviewQueue,
    steps: applyCell(degrees.map((d) => ({ degree: d, octave: 0 })), cell),
    cell: cell.symbol,
    prompt: '音高简单，难在节奏；把时值也还原出来',
  };
}

// ---------- 节奏轨 ----------
// 纯节奏：全曲同一个音高（第一拍高一档做强弱参照），音高不承载信息。
// 作答方式是「点节奏网格」——把听到的起音位置在十六分格上点出来。

export const RHYTHM_SKILLS = {
  1: [
    { id: 'rq:basic', symbol: '基本型', name: '四分骨架与八分连走' },
    { id: 'rq:rest',  symbol: '休止',   name: '某一拍整拍留空' },
  ],
  2: [
    { id: 'rq:sixteenth', symbol: '十六分', name: '一拍四连' },
    { id: 'rq:sync',      symbol: '切分',   name: '重音从强拍挪到弱拍上' },
  ],
};

// 每个技能可以出哪几条型；一个技能一条型时，「出题」就是直给
const SKILL_PATTERNS = {
  'rq:basic': ['rq:quarter', 'rq:eighths', 'rq:dotted'],
  'rq:rest': ['rq:rest'],
  'rq:sixteenth': ['rq:sixteenth'],
  'rq:sync': ['rq:sync'],
};

export function rhythmStageItems(stage) {
  return RHYTHM_SKILLS[stage <= 1 ? 1 : 2].map((s) => ({ ...s }));
}

export function pickRhythmQuestion({ stage, srs, level, now = Date.now(), rng = Math.random }) {
  const skillIds = RHYTHM_SKILLS[stage <= 1 ? 1 : 2].map((s) => s.id);
  const { targetId, fromReviewQueue } = pickTarget(skillIds, srs, now, rng);
  const pool = SKILL_PATTERNS[targetId] || ['rq:quarter'];
  const pattern = getPatternById(pool[Math.floor(rng() * pool.length)]);
  return {
    kind: 'rhythm', stage, level: clampLevel(level), targetId, fromReviewQueue,
    pattern, patternId: pattern.id,
    prompt: '听一小节鼓点，在网格上把起音点出来',
  };
}

// ---------- 进行轨 ----------
// 听一整条进行 → 选出它的级数序列。选项之间只差「级数的走法」，
// 所以答对说明真的听出了功能关系，而不是听出「有几个和弦」。

export const PROG_SKILLS = {
  1: [
    { id: 'pg:pop',   symbol: '流行循环', name: 'I–V–vi–IV 这一类大调骨架' },
    { id: 'pg:minor', symbol: '小调循环', name: 'i–VI–III–VII 这一类小调骨架' },
  ],
  2: [
    { id: 'pg:jazz', symbol: '爵士终止', name: 'ii–V–I 与圈运动进' },
    { id: 'pg:mode', symbol: '调式进行', name: '多利亚 / 弗利几亚 / 利底亚的特征走法' },
  ],
};

const PROG_SKILL_POOL = {
  'pg:pop':   ['pop', 'fifties', 'pop-6415', 'canon', 'cn-4536251'],
  'pg:minor': ['minor-pop', 'sad-minor', 'andalusian'],
  'pg:jazz':  ['jazz-ii-v-i', 'circle', 'jazz-turnaround'],
  'pg:mode':  ['mode-dorian', 'mode-phrygian', 'mode-lydian', 'mode-mixolydian'],
};

export function progStageItems(stage) {
  return PROG_SKILLS[stage <= 1 ? 1 : 2].map((s) => ({ ...s }));
}

// 进行页「练这条进行」用：下一题直接出指定的那条，而不是从池子里随机抽
let forcedProgId = null;
export function forceNextProgression(id) { forcedProgId = id; }

// 某条进行属于哪个阶段的技能池（进行页「练这条」要跳到对应阶段）
export function stageForProgression(id) {
  const owner = Object.keys(PROG_SKILL_POOL).find((k) => PROG_SKILL_POOL[k].includes(id));
  if (!owner) return 1;
  return PROG_SKILLS[1].some((s) => s.id === owner) ? 1 : 2;
}

export function pickProgQuestion({ stage, srs, level, now = Date.now(), rng = Math.random }) {
  const lv = clampLevel(level);
  const skillIds = PROG_SKILLS[stage <= 1 ? 1 : 2].map((s) => s.id);
  const { targetId, fromReviewQueue } = pickTarget(skillIds, srs, now, rng);
  const pool = (PROG_SKILL_POOL[targetId] || []).map((id) => PROGRESSIONS.find((p) => p.id === id));
  const forced = forcedProgId ? PROGRESSIONS.find((p) => p.id === forcedProgId) : null;
  forcedProgId = null;
  const target = forced || pool[Math.floor(rng() * pool.length)];
  // 被指定的这条可能不属于刚抽到的技能，SRS 要落在它真正归属的技能上
  const owner = Object.keys(PROG_SKILL_POOL).find((k) => PROG_SKILL_POOL[k].includes(target.id));

  // 干扰项优先挑「和弦数相同」的进行：长度一样，差的就是级数走法本身
  const sameLen = PROGRESSIONS.filter((p) => p.id !== target.id && p.steps.length === target.steps.length);
  const rest = PROGRESSIONS.filter((p) => p.id !== target.id && p.steps.length !== target.steps.length);
  const want = Math.min(CONFIG.training.optionsByLevel[lv], PROGRESSIONS.length) - 1;
  const others = [...shuffle(sameLen, rng), ...shuffle(rest, rng)].slice(0, want);

  const opts = shuffle([{ id: target.id, prog: target, ok: true },
    ...others.map((p) => ({ id: p.id, prog: p, ok: false }))], rng);
  return {
    kind: 'prog', stage, level: lv, targetId: owner || targetId, fromReviewQueue,
    target,
    tonicPc: Math.floor(rng() * 12),
    optionIds: opts.map((o) => o.id),
    correctOptionId: target.id,
    options: opts.map((o) => ({ id: o.id, prog: o.prog })),
    prompt: '听一整条进行，选出它的级数走法',
  };
}

// 选项上显示的两个身份证：罗马数字（功能和声的说法）与简谱级数（这个应用的说法）。
// 刻意不放进行名字——名字是答案，给了就没得听了。
export function progOptionLabel(prog) {
  return {
    roman: progressionRomans(prog).join('–'),
    degrees: progressionDegreeLabels(prog).join('–'),
  };
}
