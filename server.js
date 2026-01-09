import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { publishBatch } from "./publisher.js";
import { addRecords, getRecords } from "./recordService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 33222;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

function parseBulk(bulkText = "") {
  return bulkText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [template, version] = line.split(":");
      return { template: template?.trim(), version: version?.trim() };
    });
}

function normalizeItems(body = {}) {
  const items = Array.isArray(body.items) ? [...body.items] : [];

  if (body.template && body.version) {
    items.push({ template: body.template, version: body.version });
  }

  if (body.bulk) {
    items.push(...parseBulk(body.bulk));
  }

  return items;
}

app.post("/api/publish", async (req, res) => {
  const items = normalizeItems(req.body);
  const env = req.body.env || "env2"; // 默认使用测试2环境
  const userAgent = req.headers["user-agent"] || "";

  if (!items.length) {
    return res
      .status(400)
      .json({ success: false, message: "请输入至少一条模板与版本号" });
  }

  try {
    const results = await publishBatch(items, env);

    // 保存发布记录
    addRecords(results, env, userAgent);

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || "服务异常",
    });
  }
});

// 查询发布记录
app.get("/api/records", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;

  try {
    const data = getRecords({ page, pageSize });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || "查询失败",
    });
  }
});

app.listen(port, () => {
  console.log(`发布助手已启动: http://localhost:${port}`);
});
