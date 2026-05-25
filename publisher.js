import fetch from "node-fetch";

const API_KEY = "2f791c32-9810-4de7-b8a7-5e98a000b2fa";
const SECRET = "342878a9-b7bf-4b4c-a943-f07e8d84f707";

// 环境配置映射
const ENV_CONFIG = {
  env1: {
    AUTH_URL: "https://spa-shop-sandbox.eshoptechhub.com/spa-open-api/auth/generate-signature",
    PUBLISH_URL: "https://spa-shop-sandbox.eshoptechhub.com/spa-open-api/versions/publish"
  },
  env2: {
    AUTH_URL: "https://spa-shop-sandbox2.eshoptechhub.com/spa-open-api/auth/generate-signature",
    PUBLISH_URL: "https://spa-shop-sandbox2.eshoptechhub.com/spa-open-api/versions/publish"
  },
  env3: {
    AUTH_URL: "https://spa-shop-sandbox3.eshoptechhub.com/spa-open-api/auth/generate-signature",
    PUBLISH_URL: "https://spa-shop-sandbox3.eshoptechhub.com/spa-open-api/versions/publish"
  },
  env4: {
    AUTH_URL: "https://spa-shop-sandbox4.eshoptechhub.com/spa-open-api/auth/generate-signature",
    PUBLISH_URL: "https://spa-shop-sandbox4.eshoptechhub.com/spa-open-api/versions/publish"
  }
};

function getEnvConfig(env = "env2") {
  return ENV_CONFIG[env] || ENV_CONFIG.env2;
}

async function requestSignature(template, version, env = "env2") {
  const config = getEnvConfig(env);
  const authBody = {
    secret: SECRET,
    body: { template, version },
  };

  const resp = await fetch(config.AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authBody),
  });

  const data = await resp.json();

  if (!data.success || !data.data?.signature) {
    throw new Error(data.message || "签名获取失败");
  }

  return data.data;
}

async function publishTemplate(template, version, env = "env2") {
  const config = getEnvConfig(env);
  const { signature, timestamp } = await requestSignature(template, version, env);

  const resp = await fetch(config.PUBLISH_URL, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "x-signature": signature,
      "x-timestamp": timestamp,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ template, version }),
  });

  const data = await resp.json();

  if (data.success) {
    return { success: true, message: "发布成功" };
  }

  const message = data.message || "发布失败";
  return { success: false, message };
}

// 并发上限，避免一次性把上游 API 打挂
const PUBLISH_CONCURRENCY = 5;

async function publishOne(item, env) {
  const template = item?.template?.trim();
  const version = item?.version?.trim();

  if (!template || !version) {
    return {
      template: template || item?.template || "",
      version: version || item?.version || "",
      success: false,
      message: "模板名或版本号缺失",
    };
  }

  try {
    const result = await publishTemplate(template, version, env);
    return { template, version, ...result };
  } catch (err) {
    return {
      template,
      version,
      success: false,
      message: err.message || "未知错误",
    };
  }
}

async function publishBatch(items = [], env = "env2") {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await publishOne(items[i], env);
    }
  }

  const workerCount = Math.min(PUBLISH_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

export { publishTemplate, publishBatch };
