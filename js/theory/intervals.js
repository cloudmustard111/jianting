// 音程字典：听辨训练「音程轨」的唯一权威，和和弦字典平级。
// semitones = 两音之间的半音数（不含方向）；构成音一律落到 MIDI 编号。
// 训练项 id 用 itv: / rel: 前缀，与和弦类型 id 天然不同名，SRS 记录可以共用一张表。

export const INTERVALS = [
  { id: 'itv:m2', semitones: 1,  short: 'm2', name: '小二度', hint: '最近的一步，两个音几乎黏在一起。' },
  { id: 'itv:M2', semitones: 2,  short: 'M2', name: '大二度', hint: '相邻音级的距离，音阶里最常走的一步。' },
  { id: 'itv:m3', semitones: 3,  short: 'm3', name: '小三度', hint: '小调的颜色，柔和里带一点暗。' },
  { id: 'itv:M3', semitones: 4,  short: 'M3', name: '大三度', hint: '大调的颜色，明亮、确定。' },
  { id: 'itv:P4', semitones: 5,  short: 'P4', name: '纯四度', hint: '空、稳，像没有三音的和弦。' },
  { id: 'itv:T',  semitones: 6,  short: 'TT', name: '三全音', hint: '正好卡在中间，最不安定的一个。' },
  { id: 'itv:P5', semitones: 7,  short: 'P5', name: '纯五度', hint: '最空最稳的距离，强力和弦的骨架。' },
  { id: 'itv:m6', semitones: 8,  short: 'm6', name: '小六度', hint: '大调里藏着小调色彩的缺口。' },
  { id: 'itv:M6', semitones: 9,  short: 'M6', name: '大六度', hint: '开阔、甜，旋律大跳的常客。' },
  { id: 'itv:m7', semitones: 10, short: 'm7', name: '小七度', hint: '属七和弦里那个想往下走的音。' },
  { id: 'itv:M7', semitones: 11, short: 'M7', name: '大七度', hint: '差半步就到八度，紧张又漂亮。' },
  { id: 'itv:P8', semitones: 12, short: 'P8', name: '纯八度', hint: '同一个音名的另一个高度，最容易认。' },
];

// 一阶段只判方向，不引入任何术语
export const RELATIONS = [
  { id: 'rel:up',   symbol: '更高', name: '第二个音比第一个音高', hint: '下半句往上走。' },
  { id: 'rel:down', symbol: '更低', name: '第二个音比第一个音低', hint: '下半句往下走。' },
  { id: 'rel:same', symbol: '相同', name: '两个音一样高',       hint: '两次听到的是同一个音。' },
];

export const RELATION_IDS = RELATIONS.map((r) => r.id);

export function getIntervalById(id) {
  const itv = INTERVALS.find((x) => x.id === id);
  if (!itv) throw new Error(`未知音程: ${id}`);
  return itv;
}

export function getRelationById(id) {
  const rel = RELATIONS.find((x) => x.id === id);
  if (!rel) throw new Error(`未知关系: ${id}`);
  return rel;
}

// 训练项统一出口：无论方向题还是命名题，UI 拿到的都是 { id, symbol, name, hint }
export function getTrainItemById(id) {
  if (String(id).startsWith('rel:')) {
    const r = getRelationById(id);
    return { id, symbol: r.symbol, name: r.name, hint: r.hint };
  }
  const i = getIntervalById(id);
  return { id, symbol: i.short, name: i.name, hint: i.hint };
}
