// IndexedDB 封装：训练进度持久化（执行约束：练习记录刷新后仍在）。
// stores:
//   training { typeId, seen, correct, streakRight, streakWrong, intervalMs, dueAt, lastSeen } —— SRS 状态
//   meta     { key, value }                                  —— 各阶段等级等
//   answers  (auto) { stage, typeId, rootPc, correct, level, ts, ms } —— 答题流水
const DB_NAME = 'chordlab';
// 版本 3：修一个真实事故——曾经有工具以版本 2 打开了这个库却只建了 meta 一个 store，
// 于是应用再 open(name, 2) 时版本没变、onupgradeneeded 不触发，training/answers/editor
// 永远建不出来，之后每次 transaction 都抛 NotFoundError（训练页表现成「点下一题没反应」）。
// 抬版本号是唯一能让升级事件重新跑起来的办法；下面的 contains 判断保证它是幂等的。
const DB_VERSION = 3;

let dbPromise = null;
export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('training')) db.createObjectStore('training', { keyPath: 'typeId' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('answers')) db.createObjectStore('answers', { autoIncrement: true });
        if (!db.objectStoreNames.contains('editor')) db.createObjectStore('editor', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function idbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbPut(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readwrite').objectStore(store).put(value);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function idbClear(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readwrite').objectStore(store).clear();
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

// 默认 SRS 记录
export function defaultTrainingRec(typeId) {
  return { typeId, seen: 0, correct: 0, streakRight: 0, streakWrong: 0, intervalMs: 0, dueAt: 0, lastSeen: 0 };
}
