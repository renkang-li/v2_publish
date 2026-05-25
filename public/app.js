const templateInput = document.getElementById("template");
const versionInput = document.getElementById("version");
const bulkInput = document.getElementById("bulk");
const submitBtn = document.getElementById("submit");
const clearBtn = document.getElementById("clear");
const resultList = document.getElementById("resultList");

// 环境切换相关
const env1Option = document.getElementById("env1Option");
const env2Option = document.getElementById("env2Option");
const env3Option = document.getElementById("env3Option");
const env4Option = document.getElementById("env4Option");
let currentEnv = "env2"; // 默认环境2

// 环境切换逻辑
function switchEnvironment(env) {
  currentEnv = env;

  // 移除所有 active 状态
  env1Option.classList.remove("active");
  env2Option.classList.remove("active");
  env3Option.classList.remove("active");
  env4Option.classList.remove("active");

  // 给当前选中的添加 active
  if (env === "env1") {
    env1Option.classList.add("active");
  } else if (env === "env2") {
    env2Option.classList.add("active");
  } else if (env === "env3") {
    env3Option.classList.add("active");
  } else {
    env4Option.classList.add("active");
  }

  // 保存到 localStorage
  localStorage.setItem("publishEnv", env);
}

// 初始化环境选择
const savedEnv = localStorage.getItem("publishEnv") || "env2";
switchEnvironment(savedEnv);

// 绑定点击事件
env1Option.addEventListener("click", () => switchEnvironment("env1"));
env2Option.addEventListener("click", () => switchEnvironment("env2"));
env3Option.addEventListener("click", () => switchEnvironment("env3"));
env4Option.addEventListener("click", () => switchEnvironment("env4"));

// 特殊模板映射表
const TEMPLATE_MAPPING = {
  "template-single-payment-page": "template-range-xtd",
};

// 规范化模板名：补前缀 + 特殊映射
function normalizeTemplateName(name) {
  if (!name) return name;
  // 1. 补 template- 前缀
  let normalized = name.startsWith("template-") ? name : `template-${name}`;
  // 2. 特殊模板映射
  if (TEMPLATE_MAPPING[normalized]) {
    normalized = TEMPLATE_MAPPING[normalized];
  }
  return normalized;
}

function parseBulkLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // 只支持冒号分隔
      const parts = line.split(":");
      const template = (parts[0] || "").trim();
      const version = (parts[1] || "").trim();
      return { template, version };
    });
}

// 转换按钮逻辑
function handleTransform() {
  // 转换单条输入
  const singleTemplate = templateInput.value.trim();
  if (singleTemplate) {
    templateInput.value = normalizeTemplateName(singleTemplate);
  }

  // 转换批量输入
  const bulkText = bulkInput.value.trim();
  if (bulkText) {
    // 先检查是否是单行多条格式（用 | 分隔，且包含 - 分隔符）
    // 例如：template-a - v1.0.0|template-b - v2.0.0
    const isSingleLineMultiple = !bulkText.includes('\n') &&
      bulkText.includes('|') &&
      bulkText.includes(' - ');

    let lines;
    if (isSingleLineMultiple) {
      // 将单行多条拆分成多行
      lines = bulkText.split('|').map(item => item.trim()).filter(Boolean);
    } else {
      lines = bulkText.split(/\r?\n/);
    }

    const transformed = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // 如果是 "name - version" 格式，用 " - " 分隔
      if (trimmed.includes(' - ')) {
        const parts = trimmed.split(' - ');
        const template = normalizeTemplateName((parts[0] || "").trim());
        const version = (parts[1] || "").trim();
        return version ? `${template}: ${version}` : template;
      }

      // 只支持冒号分隔
      const parts = trimmed.split(":");
      const template = normalizeTemplateName((parts[0] || "").trim());
      const version = (parts[1] || "").trim();
      return version ? `${template}: ${version}` : template;
    });
    bulkInput.value = transformed.join("\n");
  }
}

function collectItems() {
  const items = [];
  const singleTemplate = templateInput.value.trim();
  const singleVersion = versionInput.value.trim();

  if (singleTemplate && singleVersion) {
    items.push({ template: singleTemplate, version: singleVersion });
  }

  if (bulkInput.value.trim()) {
    items.push(...parseBulkLines(bulkInput.value));
  }

  return items.filter((item) => item.template && item.version);
}

function renderResults(results = [], errorMsg = "") {
  resultList.innerHTML = "";

  if (errorMsg) {
    const div = document.createElement("div");
    div.className = "result-item error";
    div.innerHTML = `
        <div class="info">
          <span class="status-badge error">❌ 提交失败</span>
          <span style="margin-left: 8px">${errorMsg}</span>
        </div>
      `;
    resultList.appendChild(div);
    return;
  }

  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "暂无结果，先填写模板名和版本号吧。";
    resultList.appendChild(empty);
    return;
  }

  results.forEach((item) => {
    const div = document.createElement("div");
    const statusClass = item.success ? "success" : "error";
    div.className = `result-item ${statusClass}`;
    const icon = item.success ? "✅" : "❌";
    div.innerHTML = `
        <div class="info">
          <span class="status-badge ${statusClass}">${icon} ${item.template} / ${item.version}</span>
        </div>
        <span style="color: var(--text-muted); font-size: 13px;">${item.message || "完成"}</span>
      `;
    resultList.appendChild(div);
  });
}

