// ChordLab 应用入口：查询手册页接线 + 状态栏 + 引擎自检。
// 业务规则（声位/角色）在 theory/chords.js，播放细节在 audio/player.js，本文件只做接线。
import { CONFIG } from './config.js';
import * as notes from './theory/notes.js';
import { CHORD_GROUPS, CHORD_TYPES, getChordById, chordVoicing, chordFormula, chordsByStage, CHORD_MOODS, MOOD_INDEX, chordsOfMood, moodsOf, PITCH_NAMES, jianpuDegree, MODES, getModeById, modeChord, modeScaleLabels, modeDegreeLabel, maxInversion, INVERSION_NAMES } from './theory/chords.js';
import { PROGRESSIONS, getProgressionById, progressionNotes, progressionFlatNotes } from './progressions.js';
import { buildSMF, downloadSMF, smfInfo } from './midi/export.js';
import { createChordRoll } from './roll.js';
import { pickQuestion, applySrs, adjustLevel, isWeak, countToday, isDue, INVERSION_STAGE, INVERSION_ITEMS, getInversionItem } from './training/train.js';
import { pickIntervalQuestion, intervalStageItems } from './training/train.js';
import { getTrainItemById } from './theory/intervals.js';
import { pickJianpuQuestion, jianpuStageItems } from './training/train.js';
import { lineHTML, lineText, melodyToNotes, melodyBeats, diffBeats, tonicMidi } from './theory/jianpu.js';
import { pickMelodyQuestion, melodyStageItems } from './training/train.js';
import { diffMelody } from './theory/jianpu.js';
import { pickRhythmQuestion, rhythmStageItems } from './training/train.js';
import { onsetCells, diffOnsets, cellLabel, patternToNotes, GRID_CELLS } from './theory/rhythm.js';
import { pickProgQuestion, progStageItems, progOptionLabel, forceNextProgression, stageForProgression } from './training/train.js';
import { PROG_CATEGORIES, progressionsByCategory, progressionDegreeLabels } from './progressions.js';
import { idbGet, idbPut, idbGetAll, defaultTrainingRec } from './db.js';
import { createRoll, snapBeat } from './roll.js';
import { engine, ENGINE_STATE } from './audio/engine.js';
import { player } from './audio/player.js';


// 全局错误收集（自动化检查读取）
window.__chordlabErrors = [];
window.addEventListener('error', (e) => window.__chordlabErrors.push('error: ' + e.message));
window.addEventListener('unhandledrejection', (e) => window.__chordlabErrors.push('rejection: ' + String(e.reason)));

// ---------- 状态栏 ----------
const stateLabel = {
  [ENGINE_STATE.UNINITIALIZED]: '未初始化（点击键盘或按钮解锁音频）',
  [ENGINE_STATE.LOADING]: '采样加载中…（当前临时用合成音）',
  [ENGINE_STATE.READY]: '采样就绪',
  [ENGINE_STATE.PARTIAL]: '部分采样失败（降级运行，仍可练习）',
  [ENGINE_STATE.SYNTH]: '合成音模式（采样不可用）',
};
const $status = document.getElementById('engine-status');
const $detail = document.getElementById('engine-detail');
function renderStatus() {
  const s = engine.snapshot();
  // 采样可能已经备好、但音频上下文还没被手势解锁——这两种状态得分开说，
  // 不然会出现「采样就绪」却按不出声的矛盾画面
  const pending = s.state !== ENGINE_STATE.UNINITIALIZED
    && s.state !== ENGINE_STATE.LOADING && s.contextState !== 'running';
  $status.textContent = (stateLabel[s.state] || s.state) + (pending ? ' · 待解锁' : '');
  $status.dataset.state = s.state;
  const failedTxt = s.failed.length ? `，失败: ${s.failed.join('/')}` : '';
  $detail.textContent = `上下文: ${s.contextState} ｜ 采样: ${s.loaded}/${s.total}${failedTxt} ｜ 活动声部: ${s.activeVoices}`;
}
engine.onStateChange(renderStatus);
setInterval(renderStatus, 250);

// 页面一加载就在后台预载采样（第一次点「试听」时不用再等下载与解码）
engine.preload().catch(() => {});

// ---------- 和弦卷帘（查询页展示，FL 样式） ----------
const chordRoll = createChordRoll(
  document.getElementById('chord-roll-canvas'),
  document.getElementById('chord-roll-host'),
  {
    onAudition: (m) => {
      ensureUnlocked().then(() => player.playNote(m));
      document.getElementById('last-note').textContent = noteLabel(m) + ` (MIDI ${m})`;
    },
  },
);

async function ensureUnlocked() {
  const snap = await engine.unlockAndLoad();
  renderStatus();
  return snap;
}

// ---------- 查询手册 ----------
const PC_NAMES = PITCH_NAMES; // 展示用音名（与字典共用）

