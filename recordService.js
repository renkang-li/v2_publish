import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECORDS_FILE = path.join(__dirname, "publish-records.json");
const MAX_RECORDS = 500; // 最多保留 500 条记录

/**
 * 读取所有记录
 */
function readRecords() {
  try {
    if (!fs.existsSync(RECORDS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(RECORDS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

/**
 * 保存记录到文件
 */
function saveRecords(records) {
  const data = { records };
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * 生成简单的唯一 ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * 添加发布记录
 * @param {Object} params
 * @param {string} params.env - 目标环境
 * @param {string} params.template - 模板名
 * @param {string} params.version - 版本号
 * @param {boolean} params.success - 是否成功
 * @param {string} params.message - 结果信息
 * @param {string} params.userAgent - 用户 UA
 */
function addRecord({ env, template, version, success, message, userAgent }) {
  const records = readRecords();

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

  records.unshift(newRecord); // 新记录插入最前面

  // 限制记录数量
  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }

  saveRecords(records);
  return newRecord;
}

/**
 * 批量添加发布记录
 */
function addRecords(items, env, userAgent) {
  const records = readRecords();
  const timestamp = new Date().toISOString();
  const newRecords = [];

  for (const item of items) {
    const record = {
      id: generateId(),
      timestamp,
      env,
      template: item.template,
      version: item.version,
      success: item.success,
      message: item.message,
      userAgent: userAgent || "",
    };
    newRecords.push(record);
    records.unshift(record);
  }

  // 限制记录数量
  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }

  saveRecords(records);
  return newRecords;
}

/**
 * 获取记录列表（支持分页）
 */
function getRecords({ page = 1, pageSize = 20 } = {}) {
  const records = readRecords();
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    records: records.slice(start, end),
    total: records.length,
    page,
    pageSize,
  };
}

export { addRecord, addRecords, getRecords, readRecords };
