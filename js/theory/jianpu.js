// 简谱：数字即音级。这个模块只做三件事——
//   1) 记号（级数 + 八度 + 时值）↔ MIDI：简谱是**首调**，同一串数字换个主音就是另一组音高
//   2) 记号 → HTML：八度点、减时线、附点、延音横线，都用纸面墨线画
//   3) 记号 → 纯文本：给批注与无障碍留一条不依赖排版的读法
// 全大调首调唱名，所以数字 1–7 不带升降号；调性写在记号之外（「1 = G」），这正是要教的点。

export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

// 主音一律落在 C3–B3。这不是随便挑的：旋律允许 ±1 个八度点，
// 只有落在这一个八度里，任意主音（含 B 调的 7 上加一点）都还在 C2–C6 的采样范围内——
// 换调后音高跟着主音走，但绝不会被范围钳到天花板上去。
export function tonicMidi(keyPc) {
  return 48 + (((keyPc % 12) + 12) % 12);
}

// 记号 → MIDI。rest 步骤没有音高。
export function stepToMidi(step, keyPc) {
  if (step.rest) return null;
  return tonicMidi(keyPc) + MAJOR_STEPS[step.degree - 1] + 12 * (step.octave || 0);
}

// 记号序列 → 统一音符模型 [{ midi, startBeats, durBeats }]（播放与卷帘共用）
export function melodyToNotes(steps, keyPc) {
  let t = 0;
  const notes = [];
  for (const s of steps) {
    const midi = stepToMidi(s, keyPc);
    if (midi !== null) notes.push({ midi, startBeats: t, durBeats: s.dur });
    t += s.dur;
  }
  return notes;
}

export function melodyBeats(steps) {
  return steps.reduce((n, s) => n + s.dur, 0);
}

// 时值记号：减时线（八分/十六分）、附点、延音横线（二分及以上）
function durationMarks(dur) {
  if (dur <= 0.25) return { under: 2, dash: 0, dot: false };
  if (dur <= 0.5) return { under: 1, dash: 0, dot: false };
  if (dur < 1) return { under: 1, dash: 0, dot: false };
  if (dur === 1.5) return { under: 0, dash: 0, dot: true };
  if (dur === 2) return { under: 0, dash: 1, dot: false };
  if (dur === 3) return { under: 0, dash: 1, dot: true };
  return { under: 0, dash: 0, dot: false };
}

// 单个记号的 HTML。八度点在数字上下，减时线在数字下，附点在右，延音横线在右。
export function stepHTML(step) {
  const octave = step.octave || 0;
  const above = octave > 0 ? '·'.repeat(octave) : '';
  const below = octave < 0 ? '·'.repeat(-octave) : '';
  const { under, dash, dot } = durationMarks(step.dur);
  const digit = step.rest ? '0' : String(step.degree);
  // 减时线与附点/延音横线永不同时出现，所以尾巴可以留在正文行里，不必绝对定位
  const tail = dash ? '—' : dot ? '·' : '';
  return (
    `<span class="jp-step">`
    + `<span class="jp-oct">${above}</span>`
    + `<span class="jp-main"><span class="jp-digit">${digit}</span>`
    + (tail ? `<span class="jp-tail">${tail}</span>` : '')
    + `</span>`
    + `<span class="jp-oct">${below}</span>`
    + (under ? `<span class="jp-under">${'<i></i>'.repeat(under)}</span>` : '')
    + `</span>`
  );
}

// 整行记号。diffAt = 与正确答案不同的那几个下标（批注用朱红标出来）
export function lineHTML(steps, { diffAt = [] } = {}) {
  const marks = steps.map((s, i) => {
    const html = stepHTML(s);
    return diffAt.includes(i) ? html.replace('class="jp-step"', 'class="jp-step is-diff"') : html;
  }).join('');
  return `<span class="jp-line">${marks}</span>`;
}

// 纯文本读法：八度点写成上/下，时值写成说明。批注、aria 与复制粘贴用这条。
export function lineText(steps) {
  return steps.map((s) => {
    const octave = s.octave || 0;
    const dots = octave > 0 ? '·'.repeat(octave) : octave < 0 ? '·'.repeat(-octave) : '';
    const digit = s.rest ? '0' : String(s.degree);
    const mark = octave > 0 ? `${digit}${dots}` : octave < 0 ? `${dots}${digit}` : digit;
    if (s.dur === 0.5) return `${mark}(八分)`;
    if (s.dur === 1.5) return `${mark}·`;
    if (s.dur >= 2) return `${mark}—`;
    return mark;
  }).join(' ');
}

// 两个记号序列在第几拍上不同（干扰项批注用）
export function diffBeats(a, b) {
  const n = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y || x.degree !== y.degree || (x.octave || 0) !== (y.octave || 0)
      || x.dur !== y.dur || !!x.rest !== !!y.rest) {
      out.push(i);
    }
  }
  return out;
}

// —— 三维 diff：旋律重建的判卷 ——
// 逐音比较三件事：音高、起始位置、时值。两边按起点排序后一一配对，
// 多出来的音符单独归类——「多放了」和「少放了」是两种完全不同的错法。
export function diffMelody(userNotes, targetNotes, { tol = 0.01 } = {}) {
  const byStart = (a, b) => a.startBeats - b.startBeats || a.midi - b.midi;
  const mine = [...userNotes].sort(byStart);
  const want = [...targetNotes].sort(byStart);
  const rows = [];

  for (let i = 0; i < Math.max(mine.length, want.length); i++) {
    const a = mine[i];
    const b = want[i];
    if (a && b) {
      rows.push({
        index: i + 1,
        status: 'pair',
        pitchOk: a.midi === b.midi,
        startOk: Math.abs(a.startBeats - b.startBeats) <= tol,
        durOk: Math.abs(a.durBeats - b.durBeats) <= tol,
        user: a,
        target: b,
      });
    } else if (a) {
      rows.push({ index: i + 1, status: 'extra', user: a });
    } else {
      rows.push({ index: i + 1, status: 'missing', target: b });
    }
  }

  const total = want.length * 3;
  const hit = rows.reduce(
    (n, r) => n + (r.pitchOk ? 1 : 0) + (r.startOk ? 1 : 0) + (r.durOk ? 1 : 0),
    0,
  );
  return {
    rows, total, hit,
    perfect: rows.length > 0 && rows.every((r) => r.status === 'pair' && r.pitchOk && r.startOk && r.durOk),
  };
}