async function handleSubmit() {
  const items = collectItems();
  if (!items.length) {
    renderResults([], "请至少填写一条模板名和版本号");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add('btn-loading');
  submitBtn.querySelector('.spinner').style.display = 'block';
  renderResults([], "");

  try {
    const resp = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, env: currentEnv }),
    });

    const data = await resp.json();

    if (!resp.ok || !data.success) {
      throw new Error(data.message || "接口调用失败");
    }

    renderResults(data.results || []);
  } catch (err) {
    renderResults([], err.message || "网络异常");
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('btn-loading');
    submitBtn.querySelector('.spinner').style.display = 'none';
  }
}

function handleClear() {
  templateInput.value = "";
  versionInput.value = "";
  bulkInput.value = "";
  renderResults([]);
}

const transformBtn = document.getElementById("transform");
submitBtn.addEventListener("click", handleSubmit);
clearBtn.addEventListener("click", handleClear);
transformBtn.addEventListener("click", handleTransform);
renderResults([]);

// === 发布历史功能 (仅 mode=development 时可见) ===
const urlParams = new URLSearchParams(window.location.search);
const isDevMode = urlParams.get("mode") === "development";

if (isDevMode) {
  const historyToggle = document.getElementById("historyToggle");
  const historyBtn = document.getElementById("historyBtn");
  const historyPanel = document.getElementById("historyPanel");
  const historyContent = document.getElementById("historyContent");
  const historyPagination = document.getElementById("historyPagination");
  const historyPrev = document.getElementById("historyPrev");
  const historyNext = document.getElementById("historyNext");
  const historyPageInfo = document.getElementById("historyPageInfo");
  const historyRefresh = document.getElementById("historyRefresh");

  let historyPage = 1;
  const historyPageSize = 15;
  let historyTotal = 0;

  historyToggle.classList.add("visible");

  const loadHistory = async () => {
    historyContent.innerHTML = '<div class="empty-state">加载中...</div>';
    try {
      const resp = await fetch(`/api/records?page=${historyPage}&pageSize=${historyPageSize}`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.message);

      historyTotal = data.total || 0;
      const records = data.records || [];

      if (!records.length) {
        historyContent.innerHTML = '<div class="empty-state">暂无发布记录</div>';
        historyPagination.style.display = "none";
        return;
      }

      const envNames = { env1: "测试1", env2: "测试2", env3: "测试3", env4: "测试4" };
      let html = `<table class="history-table">
        <thead><tr>
          <th>时间</th><th>环境</th><th>模板</th><th>版本</th><th>状态</th>
        </tr></thead><tbody>`;

      records.forEach(r => {
        const time = new Date(r.timestamp).toLocaleString("zh-CN");
        const envName = envNames[r.env] || r.env;
        const status = r.success
          ? '<span style="color: #15803d;">✅ 成功</span>'
          : `<span style="color: #b91c1c;">❌ ${r.message || "失败"}</span>`;
        html += `<tr>
          <td>${time}</td>
          <td><span class="env-tag">${envName}</span></td>
          <td>${r.template}</td>
          <td>${r.version}</td>
          <td>${status}</td>
        </tr>`;
      });

      html += "</tbody></table>";
      historyContent.innerHTML = html;

      // 分页
      const maxPage = Math.ceil(historyTotal / historyPageSize);
      historyPagination.style.display = maxPage > 1 ? "flex" : "none";
      historyPageInfo.textContent = `第 ${historyPage} / ${maxPage} 页 (共 ${historyTotal} 条)`;
      historyPrev.disabled = historyPage <= 1;
      historyNext.disabled = historyPage >= maxPage;
    } catch (err) {
      historyContent.innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`;
    }
  };

  historyBtn.addEventListener("click", () => {
    const isOpen = historyPanel.classList.toggle("open");
    historyBtn.classList.toggle("active", isOpen);
    historyBtn.textContent = isOpen ? "📋 收起历史" : "📋 查看发布历史";
    if (isOpen) {
      historyPage = 1;
      loadHistory();
    }
  });

  historyRefresh.addEventListener("click", () => loadHistory());
  historyPrev.addEventListener("click", () => {
    if (historyPage > 1) { historyPage--; loadHistory(); }
  });
  historyNext.addEventListener("click", () => {
    const maxPage = Math.ceil(historyTotal / historyPageSize);
    if (historyPage < maxPage) { historyPage++; loadHistory(); }
  });
}
