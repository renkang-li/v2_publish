import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECORDS_FILE = path.join(__dirname, "publish-records.json");
const TMP_FILE = `${RECORDS_FILE}.tmp`;
const MAX_RECORDS = 500; // 最多保留 500 条记录
const SAVE_DEBOUNCE_MS = 200; // 写盘防抖

/**
 * 启动时同步读一次，之后全部走内存缓存
 */
function loadInitialRecords() {
  try {
    if (!fs.existsSync(RECORDS_FILE)) return [];
    const data = fs.readFileSync(RECORDS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

let cache = loadInitialRecords();

// 写盘串行化：保证不会出现并发写入互相覆盖
let saveTimer = null;
let saving = null;
let pendingSave = false;

async function flushToDisk() {
  // 用临时文件 + rename，避免写到一半进程退出导致文件损坏
  const data = JSON.stringify({ records: cache });
  await fsp.writeFile(TMP_FILE, data, "utf-8");
  await fsp.rename(TMP_FILE, RECORDS_FILE);
}

async function runSaveLoop() {
  try {
    do {
      pendingSave = false;
      await flushToDisk();
    } while (pendingSave);
  } catch (err) {
    console.error("[recordService] 写入记录文件失败:", err);
  } finally {
    saving = null;
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (saving) {
      // 已经在写，标记需要再写一轮（吸收期间的所有变更）
      pendingSave = true;
    } else {
      saving = runSaveLoop();
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * 生成简单的唯一 ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * 读取所有记录（直接返回缓存的浅拷贝）
 */
function readRecords() {
  return cache.slice();
}

/**
 * 添加单条发布记录
 */
function addRecord({ env, template, version, success, message, userAgent }) {
  const newRecord = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    env,
    template,
    version,
    success,
    message,
    userAgent: userAgent || "",
  };

  cache.unshift(newRecord);
  if (cache.length > MAX_RECORDS) cache.length = MAX_RECORDS;

  scheduleSave();
  return newRecord;
}

/**
 * 批量添加发布记录
 */
function addRecords(items, env, userAgent) {
  const timestamp = new Date().toISOString();
  const newRecords = items.map((item) => ({
    id: generateId(),
    timestamp,
    env,
    template: item.template,
    version: item.version,
    success: item.success,
    message: item.message,
    userAgent: userAgent || "",
  }));

  // 一次性插入，避免循环 unshift 的 O(n²) 开销
  cache = newRecords.concat(cache);
  if (cache.length > MAX_RECORDS) cache.length = MAX_RECORDS;

  scheduleSave();
  return newRecords;
}

/**
 * 获取记录列表（支持分页）
 */
function getRecords({ page = 1, pageSize = 20 } = {}) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    records: cache.slice(start, end),
    total: cache.length,
    page,
    pageSize,
  };
}

/**
 * 进程退出前尽量把内存里的数据落盘
 */
async function flushOnExit() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (saving) {
    try {
      await saving;
    } catch {
      /* runSaveLoop 内部已经记录过日志 */
    }
  }
  try {
    await flushToDisk();
  } catch (err) {
    console.error("[recordService] 退出时写入失败:", err);
  }
}

let exitHooked = false;
function hookExitOnce() {
  if (exitHooked) return;
  exitHooked = true;
  const handler = () => {
    flushOnExit().finally(() => process.exit(0));
  };
  process.once("SIGINT", handler);
  process.once("SIGTERM", handler);
}
hookExitOnce();

export { addRecord, addRecords, getRecords, readRecords, flushOnExit };