// 界面上的音名：♯ 用真符号。notes.midiToName 是机器名（采样文件名用 Cs4），
// 直接铺到界面上会露出 "Gs3"，而 chords.js 早就写明 PITCH_NAMES 才是面向显示的那套。
function noteLabel(midi) {
  return `${PITCH_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
const state = {
  rootPc: 0, typeId: 'maj', search: '', groupBy: 'structure',
  modeQuality: 'triad', modeKey: '',   // 调式视图：三/七和弦，以及当前选中的「调式:级」
  progId: 'pop', tonicPc: 0, keyPc: 0,
  inversion: 0,                        // 查询页当前和弦的转位（0 = 原位）
};

// 调性切换器（签名交互）：切换后全页简谱级数重算
function renderKeySwitcher() {
  const box = document.getElementById('key-switcher');
  box.querySelectorAll('.key-btn').forEach((el) => el.remove());
  PITCH_NAMES.forEach((name, pc) => {
    const b = document.createElement('button');
    b.className = 'key-btn' + (pc === state.keyPc ? ' active' : '');
    b.textContent = name;
    b.title = `以 ${name} 为do`;
    b.addEventListener('click', () => {
      if (state.keyPc === pc) return;
      state.keyPc = pc;
      // 调式视图里每一级的根音 = 主音 + 音阶级数，换主音就要整组跟着移调，
      // 选中的那一级仍然停在同一级上。
      if (state.groupBy === 'mode' && state.modeKey) {
        const [modeId, degree] = state.modeKey.split(':');
        state.rootPc = (state.keyPc + getModeById(modeId).intervals[Number(degree) - 1]) % 12;
      }
      renderKeySwitcher();
      renderRoots();
      renderTypes();      // 芯片上的级数记号全部依赖主音，漏了这句全页级数就不会重算
      renderDetail();
      renderProgDetail();
      // 简谱轨：换个主音，同一串数字立刻变成另一组音高——把「首调」当场演出来
      const jq = trainState.current;
      if (jq && jq.kind === 'melody') {
        // 旋律重建换个调性 = 换了一组目标音，这道题作废重来，免得对着旧答案改
        if (melodyRoll) melodyRoll.clear();
        resetTrainQuestion();
      } else if (jq && jq.kind === 'jianpu') {
        if (trainState.answered && trainState.lastVerdict) {
          renderJianpuResult(trainState.lastVerdict.correct, jq, trainState.lastVerdict.reason);
        } else {
          renderTrainQuestion();
        }
      }
      document.querySelectorAll('.root-row, .detail, #type-groups, #pd-steps').forEach((el) => {
        el.classList.remove('jp-turn');
        void el.offsetWidth;
        el.classList.add('jp-turn');
      });
    });
    box.appendChild(b);
  });
}

// ---------- 页面路由（查询 / 训练 / 进行 / 卷帘） ----------
let currentPage = 'query';
function showPage(page) {
  document.getElementById('page-query').hidden = page !== 'query';
  document.getElementById('page-train').hidden = page !== 'train';
  document.getElementById('page-prog').hidden = page !== 'prog';
  document.getElementById('page-roll').hidden = page !== 'roll';
  document.querySelectorAll('#main-nav .nav-item[data-page]').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  if (currentPage === 'prog' && page !== 'prog') stopProgPlayback();
  currentPage = page;
  if (page === 'train' && !trainState.loaded) loadTrainStage();
  if (page === 'roll') { initRoll(); rollApi.resize(); }
}
document.querySelectorAll('#main-nav .nav-item[data-page]').forEach((el) => {
  el.addEventListener('click', () => {
    if (el.classList.contains('disabled')) return;
    showPage(el.dataset.page);
  });
});

function renderRoots() {
  const box = document.getElementById('root-selector');
  box.innerHTML = '';
  PC_NAMES.forEach((name, pc) => {
    const b = document.createElement('button');
    b.className = 'root-btn' + (pc === state.rootPc ? ' active' : '');
    b.innerHTML = `${name}<i>${jianpuDegree(pc, state.keyPc).label}</i>`;
    b.addEventListener('click', () => { state.rootPc = pc; renderRoots(); renderTypes(); renderDetail(); });
    box.appendChild(b);
  });
}

// 搜索归一化：# → ♯，b → ♭，大小写不敏感
function normalize(q) {
  return q.trim().toLowerCase().replaceAll('#', '♯').replaceAll('b', '♭');
}

function renderTypes() {
  const box = document.getElementById('type-groups');
  box.innerHTML = '';
  const q = normalize(state.search);
  let shown = 0;

  // 三个浏览维度共用同一套 chips；搜索在三种视图下都生效
  const sections = state.groupBy === 'structure'
    ? CHORD_GROUPS.map((g) => ({
        title: g.name, desc: '',
        items: CHORD_TYPES.filter((t) => t.group === g.id).map((t) => ({ type: t })),
      }))
    : state.groupBy === 'mood'
    ? CHORD_MOODS.map((m) => ({
        title: m.name, desc: m.desc,
        items: chordsOfMood(m.id).map((t) => ({ type: t })),
      }))
    : MODES.map((mo) => ({
        title: `${mo.name}（${mo.alias}）`,
        desc: `${modeScaleLabels(mo.id).join(' ')}　${mo.character}`,
        items: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
          type: modeChord(mo.id, d, { sevenths: state.modeQuality === 'seventh' }).type,
          jp: modeDegreeLabel(mo.id, d),
          key: `${mo.id}:${d}`,
          // 调式里每一级的根音由「主音 + 音阶级数」决定，不是那个独立根音选择器
          rootPc: (state.keyPc + mo.intervals[d - 1]) % 12,
        })),
      }));

  for (const sec of sections) {
    const list = sec.items.filter((c) => c.type
      && (!q || c.type.symbol.toLowerCase().includes(q) || c.type.name.includes(state.search.trim())));
    if (list.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'chips-group';
    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = sec.desc ? `${sec.title} —— ${sec.desc}` : sec.title;
    const row = document.createElement('div');
    row.className = 'chips-row';

    for (const c of list) {
      const key = c.key || c.type.id;
      // 调式视图里同一个和弦类型会反复出现（多利亚的 ii 与 iii 都是小三），
      // 选中态只能落在「哪一调式的哪一级」上，落在类型 id 上会同时点亮好几块。
      const active = c.key ? key === state.modeKey : c.type.id === state.typeId;
      const chip = document.createElement('button');
      chip.className = 'chip' + (active ? ' active' : '');
      chip.dataset.id = key;
      const jp = c.jp || jianpuDegree(state.rootPc, state.keyPc).label;
      // 调式视图里每一级的根音都不同，芯片直接写全「根音 + 类型」，否则看不出是哪颗和弦
      const symbol = c.rootPc == null ? c.type.symbol : PITCH_NAMES[c.rootPc] + c.type.symbol;
      chip.innerHTML = `<b>${symbol}</b><i>${c.type.name}</i><span class="jp">${jp}</span>`;
      chip.addEventListener('click', () => {
        state.typeId = c.type.id;
        if (c.key) {
          state.modeKey = key;
          state.rootPc = c.rootPc;
          renderRoots();
        }
        renderTypes(); renderDetail();
      });
      row.appendChild(chip);
      shown++;
    }
    section.appendChild(title);
    section.appendChild(row);
    box.appendChild(section);
  }

  document.getElementById('type-count').textContent = state.groupBy === 'structure'
    ? `共 ${shown} 种（按 5 级听辨阶段编排）`
    : state.groupBy === 'mood'
    ? `共 ${shown} 个（39 种和弦按情绪复用归属）`
    : `共 ${shown} 个调内和弦（7 调式 × 7 级，全部取自同一份和弦字典）`;
}

function renderViewToggle() {
  document.getElementById('view-structure').classList.toggle('active', state.groupBy === 'structure');
  document.getElementById('view-mood').classList.toggle('active', state.groupBy === 'mood');
  document.getElementById('view-mode').classList.toggle('active', state.groupBy === 'mode');
  document.getElementById('mode-quality').hidden = state.groupBy !== 'mode';
  document.getElementById('mq-triad').classList.toggle('active', state.modeQuality === 'triad');
  document.getElementById('mq-seventh').classList.toggle('active', state.modeQuality === 'seventh');
  document.getElementById('view-desc').textContent = state.groupBy === 'structure'
    ? '按三/六/七/九等结构分组'
    : state.groupBy === 'mood'
    ? '按听感情绪分组（一个和弦可出现在多个情绪）'
    : '七个中古调式的调内和弦，级数按首调读；主音取上方调性切换器';
}

function renderDetail() {
  const chord = getChordById(state.typeId);
  const maxInv = maxInversion(chord);
  state.inversion = Math.min(state.inversion, maxInv);   // 换和弦类型后转位数可能不够用
  const v = chordVoicing(state.rootPc, chord, state.inversion);
  document.getElementById('cd-symbol').textContent = PC_NAMES[state.rootPc] + chord.symbol;
  document.getElementById('cd-name').textContent = `${PC_NAMES[state.rootPc]}${chord.symbol} · ${chord.name}`;
  document.querySelector('.chord-jianpu').textContent = jianpuDegree(state.rootPc, state.keyPc).label;
  document.getElementById('cd-color').textContent = chord.color;
  // 根音与低音分开写：这两个在转位里是不同的音，正是这一块要教的区别
  const sameBass = v.bassMidi === v.rootNoteMidi;
  document.getElementById('cd-formula').textContent =
    `音程公式：${chordFormula(chord)}　｜　根音：${noteLabel(v.rootNoteMidi)}　｜　`
    + `低音：${noteLabel(v.bassMidi)}（${v.inversionName}）${sameBass ? '' : ' ＝ 转位'}`
    + `　｜　听辨阶段：第 ${chord.stage} 阶段`;
  const moodTags = moodsOf(chord.id).map((m) => m.name).join(' / ');
  document.getElementById('cd-moods').textContent = `情绪归属：${moodTags || '—'}`;

  const invBox = document.getElementById('cd-inversion');
  invBox.innerHTML = '';
  for (let i = 0; i <= maxInv; i++) {
    const b = document.createElement('button');
    b.className = i === state.inversion ? 'active' : '';
    b.textContent = INVERSION_NAMES[i];
    b.addEventListener('click', async () => {
      if (state.inversion === i) return;
      state.inversion = i;
      renderDetail();
      await ensureUnlocked();
      const nv = chordVoicing(state.rootPc, getChordById(state.typeId), i);
      player.playChord(nv.midis, { durationBeats: CONFIG.chords.blockDurationBeats });
    });
    invBox.appendChild(b);
  }

  const noteBox = document.getElementById('cd-notes');
  noteBox.innerHTML = '';
  v.midis.forEach((m, i) => {
    const marks = [];
    if (m === v.rootNoteMidi) marks.push('根音');
    if (m === v.bassMidi) marks.push('低音');
    const item = document.createElement('span');
    item.className = 'note-item' + (m === v.rootNoteMidi ? ' is-root' : '') + (m === v.bassMidi ? ' is-bass' : '');
    item.innerHTML = `<b>${noteLabel(m)}</b><i>${v.roles[i]}${marks.length ? ' ' + marks.join('·') : ''}</i>`;
    noteBox.appendChild(item);
  });
  chordRoll.setChord(v);
}

document.getElementById('type-search').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderTypes();
});
document.getElementById('view-structure').addEventListener('click', () => {
  state.groupBy = 'structure'; renderViewToggle(); renderTypes();
});
document.getElementById('view-mood').addEventListener('click', () => {
  state.groupBy = 'mood'; renderViewToggle(); renderTypes();
});
document.getElementById('view-mode').addEventListener('click', () => {
  state.groupBy = 'mode';
  // 默认停在「伊奥尼亚 I 级」，与查询页默认选中的大三和弦对得上，不会一片都没有选中态
  if (!state.modeKey) {
    state.modeKey = `${MODES[0].id}:1`;
    state.rootPc = state.keyPc;   // 一级 = 主音，详情面板跟着落在主音上
    renderRoots();
  }
  renderViewToggle(); renderTypes(); renderDetail();
});
document.getElementById('mq-triad').addEventListener('click', () => {
  state.modeQuality = 'triad'; renderViewToggle(); renderTypes();
});
document.getElementById('mq-seventh').addEventListener('click', () => {
  state.modeQuality = 'seventh'; renderViewToggle(); renderTypes();
});
document.getElementById('btn-block').addEventListener('click', async () => {
  await ensureUnlocked();
  const chord = getChordById(state.typeId);
  const v = chordVoicing(state.rootPc, chord, state.inversion);
  player.playChord(v.midis, { durationBeats: CONFIG.chords.blockDurationBeats });
});
document.getElementById('btn-arp').addEventListener('click', async () => {
  await ensureUnlocked();
  const chord = getChordById(state.typeId);
  const v = chordVoicing(state.rootPc, chord, state.inversion);
  player.playArpeggio(v.midis);
});
document.getElementById('btn-stop-chord').addEventListener('click', () => player.stopAll());
document.getElementById('btn-stop-all').addEventListener('click', () => player.stopAll());
document.getElementById('btn-init').addEventListener('click', ensureUnlocked);
document.getElementById('btn-export-chord').addEventListener('click', () => {
  const chord = getChordById(state.typeId);
  const v = chordVoicing(state.rootPc, chord, state.inversion);
  const bytes = buildSMF({
    notes: v.midis.map((m) => ({ midi: m, startBeats: 0, durBeats: CONFIG.chords.blockDurationBeats })),
    trackName: 'JIANTING',
  });
  downloadSMF(bytes, `JIANTING_${PITCH_NAMES[state.rootPc]}${chord.symbol.replaceAll('/', '-')}.mid`);
});

// ---------- 和弦进行页 ----------
let progTimers = []; // 播放时逐步高亮的 UI 定时器（音频调度走 Web Audio 精确时间轴）

function renderProgList() {
  const box = document.getElementById('prog-list');
  box.innerHTML = '';
  // 按用途分组：十几条平铺着读没有结构，分组之后一眼看出这条进行是干什么用的
  for (const cat of PROG_CATEGORIES) {
    const list = progressionsByCategory(cat.id);
    if (list.length === 0) continue;
    const section = document.createElement('div');
    section.className = 'chips-group';
    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = `${cat.name}（${list.length}）`;
    section.appendChild(title);
    for (const p of list) {
      const card = document.createElement('button');
      card.className = 'prog-card' + (p.id === state.progId ? ' active' : '');
      card.innerHTML = `<b>${p.name}</b><i>${p.desc}</i>`;
      card.addEventListener('click', () => { stopProgPlayback(); state.progId = p.id; renderProgList(); renderProgDetail(); });
      section.appendChild(card);
    }
    box.appendChild(section);
  }
  document.getElementById('prog-count').textContent =
    `共 ${PROGRESSIONS.length} 条 · ${PROG_CATEGORIES.length} 类（每条都可任意移调、导出 MIDI）`;
}

function renderProgTonics() {
  const box = document.getElementById('prog-tonic');
  box.innerHTML = '';
  PITCH_NAMES.forEach((name, pc) => {
    const b = document.createElement('button');
    b.className = 'root-btn' + (pc === state.tonicPc ? ' active' : '');
    b.textContent = name;
    b.addEventListener('click', () => {
      stopProgPlayback(); state.tonicPc = pc;
      renderProgTonics(); renderProgDetail();
    });
    box.appendChild(b);
  });
}

function renderProgDetail() {
  const prog = getProgressionById(state.progId);
  const data = progressionNotes(prog, state.tonicPc);
  document.getElementById('pd-name').textContent = prog.name.split(' ')[0];
  document.getElementById('pd-desc').textContent = `${prog.desc}（${prog.mode === 'minor' ? '小调' : '大调'}框架）`;
  const box = document.getElementById('pd-steps');
  box.innerHTML = '';
  // 级数用这条进行自己的调式音阶拼写（弗利几亚要写 ♭2，不是全局色偏移表给的 ♯1）
  const degrees = progressionDegreeLabels(getProgressionById(state.progId));
  data.steps.forEach((st, i) => {
    const el = document.createElement('div');
    el.className = 'prog-step';
    el.dataset.step = String(i);
    el.innerHTML = `<b>${st.roman}</b><span>${st.label} · 简谱 ${degrees[i]}</span><i>${st.midis.map(noteLabel).join(' ')}</i>`;
    // 点某一步单独试听：整条进行里想知道「刚才那个和弦是什么」时不用重放整条
    el.addEventListener('click', async () => {
      await ensureUnlocked();
      player.playChord(st.midis, { durationBeats: Math.min(st.durBeats, 4) });
      box.querySelectorAll('.prog-step.playing').forEach((x) => x.classList.remove('playing'));
      el.classList.add('playing');
    });
    box.appendChild(el);
  });
  const sec = Math.round(notes.beatsToSeconds(data.totalBeats));
  document.getElementById('pd-meta').textContent =
    `${data.steps.length} 个和弦 ｜ ${data.totalBeats} 拍 ≈ ${sec} 秒 ｜ 速度 ${CONFIG.music.bpm} BPM ｜ 声位规则与查询页一致`;
}

function stopProgPlayback() {
  progTimers.forEach(clearTimeout);
  progTimers = [];
  player.stopAll();
  document.querySelectorAll('.prog-step.playing').forEach((el) => el.classList.remove('playing'));
}

function playProgression() {
  stopProgPlayback();
  const prog = getProgressionById(state.progId);
  const data = progressionNotes(prog, state.tonicPc);
  player.playMelody(progressionFlatNotes(data)); // 音频：Web Audio 精确调度
  data.steps.forEach((st, i) => {
    const delayMs = Math.round(notes.beatsToSeconds(st.startBeats) * 1000);
    progTimers.push(setTimeout(() => {
      document.querySelectorAll('.prog-step.playing').forEach((el) => el.classList.remove('playing'));
      const el = document.querySelector(`.prog-step[data-step="${i}"]`);
      if (el) el.classList.add('playing');
    }, delayMs));
  });
  progTimers.push(setTimeout(() => {
    document.querySelectorAll('.prog-step.playing').forEach((el) => el.classList.remove('playing'));
  }, Math.round(notes.beatsToSeconds(data.totalBeats) * 1000) + 400));
}
document.getElementById('btn-play-prog').addEventListener('click', async () => { await ensureUnlocked(); playProgression(); });
document.getElementById('btn-stop-prog').addEventListener('click', stopProgPlayback);
document.getElementById('btn-export-prog').addEventListener('click', () => {
  const prog = getProgressionById(state.progId);
  const data = progressionNotes(prog, state.tonicPc);
  const bytes = buildSMF({ notes: progressionFlatNotes(data), trackName: 'JIANTING' });
  downloadSMF(bytes, `JIANTING_${prog.id}_${PITCH_NAMES[state.tonicPc]}.mid`);
});

// 从进行页直接跳到训练页的进行轨，并把这条进行定成下一题——
// 「听到一条好听的进行」和「把它练进耳朵」之间不该隔着好几步
document.getElementById('btn-prog-practice').addEventListener('click', async () => {
  stopProgPlayback();
  const stage = stageForProgression(state.progId);
  forceNextProgression(state.progId);
  showPage('train');
  await setTrainTrack('prog');
  if (stage !== trainState.stage) {
    document.querySelectorAll('#tr-stage-row .root-btn')[stage - 1].click();
    await new Promise((r) => setTimeout(r, 80));
  }
  await nextQuestion();
});

// ---------- 听辨训练页 ----------
// 两轨共用同一套 SRS、难度升降、答题流水与出题骨架，区别只在出题器：
// 和弦轨按结构组分级，音程轨一阶段判方向、二阶段才给术语。
const TRACKS = {
  chord:    { label: '和弦', stages: [1, 2, 3, 4, 5, INVERSION_STAGE], levelKey: 'stageLevel' },
  interval: { label: '音程', stages: [1, 2], levelKey: 'stageLevelInterval' },
  jianpu:   { label: '简谱', stages: [1, 2], levelKey: 'stageLevelJianpu' },
  melody:   { label: '旋律', stages: [1, 2], levelKey: 'stageLevelMelody' },
  rhythm:   { label: '节奏', stages: [1, 2], levelKey: 'stageLevelRhythm' },
  prog:     { label: '进行', stages: [1, 2], levelKey: 'stageLevelProg' },
};
const INTERVAL_STAGE_NAMES = { 1: '关系', 2: '命名' };
const JIANPU_STAGE_NAMES = { 1: '音高', 2: '节奏' };
const MELODY_STAGE_NAMES = { 1: '音高', 2: '节奏' };
const RHYTHM_STAGE_NAMES = { 1: '基本型', 2: '十六分与切分' };
const PROG_STAGE_NAMES = { 1: '大调小调', 2: '爵士与调式' };

const trainState = {
  track: 'chord',
  stage: 1, level: 1, current: null, answered: false,
  srs: {}, answers: [], levels: {}, loaded: false,
  melodyBpm: 90,   // 旋律重建轨的试听速度（慢速练习用）
};

const trackCfg = () => TRACKS[trainState.track];

// 存不上不该拦住判卷：写失败只记一笔并标记「本次不保存」，流程照常走完
async function saveQuietly(what, fn) {
  try {
    await fn();
  } catch (e) {
    console.warn(`[简听] 写入失败（${what}）：`, e);
    trainState.storageOk = false;
  }
}

const PICKERS = {
  chord: pickQuestion,
  interval: pickIntervalQuestion,
  jianpu: pickJianpuQuestion,
  melody: pickMelodyQuestion,
  rhythm: pickRhythmQuestion,
  prog: pickProgQuestion,
};

// 该轨某阶段的全部训练项：阶段标签的计数和弱项列表共用
function trackItems(stage) {
  if (trainState.track === 'chord') {
    if (stage === INVERSION_STAGE) return INVERSION_ITEMS.map((x) => ({ ...x }));
    return chordsByStage(stage).map((t) => ({ id: t.id, symbol: t.symbol, name: t.name }));
  }
  if (trainState.track === 'jianpu') return jianpuStageItems(stage);
  if (trainState.track === 'melody') return melodyStageItems(stage);
  if (trainState.track === 'rhythm') return rhythmStageItems(stage);
  if (trainState.track === 'prog') return progStageItems(stage);
  return intervalStageItems(stage).map(getTrainItemById);
}

function stageLabel(s) {
  if (s === INVERSION_STAGE) return `第 ${s} 阶段 · 转位`;
  if (trainState.track === 'interval') return `第 ${s} 阶段 · ${INTERVAL_STAGE_NAMES[s]}`;
  if (trainState.track === 'jianpu') return `第 ${s} 阶段 · ${JIANPU_STAGE_NAMES[s]}`;
  if (trainState.track === 'melody') return `第 ${s} 阶段 · ${MELODY_STAGE_NAMES[s]}`;
  if (trainState.track === 'rhythm') return `第 ${s} 阶段 · ${RHYTHM_STAGE_NAMES[s]}`;
  if (trainState.track === 'prog') return `第 ${s} 阶段 · ${PROG_STAGE_NAMES[s]}`;
  return `第 ${s} 阶段`;
}

async function loadTrainStage() {
  // 存储坏了不应该让整页卡死：读不到就按空进度练，照常出题，
  // 只在状态行里说明「这次不保存」。曾经一个异常的库让「下一题」完全没反应。
  try {
    const meta = await idbGet('meta', trackCfg().levelKey);
    trainState.levels = meta ? meta.value : {};
    trainState.level = trainState.levels[trainState.stage] || 1;
    const recs = await idbGetAll('training');
    trainState.srs = {};
    for (const r of recs) trainState.srs[r.typeId] = r;
    trainState.answers = await idbGetAll('answers');
    trainState.storageOk = true;
  } catch (e) {
    console.warn('[简听] 训练进度读取失败，本次按空进度进行：', e);
    trainState.levels = {};
    trainState.level = 1;
    trainState.srs = {};
    trainState.answers = [];
    trainState.storageOk = false;
  }
  trainState.loaded = true;
  renderTrainStageRow();
  renderTrainStats();
  resetTrainQuestion();
  // 进页面就直接摆一道题。空着题卡的训练页看起来像没做完——
  // 用户第一眼就该看到选项，而不是一行「点击『下一题』开始」。
  nextQuestion().catch(() => {});
}

function renderTrainStageRow() {
  const box = document.getElementById('tr-stage-row');
  box.innerHTML = '';
  for (const s of trackCfg().stages) {
    const items = trackItems(s);
    const b = document.createElement('button');
    b.className = 'root-btn' + (s === trainState.stage ? ' active' : '');
    b.innerHTML = `${stageLabel(s)} <i>(${items.length} 种)</i>`;
    b.addEventListener('click', async () => {
      if (trainState.stage === s) return;
      trainState.stage = s;
      const meta = await idbGet('meta', trackCfg().levelKey);
      trainState.levels = meta ? meta.value : {};
      trainState.level = trainState.levels[s] || 1;
      resetTrainQuestion();
      renderTrainStageRow();
      renderTrainStats();
    });
    box.appendChild(b);
  }
}

function renderTrainStats() {
  const stageAnswers = trainState.answers.filter(
    (a) => a.stage === trainState.stage && (a.track || 'chord') === trainState.track,
  );
  const seen = stageAnswers.length;
  const correct = stageAnswers.filter((a) => a.correct).length;
  const rate = seen ? Math.round((correct / seen) * 100) : 0;
  const dueCount = trackItems(trainState.stage).filter((it) => isDue(trainState.srs[it.id], Date.now())).length;
  const today = countToday(trainState.answers);
  const optCount = trainState.track === 'interval' && trainState.stage === 1
    ? 3
    : CONFIG.training.optionsByLevel[trainState.level];
  document.getElementById('tr-level').textContent =
    `等级 L${trainState.level}（${optCount} 选 1）｜ 已练 ${seen} 题 · 正确率 ${rate}% ｜ 复习队列 ${dueCount} ｜ 今日 ${today}/${CONFIG.training.dailyGoal}`
    + (trainState.storageOk === false ? '　⚠ 本地存储异常，本次进度不会保存' : '');
  renderTrainWeak();
}

function resetTrainQuestion() {
  trainState.current = null;
  trainState.answered = false;
  document.getElementById('tr-q-mark').textContent = '?';
  document.getElementById('tr-q-hint').textContent = '点击「下一题」开始';
  document.getElementById('tr-result').innerHTML = '';
  document.getElementById('tr-options').innerHTML = '';
}

function renderTrainQuestion() {
  const q = trainState.current;
  const box = document.getElementById('tr-options');
  box.innerHTML = '';
  box.classList.toggle('is-jianpu', q.kind === 'jianpu');

  if (q.kind === 'rhythm') {
    document.getElementById('tr-q-hint').textContent =
      `${q.prompt}（一小节 16 格 · 单音色，音高不承载信息）` + (q.fromReviewQueue ? '（含复习队列题型）' : '');
    return;
  }

  if (q.kind === 'prog') {
    for (const opt of q.options) {
      const lab = progOptionLabel(opt.prog);
      const b = document.createElement('button');
      b.className = 'chip tr-opt';
      b.dataset.id = opt.id;
      // 名字就是答案，选项上只给级数走法：罗马数字 + 简谱级数
      b.innerHTML = `<b>${lab.roman}</b><i>简谱 ${lab.degrees}</i>`;
      b.addEventListener('click', () => answerTrain(opt.id));
      box.appendChild(b);
    }
    document.getElementById('tr-q-hint').textContent =
      `${q.prompt}（${q.options.length} 选 1 · 主音 ${PITCH_NAMES[q.tonicPc]}）`
      + (q.fromReviewQueue ? '（含复习队列题型）' : '');
    return;
  }

  if (q.kind === 'inversion') {
    for (const id of q.optionIds) {
      const it = getInversionItem(id);
      const b = document.createElement('button');
      b.className = 'chip tr-opt';
      b.dataset.id = id;
      b.innerHTML = `<b>${it.symbol}</b><i>${it.name}</i>`;
      b.addEventListener('click', () => answerTrain(id));
      box.appendChild(b);
    }
    document.getElementById('tr-q-hint').textContent =
      `${q.prompt}（${q.optionIds.length} 选 1 · 根音 ${PITCH_NAMES[q.rootPc]}，先别管它是什么和弦）`
      + (q.fromReviewQueue ? '（含复习队列题型）' : '');
    return;
  }

  if (q.kind === 'melody') {
    // 旋律轨没有选项：答案画在卷帘上
    document.getElementById('tr-q-hint').textContent =
      `${q.prompt}（1 = ${PITCH_NAMES[state.keyPc]} · ${q.cell}）` + (q.fromReviewQueue ? '（含复习队列题型）' : '');
    return;
  }

  if (q.kind === 'jianpu') {
    // 简谱行比芯片宽，一行一个；选项只给编号，不编号就看不出在选哪个
    q.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'jp-opt';
      b.dataset.id = opt.id;
      b.innerHTML = `<span class="jp-key">${'ABCD'[i]}</span>${lineHTML(opt.steps)}`;
      b.addEventListener('click', () => answerTrain(opt.id));
      box.appendChild(b);
    });
  } else {
    for (const id of q.optionIds) {
      const t = q.kind === 'interval' ? getTrainItemById(id) : getChordById(id);
      const b = document.createElement('button');
      b.className = 'chip tr-opt';
      b.dataset.id = id;
      b.innerHTML = `<b>${t.symbol}</b><i>${t.name}</i>`;
      b.addEventListener('click', () => answerTrain(id));
      box.appendChild(b);
    }
  }

  const picks = q.optionIds.length;
  const suffix = q.fromReviewQueue ? '（含复习队列题型）' : '';
  const head = q.kind === 'interval'
    ? `${q.prompt}（${picks} 选 1）`
    : `第 ${q.stage} 阶段 · ${picks} 选 1 · 听后选择`;
  // 还没被手势解锁时，页面刚进来出的这道题是静音的——直接告诉用户先点「重听」
  const needUnlock = engine.snapshot().contextState !== 'running';
  document.getElementById('tr-q-hint').textContent = (q.kind === 'jianpu'
    ? jianpuHintText(q)
    : head + suffix) + (needUnlock ? '　→ 先点「重听」出声（第一次点击会解锁音频）' : '');
}

// 题干里必须随时写着「1 = ?」——简谱的数字是相对音级，不写明主音这道题就没意义。
// 换调性后也要跟着变，所以渲染结果时也得调这一句。
function jianpuHintText(q) {
  return `${q.prompt}（${q.options.length} 选 1）· 1 = ${PITCH_NAMES[state.keyPc]}`
    + (q.fromReviewQueue ? '（含复习队列题型）' : '');
}

function renderTrainResult(correct, chord, v, levelReason) {
  const box = document.getElementById('tr-result');
  const cls = correct ? 'pass' : 'fail';
  const head = correct ? '✔ 答对了' : '✘ 答错了';
  box.innerHTML = `<div class="st-item ${cls}">${head} —— 正确答案：${PITCH_NAMES[v.rootMidi - 48]}${chord.symbol}（${chord.name}）｜ ${levelReason}</div>`;
  const noteBox = document.createElement('div');
  noteBox.className = 'note-list';
  v.midis.forEach((m, i) => {
    const item = document.createElement('span');
    item.className = 'note-item' + (m === v.rootMidi ? ' is-root' : '');
    item.innerHTML = `<b>${noteLabel(m)}</b><i>${v.roles[i]}</i>`;
    noteBox.appendChild(item);
  });
  box.appendChild(noteBox);
  document.getElementById('tr-q-mark').textContent = PITCH_NAMES[v.rootMidi - 48] + chord.symbol;
}

// 音程题的两音：先后播放，第二音相隔 gapBeats，听得出上下行也听得出距离
function playInterval(q) {
  const cfg = CONFIG.training.intervals;
  player.playMelody([
    { midi: q.firstMidi, startBeats: 0, durBeats: cfg.noteBeats },
    { midi: q.secondMidi, startBeats: cfg.noteBeats + cfg.gapBeats, durBeats: cfg.noteBeats },
  ]);
}

// 「键盘同步显示两音距离」：复用卷帘只读实例，两音落在真实音高上
let intervalRoll = null;

function hideIntervalVisual() {
  document.getElementById('tr-visual-host').hidden = true;
}

function showIntervalVisual(q) {
  const host = document.getElementById('tr-visual-host');
  host.hidden = false;   // 先显形：隐藏容器的 clientWidth 是 0，卷帘会把宽度算错
  if (!intervalRoll) {
    const cfg = CONFIG.training.intervals;
    intervalRoll = createRoll(
      document.getElementById('tr-visual-canvas'),
      host,
      { readOnly: true, bars: 1, lowMidi: cfg.lowMidi, highMidi: cfg.highMidi, rowHeight: 8 },
    );
  }
  intervalRoll.setNotes([
    { midi: q.firstMidi, start: 0, dur: 1, color: 'root' },
    { midi: q.secondMidi, start: 2, dur: 1, color: 'tone' },
  ]);
  intervalRoll.resize();
}

// ---------- 简谱轨：播放、揭示、批注 ----------
function playJianpu(q) {
  player.playMelody(melodyToNotes(q.target, state.keyPc));
}

let jianpuRoll = null;

function hideJianpuVisual() {
  document.getElementById('tr-jianpu-host').hidden = true;
}

// 主音（级数 1）落朱红、其余靛蓝——把「1 = 主音」这件事画在卷帘上
function jianpuNotesColored(steps) {
  const flat = melodyToNotes(steps, state.keyPc);
  let k = 0;
  return steps
    .map((s) => (s.rest ? null : { ...flat[k++], color: s.degree === 1 ? 'root' : 'tone' }))
    .filter(Boolean);
}

function showJianpuVisual(steps) {
  const host = document.getElementById('tr-jianpu-host');
  host.hidden = false;   // 先显形，否则 clientWidth 为 0
  if (!jianpuRoll) {
    jianpuRoll = createRoll(
      document.getElementById('tr-jianpu-canvas'),
      host,
      {
        readOnly: true, bars: 1, rowHeight: 6,
        lowMidi: CONFIG.keyboard.lowMidi, highMidi: CONFIG.keyboard.highMidi,
      },
    );
  }
  jianpuRoll.setNotes(jianpuNotesColored(steps));
  jianpuRoll.resize();
}

function renderJianpuResult(correct, q, levelReason) {
  const right = q.options.find((o) => o.id === q.correctOptionId);
  const picked = q.options.find((o) => o.id === trainState.pickedOptionId);
  const head = correct ? '✔ 答对了' : '✘ 答错了';
  const keyName = PITCH_NAMES[state.keyPc];
  const sub = q.stage === 2 ? `节奏：${q.cell}` : `音高：${lineText(q.target)}`;

  let html = `<div class="st-item ${correct ? 'pass' : 'fail'}">${head} —— 1 = ${keyName} ｜ ${sub} ｜ ${levelReason}</div>`;
  html += '<div class="jp-answer">';
  if (!correct && picked) {
    // 朱红只点在真正不同的那几拍上，错在哪一眼看到
    html += `<div class="jp-row"><span class="jp-tag">你选的</span>${lineHTML(picked.steps, { diffAt: diffBeats(picked.steps, right.steps) })}</div>`;
  }
  html += `<div class="jp-row"><span class="jp-tag">正确的</span>${lineHTML(right.steps)}</div>`;
  html += '</div>';
  document.getElementById('tr-result').innerHTML = html;
  document.getElementById('tr-q-hint').textContent = jianpuHintText(q);

  // 选项就地判卷：对的那条留绿框，选错的那条标朱红
  document.querySelectorAll('#tr-options .jp-opt').forEach((b) => {
    const isRight = b.dataset.id === q.correctOptionId;
    const isPicked = b.dataset.id === trainState.pickedOptionId;
    b.disabled = true;
    if (isRight) b.classList.add('is-correct');
    if (isPicked) b.classList.add('is-picked');
    if (isPicked && !isRight) b.classList.add('is-wrong');
  });

  showJianpuVisual(right.steps);
  document.getElementById('tr-q-mark').textContent = '简谱';
}

// ---------- 旋律重建轨：目标藏在耳朵里，作答发生在卷帘上 ----------
let melodyRoll = null;

function ensureMelodyRoll() {
  const host = document.getElementById('tr-melody-host');
  host.hidden = false;   // 先显形，否则 clientWidth 为 0，卷帘宽度会算错
  if (!melodyRoll) {
    const cfg = CONFIG.training.melody;
    melodyRoll = createRoll(document.getElementById('tr-melody-canvas'), host, {
      bars: cfg.bars, lowMidi: cfg.lowMidi, highMidi: cfg.highMidi, rowHeight: cfg.rowHeight,
    });
    melodyRoll.setSnap(cfg.snap);
    melodyRoll.setBpm(trainState.melodyBpm);
    melodyRoll.setLoop(false);
  }
  return melodyRoll;
}

// 目标旋律：记号 → 统一音符模型，主音由上方调性切换器决定
function melodyTargetNotes(q) {
  return melodyToNotes(q.steps, state.keyPc);
}

function playMelodyQuestion(q) {
  // 变速试听：慢速是旋律重建的主要练习手段，速度一处决定重听与卷帘播放
  player.playMelody(melodyTargetNotes(q), { bpm: trainState.melodyBpm });
}

function startMelodyQuestion(q) {
  const roll = ensureMelodyRoll();
  roll.setGhost([]);
  roll.clear();
  roll.resize();
  document.getElementById('btn-tr-submit').hidden = false;
  document.getElementById('btn-tr-export').hidden = true;
  playMelodyQuestion(q);
}

async function submitMelody() {
  const q = trainState.current;
  if (!q || q.kind !== 'melody' || trainState.answered) return;
  const roll = ensureMelodyRoll();
  const mine = roll.getNotes().map((n) => ({ midi: n.midi, startBeats: n.start, durBeats: n.dur }));
  const want = melodyTargetNotes(q);
  const diff = diffMelody(mine, want);

  trainState.answered = true;
  const now = Date.now();
  const ok = diff.perfect;
  const rec = applySrs(trainState.srs[q.targetId], ok, now);
  rec.typeId = q.targetId;
  trainState.srs[q.targetId] = rec;
  await saveQuietly('training', () => idbPut('training', rec));
  const answer = {
    track: 'melody', stage: q.stage, typeId: q.targetId,
    rootPc: state.keyPc, correct: ok, level: q.level, ts: now,
  };
  trainState.answers.push(answer);
  await saveQuietly('answers', () => idbPut('answers', answer));

  const stageAnswers = trainState.answers.filter(
    (a) => a.stage === q.stage && (a.track || 'chord') === 'melody',
  );
  const adj = adjustLevel(stageAnswers.map((a) => ({ correct: a.correct })), trainState.level);
  trainState.lastVerdict = { correct: ok, reason: adj.reason };
  if (adj.level !== trainState.level) {
    trainState.level = adj.level;
    trainState.levels[q.stage] = adj.level;
    await saveQuietly('meta', () => idbPut('meta', { key: trackCfg().levelKey, value: trainState.levels }));
  }

  roll.setGhost(want);   // 目标以描边幽灵块压在真实音符下面，错位一眼可见
  renderMelodyResult(diff, q, adj.reason);
  renderTrainStats();
}

function renderMelodyResult(diff, q, reason) {
  const head = diff.perfect ? '✔ 完全还原' : '✘ 还没对上';
  let html = `<div class="st-item ${diff.perfect ? 'pass' : 'fail'}">${head} —— 三维命中 ${diff.hit}/${diff.total} ｜ 1 = ${PITCH_NAMES[state.keyPc]} ｜ 节奏：${q.cell} ｜ ${reason}</div>`;
  html += '<div class="jp-answer">';
  // 目标同时给出简谱：听→做之后再看一眼记号，这一课才算闭上
  html += `<div class="jp-row"><span class="jp-tag">原曲简谱</span>${lineHTML(q.steps)}</div>`;
  for (const r of diff.rows) {
    if (r.status === 'extra') {
      html += `<div class="jp-row"><span class="jp-tag">第 ${r.index} 音</span><span class="mel-line is-diff">多放了 ${noteLabel(r.user.midi)}</span></div>`;
      continue;
    }
    if (r.status === 'missing') {
      html += `<div class="jp-row"><span class="jp-tag">第 ${r.index} 音</span><span class="mel-line is-diff">漏了 ${noteLabel(r.target.midi)}</span></div>`;
      continue;
    }
    const flags = [
      r.pitchOk ? null : `音高 ${noteLabel(r.user.midi)} → ${noteLabel(r.target.midi)}`,
      r.startOk ? null : `起点 ${r.user.startBeats} → ${r.target.startBeats} 拍`,
      r.durOk ? null : `时值 ${r.user.durBeats} → ${r.target.durBeats} 拍`,
    ].filter(Boolean);
    if (flags.length === 0) continue;   // 全对的音不啰嗦
    html += `<div class="jp-row"><span class="jp-tag">第 ${r.index} 音</span><span class="mel-line is-diff">${flags.join('　')}</span></div>`;
  }
  if (diff.perfect) {
    html += '<div class="jp-row"><span class="jp-tag">—</span><span class="mel-line">音高、起点、时值，三个维度全中。</span></div>';
  }
  html += '</div>';
  document.getElementById('tr-result').innerHTML = html;
  document.getElementById('tr-q-mark').textContent = '旋律';
  document.getElementById('btn-tr-export').hidden = false;
}

// 重建出来的这一小节直接落成 .mid，拖进 FL 就能接着编
function exportMelody() {
  if (!melodyRoll) return;
  const notes = melodyRoll.getNotes().map((n) => ({ midi: n.midi, startBeats: n.start, durBeats: n.dur }));
  if (notes.length === 0) return;
  downloadSMF(buildSMF({ notes, trackName: 'JIANTING' }), `JIANTING_melody_${PITCH_NAMES[state.keyPc]}.mid`);
}

// ---------- 节奏轨：单音色 + 十六分网格作答 ----------
// ---------- 进行轨：听整条进行的级数走法 ----------
// 转位题的成绩：把「低音是谁」这件事连同根音一起摆出来
function renderInversionResult(correct, q, levelReason) {
  const chord = getChordById(q.typeId);
  const v = chordVoicing(q.rootPc, chord, q.inversion);
  const it = getInversionItem(q.targetId);
  const head = correct ? '✔ 答对了' : '✘ 答错了';
  let html = `<div class="st-item ${correct ? 'pass' : 'fail'}">${head} —— 正确答案：${it.symbol} ｜ ${PITCH_NAMES[q.rootPc]}${chord.symbol}（${chord.name}） ｜ ${levelReason}</div>`;
  html += '<div class="jp-answer">';
  html += `<div class="jp-row"><span class="jp-tag">根音</span><span class="mel-line">${noteLabel(v.rootNoteMidi)}（${chord.roles[0]}）</span></div>`;
  html += `<div class="jp-row"><span class="jp-tag">低音</span><span class="mel-line${v.isInversion ? ' is-diff' : ''}">${noteLabel(v.bassMidi)}（${v.roles[0]}）${v.isInversion ? ' ← 低音不是根音，所以是转位' : ' ← 低音就是根音'}</span></div>`;
  html += `<div class="jp-row"><span class="jp-tag">构成音</span><span class="mel-line">${v.midis.map((m, i) => `${noteLabel(m)}/${v.roles[i]}`).join('　')}</span></div>`;
  if (!correct) {
    const picked = getInversionItem(trainState.pickedOptionId);
    html += `<div class="jp-row"><span class="jp-tag">你选的</span><span class="mel-line is-diff">${picked.symbol}（${picked.name}）</span></div>`;
  }
  html += '</div>';
  document.getElementById('tr-result').innerHTML = html;
  document.getElementById('tr-q-mark').textContent = it.symbol;
}

function playProgQuestion(q) {
  player.playMelody(progressionFlatNotes(progressionNotes(q.target, q.tonicPc)));
}

function renderProgTrainResult(correct, q, levelReason) {
  const data = progressionNotes(q.target, q.tonicPc);
  const head = correct ? '✔ 答对了' : '✘ 答错了';
  let html = `<div class="st-item ${correct ? 'pass' : 'fail'}">${head} —— 正确答案：${q.target.name} ｜ 主音 ${PITCH_NAMES[q.tonicPc]} ｜ ${levelReason}</div>`;
  html += '<div class="jp-answer">';
  if (!correct) {
    const picked = q.options.find((o) => o.id === trainState.pickedOptionId);
    if (picked) {
      html += `<div class="jp-row"><span class="jp-tag">你选的</span><span class="mel-line is-diff">${progOptionLabel(picked.prog).roman} ｜ ${picked.prog.name}</span></div>`;
    }
  }
  for (const st of data.steps) {
    html += `<div class="jp-row"><span class="jp-tag">${st.roman}</span><span class="mel-line">${st.label} ｜ 简谱 ${jianpuDegree(st.rootPc, q.tonicPc).label} ｜ ${st.midis.map(noteLabel).join(' ')}</span></div>`;
  }
  html += '</div>';
  document.getElementById('tr-result').innerHTML = html;
  document.getElementById('tr-q-mark').textContent = progOptionLabel(q.target).roman;
}

function playRhythm(q) {
  const cfg = CONFIG.training.rhythm;
  player.playMelody(patternToNotes(q.pattern, cfg.cellMidi, { accentMidi: cfg.accentMidi }));
}

function renderRhythmGrid(answered) {
  const box = document.getElementById('tr-rhythm-grid');
  const q = trainState.current;
  const target = answered && q && q.kind === 'rhythm' ? onsetCells(q.pattern) : [];
  box.innerHTML = '';
  for (let c = 0; c < GRID_CELLS; c++) {
    const b = document.createElement('button');
    b.className = 'rh-cell' + (c % 4 === 0 ? ' at-beat' : '')
      + (trainState.rhythmCells.has(c) ? ' on' : '')
      + (target.includes(c) ? ' target' : '');
    b.dataset.cell = String(c);
    b.disabled = answered;
    b.title = cellLabel(c);
    b.setAttribute('aria-label', cellLabel(c));
    b.addEventListener('click', () => {
      if (trainState.answered) return;
      if (trainState.rhythmCells.has(c)) trainState.rhythmCells.delete(c);
      else trainState.rhythmCells.add(c);
      renderRhythmGrid(false);
    });
    box.appendChild(b);
  }
}

function startRhythmQuestion(q) {
  resetRhythmGrid();
  document.getElementById('btn-tr-submit').hidden = false;
  document.getElementById('btn-tr-export').hidden = true;
  playRhythm(q);
}

// 切到节奏轨时先把网格摆出来（还没出题，只有空格子）
function resetRhythmGrid() {
  trainState.rhythmCells = new Set();
  document.getElementById('tr-rhythm-host').hidden = false;
  renderRhythmGrid(false);
}

async function submitRhythm() {
  const q = trainState.current;
  if (!q || q.kind !== 'rhythm' || trainState.answered) return;
  const mine = [...trainState.rhythmCells].sort((a, b) => a - b);
  const diff = diffOnsets(mine, onsetCells(q.pattern));

  trainState.answered = true;
  const now = Date.now();
  const ok = diff.perfect;
  const rec = applySrs(trainState.srs[q.targetId], ok, now);
  rec.typeId = q.targetId;
  trainState.srs[q.targetId] = rec;
  await saveQuietly('training', () => idbPut('training', rec));
  const answer = {
    track: 'rhythm', stage: q.stage, typeId: q.targetId,
    rootPc: CONFIG.training.rhythm.cellMidi % 12, correct: ok, level: q.level, ts: now,
  };
  trainState.answers.push(answer);
  await saveQuietly('answers', () => idbPut('answers', answer));

  const stageAnswers = trainState.answers.filter(
    (a) => a.stage === q.stage && (a.track || 'chord') === 'rhythm',
  );
  const adj = adjustLevel(stageAnswers.map((a) => ({ correct: a.correct })), trainState.level);
  trainState.lastVerdict = { correct: ok, reason: adj.reason };
  if (adj.level !== trainState.level) {
    trainState.level = adj.level;
    trainState.levels[q.stage] = adj.level;
    await saveQuietly('meta', () => idbPut('meta', { key: trackCfg().levelKey, value: trainState.levels }));
  }

  renderRhythmGrid(true);
  renderRhythmResult(diff, q, adj.reason);
  renderTrainStats();
}

function renderRhythmResult(diff, q, reason) {
  const head = diff.perfect ? '✔ 完全对上' : '✘ 还没对上';
  const say = (cells) => cells.map((c) => cellLabel(c)).join('、') || '—';
  let html = `<div class="st-item ${diff.perfect ? 'pass' : 'fail'}">${head} —— 起音命中 ${diff.hit}/${diff.total} ｜ 节奏型：${q.pattern.symbol}（${q.pattern.name}） ｜ ${reason}</div>`;
  html += '<div class="jp-answer">';
  html += `<div class="jp-row"><span class="jp-tag">抢拍</span><span class="mel-line${diff.extra.length ? ' is-diff' : ''}">${say(diff.extra)}</span></div>`;
  html += `<div class="jp-row"><span class="jp-tag">漏拍</span><span class="mel-line${diff.missing.length ? ' is-diff' : ''}">${say(diff.missing)}</span></div>`;
  html += `<div class="jp-row"><span class="jp-tag">目标</span><span class="mel-line">${say(onsetCells(q.pattern))}</span></div>`;
  html += '</div>';
  document.getElementById('tr-result').innerHTML = html;
  document.getElementById('tr-q-mark').textContent = q.pattern.symbol;
}

function renderIntervalResult(correct, q, levelReason) {
  const item = getTrainItemById(q.targetId);
  const cls = correct ? 'pass' : 'fail';
  const head = correct ? '✔ 答对了' : '✘ 答错了';
  const pair = `${noteLabel(q.firstMidi)} → ${noteLabel(q.secondMidi)}`;
  const motion = q.semitones === 0 ? '同音' : `${q.ascending ? '上行' : '下行'} ${q.semitones} 半音`;
  const answerText = q.stage === 1 ? `${item.symbol}（${item.name}）` : `${item.symbol} ${item.name}`;
  document.getElementById('tr-result').innerHTML =
    `<div class="st-item ${cls}">${head} —— 正确答案：${answerText} ｜ ${pair} · ${motion} ｜ ${levelReason}</div>`;
  showIntervalVisual(q);
  document.getElementById('tr-q-mark').textContent = item.symbol;
}

async function nextQuestion() {
  await ensureUnlocked();
  if (!trainState.loaded) await loadTrainStage();
  const params = { stage: trainState.stage, srs: trainState.srs, level: trainState.level };
  const q = PICKERS[trainState.track](params);
  trainState.current = q;
  trainState.answered = false;
  trainState.currentVoicing = null;
  trainState.pickedOptionId = null;
  if (q.kind === 'rhythm') {
    startRhythmQuestion(q);
  } else if (q.kind === 'prog') {
    playProgQuestion(q);
  } else if (q.kind === 'melody') {
    startMelodyQuestion(q);
  } else if (q.kind === 'jianpu') {
    playJianpu(q);
  } else if (q.kind === 'interval') {
    playInterval(q);
  } else if (q.kind === 'inversion') {
    const v = chordVoicing(q.rootPc, getChordById(q.typeId), q.inversion);
    trainState.currentVoicing = v;
    player.playChord(v.midis, { durationBeats: CONFIG.chords.blockDurationBeats });
  } else {
    const v = chordVoicing(q.rootPc, getChordById(q.targetId));
    trainState.currentVoicing = v;
    player.playChord(v.midis, { durationBeats: CONFIG.chords.blockDurationBeats });
  }
  document.getElementById('tr-q-mark').textContent = '?';
  document.getElementById('tr-result').innerHTML = '';
  hideIntervalVisual();
  hideJianpuVisual();
  if (q.kind !== 'melody') document.getElementById('tr-melody-host').hidden = true;
  if (q.kind !== 'rhythm') document.getElementById('tr-rhythm-host').hidden = true;
  renderTrainQuestion();
}

async function answerTrain(optionId) {
  const q = trainState.current;
  if (!q || trainState.answered) return;
  trainState.answered = true;
  trainState.pickedOptionId = optionId;
  const correct = optionId === (q.correctOptionId ?? q.targetId);
  const now = Date.now();
  const rec = applySrs(trainState.srs[q.targetId], correct, now);
  rec.typeId = q.targetId;
  trainState.srs[q.targetId] = rec;
  await saveQuietly('training', () => idbPut('training', rec));
  const answer = {
    track: trainState.track, stage: q.stage, typeId: q.targetId,
    rootPc: q.rootPc ?? q.firstMidi ?? state.keyPc, correct, level: q.level, ts: now,
  };
  trainState.answers.push(answer);
  await saveQuietly('answers', () => idbPut('answers', answer));
  const stageAnswers = trainState.answers.filter(
    (a) => a.stage === trainState.stage && (a.track || 'chord') === trainState.track,
  );
  const adj = adjustLevel(stageAnswers.map((a) => ({ correct: a.correct })), trainState.level);
  trainState.lastVerdict = { correct, reason: adj.reason };
  if (adj.level !== trainState.level) {
    trainState.level = adj.level;
    trainState.levels[trainState.stage] = adj.level;
    await saveQuietly('meta', () => idbPut('meta', { key: trackCfg().levelKey, value: trainState.levels }));
  }
  if (q.kind === 'jianpu') {
    renderJianpuResult(correct, q, adj.reason);
  } else if (q.kind === 'prog') {
    renderProgTrainResult(correct, q, adj.reason);
  } else if (q.kind === 'inversion') {
    renderInversionResult(correct, q, adj.reason);
  } else if (q.kind === 'interval') {
    renderIntervalResult(correct, q, adj.reason);
  } else {
    renderTrainResult(correct, getChordById(q.targetId), trainState.currentVoicing, adj.reason);
  }
  renderTrainStats();
}

function replayQuestion() {
  const q = trainState.current;
  if (q && q.kind === 'inversion') {
    player.playChord(trainState.currentVoicing.midis, { durationBeats: CONFIG.chords.blockDurationBeats });
    return;
  }
  if (q && q.kind === 'prog') { playProgQuestion(q); return; }
  if (q && q.kind === 'rhythm') { playRhythm(q); return; }
  if (q && q.kind === 'melody') { playMelodyQuestion(q); return; }
  if (q && q.kind === 'jianpu') { playJianpu(q); return; }
  if (q && q.kind === 'interval') { playInterval(q); return; }
  if (!trainState.currentVoicing) return;
  player.playChord(trainState.currentVoicing.midis, { durationBeats: CONFIG.chords.blockDurationBeats });
}

function renderTrainWeak() {
  const box = document.getElementById('tr-weak');
  const weak = trackItems(trainState.stage).filter((it) => isWeak(trainState.srs[it.id]));
  if (weak.length === 0) { box.innerHTML = '暂无数据'; return; }
  box.innerHTML = '';
  for (const it of weak) {
    const rec = trainState.srs[it.id];
    const el = document.createElement('span');
    el.className = 'note-item';
    el.innerHTML = `<b>${it.symbol}</b><i>${rec.correct}/${rec.seen} · ${Math.round((rec.correct / rec.seen) * 100)}%</i>`;
    box.appendChild(el);
  }
}

async function setTrainTrack(track) {
  if (trainState.track === track) return;
  trainState.track = track;
  trainState.stage = 1;
  document.getElementById('tr-track-chord').classList.toggle('active', track === 'chord');
  document.getElementById('tr-track-interval').classList.toggle('active', track === 'interval');
  document.getElementById('tr-track-jianpu').classList.toggle('active', track === 'jianpu');
  document.getElementById('tr-track-melody').classList.toggle('active', track === 'melody');
  document.getElementById('tr-track-rhythm').classList.toggle('active', track === 'rhythm');
  document.getElementById('tr-track-prog').classList.toggle('active', track === 'prog');
  const HINTS = {
    chord: '听和弦 → 选类型。错题自动进入复习队列优先出现；连对升级（选项变多）、连错降级。',
    interval: '听两个音 → 选中答案。一阶段只问「更高 / 更低 / 相同」，不给任何术语；二阶段才认音程名。答完在下方卷帘上看到两音的真实位置与距离。',
    jianpu: '听一小节 → 选出对应的简谱。一阶段节奏不动、只听音高走向（含八度点）；二阶段音高不动、只听节奏（八分 / 附点 / 休止）。答完在下方卷帘上看到每个数字落在哪个键上，主音是朱红块。换上方调性，同一串数字就是另一组音高——这就是首调。',
    melody: '听一小节，在下方卷帘上把音符放回去。左键空白画音符、拖音符移动、拖右缘改时值、右键删除；点「对答案」后目标会以描边幽灵块压在下面，并逐音告诉你音高 / 起点 / 时值差在哪。对完可以把自己重建的这段直接导出 MIDI，拖进 FL 接着编。',
    rhythm: '听一小节鼓点，在下方网格上把起音点出来。全曲同一个音高（只有第一拍高一档，那是强弱拍参照），所以听到的只有节奏。一小节 16 格、每 4 格一拍；点「对答案」后目标起音会以朱红下划线标在格子上，并列出你抢拍和漏拍的位置。',
    prog: '听一整条和弦进行 → 选出它的级数走法。选项只给级数（罗马数字 + 简谱），不给进行名字——名字是答案。答完会把整条进行拆开列出：每一步的级数、和弦名与构成音。',
  };
  document.getElementById('tr-hint').textContent = HINTS[track];
  document.getElementById('tr-options').classList.toggle('is-jianpu', false);
  hideIntervalVisual();
  hideJianpuVisual();
  const isMelody = track === 'melody';
  const isRhythm = track === 'rhythm';
  document.getElementById('btn-tr-submit').hidden = !(isMelody || isRhythm);
  document.getElementById('btn-tr-export').hidden = true;
  if (isMelody) ensureMelodyRoll();
  else document.getElementById('tr-melody-host').hidden = true;
  document.getElementById('tr-melody-bar').hidden = !isMelody;
  if (isRhythm) resetRhythmGrid();
  else document.getElementById('tr-rhythm-host').hidden = true;
  trainState.loaded = false;
  await loadTrainStage();
}

document.getElementById('tr-track-chord').addEventListener('click', () => setTrainTrack('chord'));
document.getElementById('tr-track-interval').addEventListener('click', () => setTrainTrack('interval'));
document.getElementById('tr-track-jianpu').addEventListener('click', () => setTrainTrack('jianpu'));
document.getElementById('tr-track-melody').addEventListener('click', () => setTrainTrack('melody'));
document.getElementById('tr-track-rhythm').addEventListener('click', () => setTrainTrack('rhythm'));
document.getElementById('tr-track-prog').addEventListener('click', () => setTrainTrack('prog'));
document.getElementById('btn-tr-submit').addEventListener('click', () => {
  if (trainState.track === 'rhythm') submitRhythm();
  else submitMelody();
});
document.getElementById('btn-tr-export').addEventListener('click', exportMelody);

// 变速 + 循环试听：驱动训练页的旋律重建卷帘，重听也跟着走同一个速度
document.getElementById('tr-melody-bpm').addEventListener('change', (e) => {
  trainState.melodyBpm = Number(e.target.value) || 90;
  if (melodyRoll) melodyRoll.setBpm(trainState.melodyBpm);
  if (trainState.current && trainState.current.kind === 'melody') playMelodyQuestion(trainState.current);
});
document.getElementById('tr-melody-loop').addEventListener('change', (e) => {
  if (melodyRoll) melodyRoll.setLoop(e.target.checked);
});
document.getElementById('btn-tr-next').addEventListener('click', nextQuestion);
document.getElementById('btn-tr-replay').addEventListener('click', replayQuestion);

// ---------- 卷帘编辑页 ----------
let rollApi = null;       // createRoll 实例（首次进入卷帘页时初始化）
let rollLoaded = null;    // 上次编辑内容加载完成的 Promise（防竞态）

function rollChanged() { // 卷帘任何提交型改动：刷新状态行 + 立即自动保存（数据量小，防抖反而在快速刷新时丢数据）
  document.getElementById('roll-status').textContent =
    `${rollApi.noteCount()} 个音符 ｜ 已自动保存 ${new Date().toLocaleTimeString()}`;
  idbPut('editor', { key: 'roll', notes: rollApi.getNotes(), bpm: rollApi.getBpm(), bars: rollApi.getBars(), snap: rollApi.getSnap() }).catch(() => {});
}

function initRoll() {
  if (rollApi) return rollLoaded; // 已初始化：等待加载完成（防"追加被异步覆盖"竞态）
  rollApi = createRoll(document.getElementById('roll-canvas'), document.getElementById('roll-host'), {
    onChange: rollChanged,
  });
  // 读取上次编辑内容（加载完成前，外部对卷帘的修改会排队等待）
  rollLoaded = idbGet('editor', 'roll').then((saved) => {
    if (saved && Array.isArray(saved.notes) && saved.notes.length) {
      rollApi.setNotes(saved.notes);
      if (saved.bpm) { rollApi.setBpm(saved.bpm); document.getElementById('roll-bpm').value = saved.bpm; }
      if (saved.bars) { rollApi.setBars(saved.bars); document.getElementById('roll-bars').value = String(saved.bars); }
      if (saved.snap) { rollApi.setSnap(saved.snap); document.getElementById('roll-snap').value = String(saved.snap); }
    }
    rollChanged();
  }).catch(() => { rollChanged(); });
  window.addEventListener('resize', () => { if (currentPage === 'roll') rollApi.resize(); });
  return rollLoaded;
}

function stopRollPlayback() {
  if (!rollApi) return;
  rollApi.stop();
  const btn = document.getElementById('btn-roll-play');
  btn.textContent = '播放';
  btn.classList.add('primary');
}

// 查询页：当前和弦加入卷帘末尾（占一小节）
document.getElementById('btn-add-roll').addEventListener('click', async () => {
  await initRoll(); // 等待上次内容加载完成，避免追加被覆盖
  const chord = getChordById(state.typeId);
  const v = chordVoicing(state.rootPc, chord, state.inversion);
  rollApi.addNotes(v.midis.map((m) => ({ midi: m, start: 0, dur: 4 })));
  showPage('roll'); // 跳过去看看刚加入的音符
});

// 进行页：整条进行复制到卷帘（覆盖卷帘内容，可撤销）
document.getElementById('btn-prog-to-roll').addEventListener('click', async () => {
  await initRoll();
  const prog = getProgressionById(state.progId);
  const data = progressionNotes(prog, state.tonicPc);
  rollApi.setNotes(progressionFlatNotes(data).map((n) => ({ midi: n.midi, start: n.startBeats, dur: n.durBeats })));
  showPage('roll');
});

document.getElementById('btn-roll-play').addEventListener('click', async () => {
  await initRoll();
  if (rollApi.isPlaying()) { stopRollPlayback(); return; }
  await ensureUnlocked();
  if (rollApi.play()) {
    const btn = document.getElementById('btn-roll-play');
    btn.textContent = '停止';
    btn.classList.remove('primary');
  }
});
document.getElementById('roll-loop').addEventListener('change', (e) => { if (rollApi) rollApi.setLoop(e.target.checked); });
document.getElementById('roll-bpm').addEventListener('change', (e) => { if (rollApi) rollApi.setBpm(parseInt(e.target.value, 10) || CONFIG.music.bpm); });
document.getElementById('roll-bars').addEventListener('change', (e) => { if (rollApi) rollApi.setBars(parseInt(e.target.value, 10) || 8); });
document.getElementById('roll-snap').addEventListener('change', (e) => { if (rollApi) rollApi.setSnap(parseFloat(e.target.value) || 0.5); });
document.getElementById('btn-roll-undo').addEventListener('click', async () => { await initRoll(); rollApi.undo(); });
document.getElementById('btn-roll-clear').addEventListener('click', async () => { await initRoll(); rollApi.clear(); });
document.getElementById('btn-roll-export').addEventListener('click', async () => {
  await initRoll();
  if (rollApi.noteCount() === 0) return;
  const bytes = buildSMF({ notes: rollApi.getNotes().map((n) => ({ midi: n.midi, startBeats: n.start, durBeats: n.dur, velocity: n.velocity })), bpm: rollApi.getBpm(), trackName: 'JIANTING' });
  downloadSMF(bytes, `ChordLab_roll_${rollApi.getBpm()}bpm.mid`);
});
// Ctrl+Z 撤销（卷帘页可见时生效）
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && currentPage === 'roll' && rollApi) {
    e.preventDefault();
    rollApi.undo();
  }
});

// ---------- 引擎自检（程序化检查） ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSelfTest() {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass, detail });

  try {
    // 1. 音频上下文
    const snap = await ensureUnlocked();
    check('音频上下文已创建且 running', engine.ctx && engine.ctx.state === 'running',
      `contextState=${snap.contextState}`);

    // 2. 采样加载状态
    check('采样加载状态正常', [ENGINE_STATE.READY, ENGINE_STATE.PARTIAL, ENGINE_STATE.SYNTH].includes(engine.state),
      `state=${snap.state}, loaded=${snap.loaded}/${snap.total}, failed=[${snap.failed.join(',')}]`);

    // 3. 重映射数学
    const r1 = notes.playbackRate(60, 60);
    const mathOk = r1 === 1
      && Math.abs(notes.playbackRate(61, 60) - Math.pow(2, 1 / 12)) < 1e-9
      && notes.nearestSampleMidi(61, [60, 63]) === 60;
    check('重映射数学正确', mathOk, `rate(60←60)=${r1}`);

    // 4. 和弦声位与角色映射（字典核心）
    const maj7 = getChordById('maj7');
    const cMaj7 = chordVoicing(0, maj7);
    const f13 = getChordById('13');
    const b13 = chordVoicing(11, f13); // B13：最高延伸音应在音域内
    const chordOk = JSON.stringify(cMaj7.midis) === JSON.stringify([48, 52, 55, 59])
      && cMaj7.roles.length === cMaj7.midis.length
      && b13.midis.length === 6
      && b13.midis[b13.midis.length - 1] === 80
      && b13.midis.every((m) => m >= 48 && m <= 84)
      && CHORD_TYPES.length === 39;
    check('和弦声位与角色映射正确（Cmaj7=[48,52,55,59]，B13 顶音=80，字典 39 种）', chordOk,
      `Cmaj7=[${cMaj7.midis}], B13=[${b13.midis}], types=${CHORD_TYPES.length}`);

    // 5. 音名换算
    const nameOk = notes.noteNameToMidi('C4') === 60 && notes.midiToName(61) === 'Cs4'
      && Math.abs(notes.midiToFreq(69) - 440) < 1e-6;
    check('音名↔MIDI↔频率换算正确', nameOk, `C4=${notes.noteNameToMidi('C4')}, freq(A4)=${notes.midiToFreq(69)}`);

    // 5.5 情绪分类覆盖（每个和弦至少归入一个情绪，索引 id 合法）
    const moodIds = new Set(CHORD_MOODS.map((m) => m.id));
    const covered = new Set();
    for (const m of CHORD_MOODS) {
      for (const id of (MOOD_INDEX[m.id] || [])) {
        getChordById(id); // id 非法会抛错
        covered.add(id);
      }
    }
    const moodOk = covered.size === CHORD_TYPES.length && CHORD_TYPES.every((t) => covered.has(t.id));
    check('情绪分类覆盖全部 39 种且索引合法', moodOk,
      `情绪数=${CHORD_MOODS.length}, 覆盖=${covered.size}/${CHORD_TYPES.length}`);

    // 6. 和弦进行结构 + 罗马数字
    const pop = PROGRESSIONS.find((p) => p.id === 'pop');
    const popData = progressionNotes(pop, 0);
    const progOk = JSON.stringify(popData.steps.map((s) => s.roman)) === JSON.stringify(['I', 'V', 'vi', 'IV'])
      && popData.steps[0].midis[0] === 48 && popData.totalBeats === 16
      && PROGRESSIONS.every((p) => p.steps.every((s) => {
        getChordById(s.type); // 非法类型会抛错
        return s.root >= 0 && s.root <= 11 && s.beats > 0;
      }));
    check('进行结构与罗马数字正确（I-V-vi-IV @C）', progOk,
      `romans=[${popData.steps.map((s) => s.roman)}], totalBeats=${popData.totalBeats}, 进行数=${PROGRESSIONS.length}`);

    // 7. MIDI 导出：SMF 字节结构（真实编码，非 JSON 改名）
    const { midis: midiCheckNotes } = chordVoicing(0, getChordById('maj7'));
    const smf = buildSMF({ notes: midiCheckNotes.map((m) => ({ midi: m, startBeats: 0, durBeats: 3 })) });
    const info = smfInfo(smf);
    const midiOk = info.structOk && info.noteOn === 4 && info.noteOff === 4 && info.totalTicks === 3 * CONFIG.midi.ppq
      && info.format === 0 && info.ntrks === 1 && info.ppq === CONFIG.midi.ppq;
    check('SMF 导出字节结构正确（头/轨/音符对/结束标记）', midiOk,
      `bytes=${info.bytesLen}, noteOn=${info.noteOn}, noteOff=${info.noteOff}, ticks=${info.totalTicks}, ppq=${info.ppq}, error=${info.error || '无'}`);

    // 7.5 训练核心逻辑（出题/SRS/调级）
    const q = pickQuestion({ stage: 1, srs: {}, level: 1, rng: () => 0 });
    const trOk = q.optionIds.includes(q.targetId) && new Set(q.optionIds).size === q.optionIds.length
      && q.optionIds.length === CONFIG.training.optionsByLevel[1]
      && q.rootPc >= 0 && q.rootPc <= 11;
    let rec = applySrs(null, true, 1000);
    rec = applySrs(rec, true, 2000);
    const srsOk = rec.intervalMs === CONFIG.training.srs.baseIntervalMs * 2 && rec.streakRight === 2;
    const up = adjustLevel([{ correct: true }, { correct: true }, { correct: true }, { correct: true }], 1);
    const insufficient = adjustLevel([{ correct: true }, { correct: true }, { correct: true }], 1);
    const down = adjustLevel([{ correct: true }, { correct: true }, { correct: false }, { correct: false }], 2);
    const levelOk = up.level === 2 && insufficient.level === 1 && insufficient.reason.includes('数据不足') && down.level === 1;
    check('训练逻辑：出题含目标/选项数符合等级/SRS 翻倍/调级规则', trOk && srsOk && levelOk,
      `options=${q.optionIds.length}, interval=${rec.intervalMs}ms, 升级=${up.level}, 不足=${insufficient.reason}, 连错降=${down.level}`);

    // 6. 单音发声与自然结束（先等此前余音的声部登记注销，避免计数混入旧声部）
    player.stopAll();
    await sleep(CONFIG.audio.residualCheckDelayMs);
    engine.playMidi(60, engine.now() + 0.001, 1.0);
    const voiceAfterPlay = engine.voices.size;
    await sleep(1800);
    check('单音播放：登记 1 个声部并自然结束清零', voiceAfterPlay === 1 && engine.voices.size === 0,
      `播放后=${voiceAfterPlay}, 1.8s后=${engine.voices.size}`);

    // 7. 柱式和弦复音 + 停止无残留
    player.stopAll();
    const { midis: maj7Notes } = chordVoicing(0, maj7);
    player.playChord(maj7Notes, { durationBeats: CONFIG.chords.blockDurationBeats });
    await sleep(250);
    const chordVoices = engine.voices.size;
    const rmsPlaying = engine.getRms();
    player.stopAll();
    await sleep(CONFIG.audio.residualCheckDelayMs);
    const rmsStopped = engine.getRms();
    check('柱式和弦：4 复音发声，停止后 RMS 归零',
      chordVoices === 4 && rmsPlaying > 0.001 && rmsStopped < CONFIG.audio.residualRmsThreshold && engine.voices.size === 0,
      `声部=${chordVoices}, 发声RMS=${rmsPlaying.toFixed(5)}, 停止后RMS=${rmsStopped.toFixed(6)}`);

    // 8. 琶音：依次发声、总时长正确
    player.stopAll();
    const arp = player.playArpeggio(maj7Notes);
    const expectSec = notes.beatsToSeconds((maj7Notes.length - 1) * CONFIG.chords.arpeggioStepBeats + CONFIG.chords.arpeggioNoteBeats);
    const arpOk = Math.abs(arp.totalSec - expectSec) < 1e-6;
    player.stopAll();
    check('琶音：时长=步长×(n-1)+音长', arpOk, `totalSec=${arp.totalSec.toFixed(4)}, expect=${expectSec.toFixed(4)}`);

    // 9. 全局错误
    check('无全局 JS 错误', window.__chordlabErrors.length === 0, window.__chordlabErrors.join('；') || '无');
  } catch (e) {
    check('自检流程异常', false, String(e && e.stack || e));
  }

  window.__lastSelfTest = results;
  const box = document.getElementById('selftest-results');
  box.innerHTML = '';
  for (const r of results) {
    const div = document.createElement('div');
    div.className = 'st-item ' + (r.pass ? 'pass' : 'fail');
    div.textContent = `${r.pass ? '✔' : '✘'} ${r.name} —— ${r.detail}`;
    box.appendChild(div);
  }
  const manual = document.createElement('div');
  manual.className = 'st-manual';
  manual.textContent = '待人工验证（无法自动判定）：采样音质与音高听感、柱式/琶音/进行的和声听感、真实删除采样后的降级提示、切标签页/关页后无残留声、MIDI 文件下载与 FL Studio 导入（字节结构已自动校验；请在你的浏览器里点击导出后用 FL Studio 打开验证）。';
  box.appendChild(manual);
  return results;
}
document.getElementById('btn-selftest').addEventListener('click', () => { runSelfTest(); });

// 切页面/隐藏标签页时停止一切声音（防残留）
window.addEventListener('pagehide', () => engine.stopAll());
document.addEventListener('visibilitychange', () => { if (document.hidden) engine.stopAll(); });

// 初始渲染 + 调试句柄
renderKeySwitcher();
renderRoots();
renderViewToggle();
renderTypes();
renderDetail();
renderProgList();
renderProgTonics();
renderProgDetail();
window.chordlab = {
  CONFIG, engine, player, notes,
  chords: { CHORD_TYPES, CHORD_GROUPS, CHORD_MOODS, MOOD_INDEX, getChordById, chordVoicing, chordFormula, chordsOfMood, moodsOf },
  progressions: { PROGRESSIONS, getProgressionById, progressionNotes, progressionFlatNotes },
  midi: { buildSMF, smfInfo },
  train: { state: trainState, pickQuestion, applySrs, adjustLevel, isWeak, isDue, countToday },
  chordRoll,
  get roll() { return rollApi; },
  snapBeat,
  runSelfTest, showPage, ENGINE_STATE,
};
