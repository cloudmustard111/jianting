// 钢琴卷帘（Canvas，纸面世界）。
// 数据模型与全应用统一：音符 { id, midi, start(拍), dur(拍), velocity, color? }，音高一律 MIDI 编号。
// 编辑器实例：左键空白=画音符（按住可拖位）、拖音符=移动、拖右边缘=改时值、右键=删除、
//             左侧键盘=试音、滚轮=滚动音区。所有提交型改动经 onChange 通知外部（自动保存/联动）。
// 只读实例（readOnly: true）：任意位置点击=试音，用于查询页的和弦卷帘展示。
// 音域/行高/小节数均可按实例覆盖（查询页和弦卷帘用 C3–C6、行高 12、单小节）。
import { CONFIG } from './config.js';
import { clampToRange } from './theory/notes.js';
import { engine } from './audio/engine.js';
import { player } from './audio/player.js';

const isBlack = (m) => [1, 3, 6, 8, 10].includes(m % 12);

export function snapBeat(v, snap) {
  return Math.round(v / snap) * snap;
}

export function createRoll(canvas, host, opts = {}) {
  const {
    onChange = null,
    readOnly = false,
    lowMidi = CONFIG.keyboard.lowMidi,   // 36 (C2)
    highMidi = CONFIG.keyboard.highMidi, // 84 (C6)
    rowHeight = CONFIG.roll.rowHeight,
    bars: barsOpt = CONFIG.roll.bars,
    onAudition = null,
  } = opts;
  const keyW = CONFIG.roll.keyWidth, rulerH = CONFIG.roll.rulerHeight, EDGE = CONFIG.roll.edgePx;
  const rowH = rowHeight;

  const st = {
    notes: [],            // { id, midi, start, dur, velocity, color? }
    ghost: [],            // 只描边的目标音符（旋律重建对答案用），不参与编辑与保存
    bars: barsOpt,
    snap: CONFIG.roll.snap,
    bpm: CONFIG.music.bpm,
    loop: true,
    nextId: 1,
    undoStack: [],
    playing: false,
    playStartCtx: 0,
    playheadBeats: -1,
    drag: null,
    raf: 0,
    onChange,
    onAudition,
    readOnly,
    low: lowMidi,
    high: highMidi,
    rowH,
    width: 0,
    dpr: 1,
  };
  const totalBeats = () => st.bars * 4;
  // 行数随时可变：查询页预览会把音域收到当前和弦实际占的那几个八度
  const rows = () => st.high - st.low + 1;
  const ctx2d = canvas.getContext('2d');

  // —— 几何 ——
  function resize() {
    const cssW = Math.max(host.clientWidth, 640);
    const cssH = rulerH + rows() * rowH;
    st.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * st.dpr);
    canvas.height = Math.round(cssH * st.dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    st.width = cssW;
    draw();
  }
  const pxPerBeat = () => (st.width - keyW) / totalBeats();
  const geom = () => ({ keyW, rowH, rulerH, pxPerBeat: pxPerBeat(), totalBeats: totalBeats(), low: st.low, high: st.high, readOnly: st.readOnly });
  const audition = (midi) => {
    if (st.onAudition) st.onAudition(midi);
    else player.playNote(midi, { durationBeats: 0.5 });
  };

  // —— 绘制 ——
  function draw() {
    const ppb = pxPerBeat();
    const W = st.width, H = rulerH + rows() * rowH;
    ctx2d.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx2d.clearRect(0, 0, W, H);

    // 音高行（黑键行更深）
    for (let r = 0; r < rows(); r++) {
      const midi = st.high - r;
      const y = rulerH + r * rowH;
      ctx2d.fillStyle = isBlack(midi) ? '#e9e1cb' : '#f7f2e4';
      ctx2d.fillRect(keyW, y, W - keyW, rowH);
      if (midi % 12 === 0) { // 每个 C 上方画八度分隔线
        ctx2d.fillStyle = '#c9bfa4';
        ctx2d.fillRect(keyW, y, W - keyW, 1);
      }
    }
    // 竖向网格：拍细线、小节粗线
    for (let b = 0; b <= st.bars * 4; b++) {
      const x = keyW + b * ppb;
      ctx2d.fillStyle = b % 4 === 0 ? '#a89c7e' : '#ddd3ba';
      ctx2d.fillRect(x, rulerH, 1, rows() * rowH);
    }
    // 小节标尺
    ctx2d.fillStyle = '#efe8d5';
    ctx2d.fillRect(0, 0, W, rulerH);
    ctx2d.fillStyle = '#6b675c';
    ctx2d.font = '11px sans-serif';
    for (let bar = 1; bar <= st.bars; bar++) {
      ctx2d.fillText(String(bar), keyW + (bar - 1) * 4 * ppb + 4, 15);
    }
    // 左侧键盘
    for (let r = 0; r < rows(); r++) {
      const midi = st.high - r;
      const y = rulerH + r * rowH;
      ctx2d.fillStyle = isBlack(midi) ? '#3a362c' : '#fbf7ec';
      ctx2d.fillRect(0, y, keyW, rowH);
      if (midi % 12 === 0) {
        ctx2d.fillStyle = '#6b675c';
        ctx2d.font = '10px sans-serif';
        ctx2d.fillText('C' + (midi / 12 - 1), 6, y + rowH - 4);
      }
    }
    ctx2d.strokeStyle = '#55503f';
    ctx2d.strokeRect(0.5, 0.5, keyW, H - 1);
    // 音符（root 色块 = 琥珀，普通 = 蓝）
    // 幽灵块（目标旋律）只描边不填色，压在真实音符下面：旋律重建时一眼看出对不齐在哪
    for (const g of st.ghost) {
      const x = keyW + g.start * ppb;
      const y = rulerH + (st.high - g.midi) * rowH;
      const w = Math.max(3, g.dur * ppb - 1);
      ctx2d.strokeStyle = '#a89c7e';
      ctx2d.lineWidth = 1;
      ctx2d.strokeRect(x + 0.5, y + 1.5, Math.max(2, w - 1), rowH - 3);
    }
    for (const n of st.notes) {
      const x = keyW + n.start * ppb;
      const y = rulerH + (st.high - n.midi) * rowH;
      const w = Math.max(3, n.dur * ppb - 1);
      ctx2d.fillStyle = n.color === 'root' ? '#b5432a' : '#2d5f8a';
      ctx2d.fillRect(x, y + 1, w, rowH - 2);
      ctx2d.fillStyle = 'rgba(250,246,236,.55)';
      ctx2d.fillRect(x + w - EDGE + 1, y + 1, 2, rowH - 2); // 右边缘把手
    }
    // 播放头
    if (st.playheadBeats >= 0) {
      const x = keyW + st.playheadBeats * ppb;
      ctx2d.fillStyle = '#b5432a';
      ctx2d.fillRect(x, 0, 2, H);
    }
  }

  // —— 命中检测 ——
  function evtPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function findNote(midi, time) {
    return st.notes.find((n) => n.midi === midi && time >= n.start && time <= n.start + n.dur);
  }

  // —— 变更提交（撤销栈 + 通知外部；只读实例不入栈） ——
  function pushUndo() {
    if (st.readOnly) return;
    st.undoStack.push(JSON.stringify(st.notes));
    if (st.undoStack.length > 50) st.undoStack.shift();
  }
  function commit() {
    if (st.onChange) st.onChange();
    draw();
  }

  // —— 交互 ——
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const { x, y } = evtPos(e);
    const midi = st.high - Math.floor((y - rulerH) / rowH);
    if (st.readOnly) { audition(midi); return; } // 只读：点哪都试音
    canvas.setPointerCapture(e.pointerId);
    if (y < rulerH) return;
    if (x < keyW) { audition(midi); return; }
    const ppb = pxPerBeat();
    const time = (x - keyW) / ppb;
    const note = findNote(midi, time);
    if (e.button === 2) { // 右键删除
      if (note) { pushUndo(); st.notes = st.notes.filter((n) => n !== note); commit(); }
      return;
    }
    if (e.button !== 0) return;
    pushUndo();
    if (note) {
      const atEdge = x >= keyW + (note.start + note.dur) * ppb - EDGE;
      st.drag = atEdge
        ? { mode: 'resize', note }
        : { mode: 'move', note, grab: time - note.start, lastMidi: note.midi };
      if (!atEdge) audition(note.midi);
    } else { // 画新音符（按住可继续拖动定位）
      const start = Math.max(0, snapBeat(time, st.snap));
      const note = { id: st.nextId++, midi: clampToRange(midi), start, dur: st.snap, velocity: CONFIG.audio.defaultVelocity };
      st.notes.push(note);
      st.drag = { mode: 'move', note, grab: time - start, lastMidi: note.midi };
      audition(note.midi);
      commit();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!st.drag) return;
    const { x, y } = evtPos(e);
    const ppb = pxPerBeat();
    const time = (x - keyW) / ppb;
    const midi = st.high - Math.floor((y - rulerH) / rowH);
    const { mode, note } = st.drag;
    if (mode === 'move') {
      note.start = Math.max(0, Math.min(snapBeat(time - st.drag.grab, st.snap), totalBeats() - note.dur));
      const nm = clampToRange(midi);
      if (nm !== st.drag.lastMidi) { note.midi = nm; st.drag.lastMidi = nm; audition(nm); }
    } else if (mode === 'resize') {
      note.dur = Math.max(st.snap, Math.min(snapBeat(time - note.start, st.snap), totalBeats() - note.start));
    }
    draw();
  });
  const endDrag = () => {
    if (st.drag) { st.drag = null; commit(); }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // —— 播放（音频走 Web Audio 精确调度，播放头走 rAF） ——
  function play() {
    if (st.notes.length === 0) return false;
    stopInternal();
    st.playing = true;
    const flat = st.notes.map((n) => ({ midi: n.midi, startBeats: n.start, durBeats: Math.max(0.05, n.dur - 0.02), velocity: n.velocity }));
    player.playMelody(flat);
    st.playStartCtx = engine.now() + 0.05;
    const tick = () => {
      if (!st.playing) return;
      const elapsed = engine.now() - st.playStartCtx;
      const beats = elapsed * st.bpm / 60;
      if (beats >= totalBeats() + 0.2) {
        if (st.loop) { play(); return; } // 重新起播
        stop(); return;
      }
      st.playheadBeats = beats;
      draw();
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
    return true;
  }
  function stopInternal() {
    st.playing = false;
    cancelAnimationFrame(st.raf);
    player.stopAll();
  }
  function stop() {
    stopInternal();
    st.playheadBeats = -1;
    draw();
  }

  // —— 对外 API ——
  const api = {
    getNotes: () => st.notes.map((n) => ({ ...n })),
    setNotes: (arr) => {
      pushUndo();
      // 防御非数值输入：任何 start/dur/midi 非有限的音符直接丢弃
      st.notes = arr
        .map((n) => ({
          id: st.nextId++,
          midi: clampToRange(Math.round(Number(n.midi))),
          start: Number(n.start),
          dur: Number(n.dur),
          velocity: n.velocity ?? CONFIG.audio.defaultVelocity,
          color: n.color,
        }))
        .filter((n) => Number.isFinite(n.midi) && Number.isFinite(n.start) && Number.isFinite(n.dur))
        .map((n) => ({ ...n, start: Math.max(0, n.start), dur: Math.max(0.05, n.dur) }));
      commit();
    },
    addNotes: (arr) => { // 追加（不覆盖），用于和弦/进行发送
      pushUndo();
      const maxEnd = st.notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
      const base = st.notes.length ? snapBeat(maxEnd, 4) : 0; // 对齐到小节
      for (const n of arr) {
        st.notes.push({ id: st.nextId++, midi: clampToRange(n.midi), start: base + n.start, dur: n.dur, velocity: n.velocity ?? CONFIG.audio.defaultVelocity });
      }
      commit();
      return base;
    },
    clear: () => { pushUndo(); st.notes = []; commit(); },
    setGhost: (arr) => {
      st.ghost = Array.isArray(arr) ? arr.map((n) => ({ ...n })) : [];
      draw();
    },
    // 收紧/放宽音域。查询页预览靠它只铺开当前和弦占的那几行——
    // 预览本来就不需要 C3–C6 铺满，收窄之后既能变矮又能把行高做大。
    setRange: (lo, hi) => {
      st.low = Math.max(0, Math.min(127, Math.round(lo)));
      st.high = Math.max(st.low, Math.min(127, Math.round(hi)));
      resize();
    },
    undo: () => {
      if (st.undoStack.length === 0) return false;
      st.notes = JSON.parse(st.undoStack.pop());
      commit();
      return true;
    },
    canUndo: () => st.undoStack.length > 0,
    setBars: (b) => { st.bars = b; resize(); },
    getBars: () => st.bars,
    setSnap: (s) => { st.snap = s; },
    getSnap: () => st.snap,
    setBpm: (b) => { st.bpm = Math.max(40, Math.min(240, b)); },
    getBpm: () => st.bpm,
    setLoop: (v) => { st.loop = v; },
    play, stop,
    isPlaying: () => st.playing,
    noteCount: () => st.notes.length,
    audition,
    geom,
    resize,
  };
  resize(); // 创建时立即按宿主尺寸定尺寸（否则 canvas 停在 300×150 默认值）

  // 宿主变宽变窄就重排（窗口缩放、副屏贴半屏），跨屏换 DPI 也要重画一次。
  // 只改宽度与像素比：小节数、音域、行高都不动。
  let lastGeomKey = '';
  function reflow() {
    const w = Math.max(host.clientWidth, 640);
    const key = `${w}@${window.devicePixelRatio || 1}`;
    if (key === lastGeomKey) return;
    lastGeomKey = key;
    resize();
  }
  window.addEventListener('resize', reflow);
  if (window.ResizeObserver) new ResizeObserver(reflow).observe(host);

  return api;
}

// 查询页和弦展示：只读单小节卷帘，根音朱红色块 + 和弦音蓝色块，点击试音
export function createChordRoll(canvas, host, { onAudition } = {}) {
  const roll = createRoll(canvas, host, {
    readOnly: true,
    bars: 1,
    lowMidi: 48,  // C3 —— 和弦声位根音锚定区间下限
    highMidi: 84, // C6
    rowHeight: 11,  // 音域收到和弦实际占用之后，行高可以做大，比铺满整段更好读
    onAudition,
  });
  return {
    setChord(voicing) {
      // 只铺开这个和弦占的音域（上下各留两行），预览因此不再永远是一整块 C3–C6
      const notes = voicing.midis;
      roll.setRange(
        Math.min(...notes) - 2,
        Math.max(...notes) + 2,
      );
      // 用音级判定根音：转位后根音会跑到上面去，拿 rootMidi 比会一个都点不亮
      const isRoot = (m) => (voicing.rootPc == null ? m === voicing.rootMidi : m % 12 === voicing.rootPc);
      roll.setNotes(voicing.midis.map((m) => ({ midi: m, start: 0, dur: 4, color: isRoot(m) ? 'root' : 'tone' })));
    },
    roll,
  };
}
