// 音频引擎（Web Audio 原生实现，M0 无外部依赖）。
// 职责：用户手势解锁、采样逐文件加载与状态机、合成音降级、声部登记与精确停止、输出电平监测。
// 技术说明：Tone.js 的 Sampler 不提供逐文件失败状态与活动声部计数，而这两点是 M0 验收
// 的硬性要求（部分失败仍可用、主动停止无残留），故加载/重映射/停止全部在此自实现；
// M2 若需要节拍调度可再评估引入 Tone.js（用户规范允许"Tone.js 或 Web Audio API"）。
import { CONFIG } from '../config.js';
import { noteNameToMidi, midiToFreq, nearestSampleMidi, playbackRate, clampToRange } from '../theory/notes.js';

export const ENGINE_STATE = {
  UNINITIALIZED: 'uninitialized', // 未初始化（等待首次点击）
  LOADING: 'loading',             // 采样加载中
  READY: 'ready',                 // 全部采样加载成功
  PARTIAL: 'partial',             // 部分采样失败（缺口由邻近采样重映射或合成音补齐，仍可练习）
  SYNTH: 'synth',                 // 采样全部失败，仅合成音
};

class Engine {
  constructor() {
    this.ctx = null;          // AudioContext（首次手势时创建）
    this.master = null;       // 总输出增益
    this.analyser = null;     // 输出电平监测（残留声自检用）
    this.state = ENGINE_STATE.UNINITIALIZED;
    this.sampleBuffers = new Map(); // 采样 MIDI 编号 → AudioBuffer
    this.failedNotes = [];          // 加载失败的采样音名
    this.voices = new Set();        // 活动声部（含已调度未发声的）
    this.listeners = new Set();
    this._loadSeq = 0;              // 加载请求序号（防止并发加载互相覆盖）
  }

  onStateChange(fn) { this.listeners.add(fn); }
  _emit() { const snap = this.snapshot(); for (const fn of this.listeners) fn(snap); }

  snapshot() {
    return {
      state: this.state,
      loaded: this.sampleBuffers.size,
      total: CONFIG.audio.sampleNotes.length,
      failed: [...this.failedNotes],
      activeVoices: this.voices.size,
      contextState: this.ctx ? this.ctx.state : 'none',
    };
  }

  // 必须由用户手势（点击/按键）触发调用，规避浏览器自动播放限制。
  _ensureContext() {
    if (this.ctx) return this.ctx;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    return this.ctx;
  }

  // 页面一加载就在后台把 17 个采样抓下来解码。
  // 解码不需要用户手势，只有 resume 需要——所以上下文先停在 suspended，
  // 用户第一次点「试听」时只是恢复一个已经备好的引擎，不必再等下载与解码。
  // 反复调用只会复用同一个 Promise。
  async preload() {
    if (this._preloading) return this._preloading;
    this._preloading = (async () => {
      const t0 = (window.performance || Date).now();
      this._ensureContext();
      if (this.state === ENGINE_STATE.UNINITIALIZED) await this._loadSamples(false);
      this.loadMs = Math.round((window.performance || Date).now() - t0);
      // 诊断用：启动日志与性能验证都读这个数
      window.__jiantingEngineLoadMs = this.loadMs;
      return this.snapshot();
    })();
    return this._preloading;
  }

