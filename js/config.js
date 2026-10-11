// ChordLab 全局配置：所有约定与阈值集中在此，业务模块不得散落硬编码（执行约束 8）。
export const CONFIG = {
  music: {
    centralC: 60,        // MIDI 60 = C4
    rangeLow: 36,        // C2 —— 采样覆盖下限，播放越界时钳制
    rangeHigh: 84,       // C6 —— 采样覆盖上限
    defaultKey: 'C',     // 默认调性
    bpm: 90,
    beatUnit: 'quarter', // 节拍单位：以四分音符为一拍
  },

  chords: {
    voicingRootAnchor: 48, // 根音锚点：C3 = MIDI 48。根音按音级锚定在 C3–B3（48–59），
                           // 构成音向上密集排列；最高音 ≤ 48+11+21 = 80，不越采样上限。
                           // 查询与练耳共用此唯一声位规则（听辨公平性）。
    blockDurationBeats: 3,  // 柱式和弦时值（拍）
    arpeggioStepBeats: 0.5, // 琶音相邻两音间隔（拍）
    arpeggioNoteBeats: 2,   // 琶音每音时值（拍）
  },

  midi: {
    ppq: 480, // SMF 导出的分辨率（ticks per quarter note）
  },

  training: {
    upStreak: 3,             // 连对 3 题升一级
    downStreak: 2,           // 连错 2 题降一级
    minAnswersForAdjust: 4,  // 阶段答题数不足时不调整难度（防误调）
    levels: { min: 1, max: 3 },
    optionsByLevel: { 1: 4, 2: 5, 3: 6 }, // 等级决定选项数量
    srs: {
      baseIntervalMs: 2 * 60 * 1000,        // 首次答对后 2 分钟内不重点重复
      maxIntervalMs: 24 * 60 * 60 * 1000,   // 复习间隔上限 24 小时
      growth: 2,                            // 答对间隔翻倍
      wrongResetMs: 0,                      // 答错立即进错题队列
    },
    dailyGoal: 20,           // 每日练习目标（题）
    weakThreshold: 0.6,      // 正确率低于此值且已练 ≥3 次判定为弱项
    weakMinSeen: 3,

    // 音程轨：一阶段只判方向，二阶段才给术语（先建立关系判断，再引入名称）
    intervals: {
      lowMidi: 48,     // C3 —— 与和弦声位同一下限，键盘视觉复用这段音域
      highMidi: 72,    // C5 —— 留出十二度空间，最高音也不越采样上界
      gapBeats: 1,     // 两音之间隔几拍
      noteBeats: 1.25, // 每个音持续几拍
      // 方向题的两音距离：等级越高越近，越近越难分
      relationGapByLevel: { 1: [7, 12], 2: [4, 9], 3: [1, 5] },
      // 命名题的候选集：等级越高，候选越多、听感越接近
      namesByLevel: {
        1: ['itv:m3', 'itv:M3', 'itv:P4', 'itv:P5'],
        2: ['itv:m3', 'itv:M3', 'itv:P4', 'itv:T', 'itv:P5', 'itv:M6'],
        3: ['itv:m2', 'itv:M2', 'itv:m3', 'itv:M3', 'itv:P4', 'itv:T',
            'itv:P5', 'itv:m6', 'itv:M6', 'itv:m7', 'itv:M7', 'itv:P8'],
      },
    },

    // 简谱轨：一阶段只考音高（四拍全四分，干扰项只改音级/八度点），
    // 二阶段才考节奏（音高不变，干扰项只改时值/附点/休止）。一次只动一个维度。
    jianpu: {
      beats: 4,           // 每题固定 4 拍，一小节
      octaveChance: 0.25, // 走音题里出现高八度点的概率
    },

    // 旋律重建轨：听一小节，自己在卷帘上把音符放回去，再按三维（音高/起点/时值）对答案
    melody: {
      bars: 1,
      lowMidi: 48,        // C3 —— 与简谱轨同一段音域，重建时不用滚动
      highMidi: 72,       // C5
      rowHeight: 10,      // 能画能点，但不必比只读预览高太多
      snap: 0.5,          // 落点吸附到半拍，与生成的目标同一网格
    },

    // 节奏轨：纯节奏。全曲同一个音高，音高不承载任何信息，
    // 每小节第一拍高一档，给强弱拍一个参照。
    rhythm: {
      cellMidi: 60,       // C4
      accentMidi: 67,     // G4，只落在第一拍
      gridCells: 16,      // 一小节 = 16 个十六分格
    },
  },

  roll: {
    bars: 8,          // 默认小节数
    snap: 0.5,        // 默认网格吸附（拍）：1 / 0.5 / 0.25
    keyWidth: 56,     // 左侧键盘列宽（px）
    rowHeight: 16,    // 每个音高行高（px）
    rulerHeight: 22,  // 顶部小节标尺高（px）
    edgePx: 6,        // 音符右边缘改时值的判定宽度（px）
  },

  audio: {
    sampleDir: 'samples/piano/',
    // Salamander 子集：C2–C6 每 3 半音一个采样（C、D#、F#、A），共 17 个
    sampleNotes: [
      'C2', 'Ds2', 'Fs2', 'A2',
      'C3', 'Ds3', 'Fs3', 'A3',
      'C4', 'Ds4', 'Fs4', 'A4',
      'C5', 'Ds5', 'Fs5', 'A5',
      'C6',
    ],
    defaultVelocity: 0.8,
    maxPolyphony: 32,            // 活动声部上限，超出时立即回收最旧声部
    stopRampSec: 0.03,           // 主动停止时的音量渐变时长（防爆音）
    defaultNoteSec: 1.0,         // 键盘单击的默认发声时长
    residualCheckDelayMs: 350,   // 自检：停止后等待时长
    residualRmsThreshold: 0.002, // 自检：残留声判定阈值
    synth: {
      attack: 0.004,
      decayTau: 0.45,            // 合成音衰减时间常数（秒）
      harmonics: [               // 谐波结构（近似钢琴亮度，仅作降级音色）
        { ratio: 1, gain: 1.0, type: 'triangle' },
        { ratio: 2, gain: 0.35, type: 'sine' },
        { ratio: 3, gain: 0.12, type: 'sine' },
      ],
    },
  },

  keyboard: {
    lowMidi: 36,  // 键盘显示范围 C2–C6，覆盖全部采样音域与声位区间
    highMidi: 84,
  },
};