  async unlockAndLoad({ simulateAllFailed = false } = {}) {
    this._ensureContext();
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch (e) { /* 保持挂起状态，由 UI 提示 */ }
    }
    if (!simulateAllFailed) {
      await this.preload();   // 已经预载过就立刻返回
      return this.snapshot();
    }
    // simulateAllFailed 仅供引擎自检的降级路径强制重载
    await this._loadSamples(true);
    return this.snapshot();
  }

  async _loadSamples(simulateAllFailed) {
    const seq = ++this._loadSeq;
    this.state = ENGINE_STATE.LOADING;
    this._emit();

    let results = await Promise.all(CONFIG.audio.sampleNotes.map(async (name) => {
      const midi = noteNameToMidi(name);
      try {
        if (simulateAllFailed) throw new Error('simulateAllFailed');
        // no-cache：每次会话对采样做条件请求（未变则 304），
        // 保证采样文件被删除/替换后降级逻辑立即可见，不被启发式缓存掩盖
        const res = await fetch(CONFIG.audio.sampleDir + name + '.mp3', { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const audio = await this.ctx.decodeAudioData(await res.arrayBuffer());
        return { name, midi, audio, error: null };
      } catch (e) {
        return { name, midi, audio: null, error: String((e && e.message) || e) };
      }
    }));
    if (seq !== this._loadSeq) return; // 已被更新的加载请求取代

    // 偶发失败重试一次：冷启动时抓取/解码撞上抖动是常事，重试远比直接降级到合成音划算；
    // 重试仍失败才走降级，界面照旧提示哪几个没拿到
    if (!simulateAllFailed && results.some((r) => r.error)) {
      const failed = results.filter((r) => r.error).map((r) => r.name);
      const retried = await Promise.all(failed.map(async (name) => {
        const midi = noteNameToMidi(name);
        try {
          const res = await fetch(CONFIG.audio.sampleDir + name + '.mp3', { cache: 'no-cache' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const audio = await this.ctx.decodeAudioData(await res.arrayBuffer());
          return { name, midi, audio, error: null };
        } catch (e) {
          return { name, midi, audio: null, error: String((e && e.message) || e) };
        }
      }));
      if (seq !== this._loadSeq) return;
      const fixed = new Map(retried.map((r) => [r.name, r]));
      results = results.map((r) => (r.error ? (fixed.get(r.name) || r) : r));
    }

    this.sampleBuffers.clear();
    this.failedNotes = [];
    for (const r of results) {
      if (r.error) this.failedNotes.push(r.name);
      else this.sampleBuffers.set(r.midi, r.audio);
    }
    if (this.sampleBuffers.size === 0) this.state = ENGINE_STATE.SYNTH;
    else if (this.failedNotes.length > 0) this.state = ENGINE_STATE.PARTIAL;
    else this.state = ENGINE_STATE.READY;
    this._emit();
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // 播放一个音符（内部原语）。when 为 ctx 时间轴（秒）；durationSec 为空则持续到 stopAll。
  playMidi(midi, when, durationSec, velocity) {
    if (!this.ctx) return null;
    midi = clampToRange(midi);
    const t0 = Math.max(when == null ? this.now() + 0.001 : when, this.now() + 0.001);
    const vel = velocity == null ? CONFIG.audio.defaultVelocity : velocity;
    const voice = this.sampleBuffers.size > 0
      ? this._playSampleVoice(midi, t0, vel)
      : this._playSynthVoice(midi, t0, vel);
    this._register(voice, durationSec);
    return voice;
  }

  _playSampleVoice(midi, t0, vel) {
    const available = [...this.sampleBuffers.keys()];
    const nearest = nearestSampleMidi(midi, available);
    const src = this.ctx.createBufferSource();
    src.buffer = this.sampleBuffers.get(nearest);
    src.playbackRate.value = playbackRate(midi, nearest); // 变速重映射出目标音高
    const gain = this.ctx.createGain();
    gain.gain.value = vel * 0.9;
    src.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    return { nodes: [src], gain, startedAt: t0, synth: false };
  }

  _playSynthVoice(midi, t0, vel) {
    const f = midiToFreq(midi);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.setTargetAtTime(vel * 0.5, t0, CONFIG.audio.synth.attack / 3);
    const nodes = [];
    for (const h of CONFIG.audio.synth.harmonics) {
      const o = this.ctx.createOscillator();
      o.type = h.type;
      o.frequency.value = f * h.ratio;
      const og = this.ctx.createGain();
      og.gain.value = h.gain;
      o.connect(og);
      og.connect(gain);
      nodes.push(o);
    }
    gain.connect(this.master);
    for (const n of nodes) n.start(t0);
    return { nodes, gain, startedAt: t0, synth: true };
  }

  _register(voice, durationSec) {
    this.voices.add(voice);
    if (this.voices.size > CONFIG.audio.maxPolyphony) {
      const oldest = this.voices.values().next().value;
      this._killVoice(oldest);
    }
    // 首节点 onended 时从登记表移除（BufferSource / Oscillator 均支持）
    voice.nodes[0].onended = () => this.voices.delete(voice);
    // 按请求时长收尾；未给时长则持续到 stopAll
    if (durationSec != null) {
      this._finishAt(voice, voice.startedAt + durationSec);
    }
  }

  // 在 tEnd 时刻开始收尾：短促音量渐变（防爆音）后停止节点
  _finishAt(voice, tEnd) {
    const ramp = CONFIG.audio.stopRampSec;
    try {
      voice.gain.gain.setTargetAtTime(0.0001, tEnd, ramp / 3);
      for (const n of voice.nodes) n.stop(tEnd + ramp + 0.05);
    } catch (e) { /* 节点已停止 */ }
  }

  _killVoice(voice) { // 立即切断（超复音回收用，不走渐变）
    const now = this.now();
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(0.0001, now);
      for (const n of voice.nodes) n.stop(now + 0.01);
    } catch (e) { /* 已停止 */ }
  }

  // 主动停止一切声音（含已调度未发声的），返回终止的声部数。
  stopAll() {
    if (!this.ctx) return 0;
    const now = this.now();
    let count = 0;
    for (const v of [...this.voices]) {
      this._finishAt(v, now);
      count++;
    }
    this._emit();
    return count;
  }

  // 输出 RMS 电平（残留声自检：stopAll 后应趋近 0）
  getRms() {
    if (!this.analyser) return 0;
    const arr = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(arr);
    let sum = 0;
    for (const x of arr) sum += x * x;
    return Math.sqrt(sum / arr.length);
  }
}

export const engine = new Engine();
