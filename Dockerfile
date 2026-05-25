# syntax=docker/dockerfile:1.6

# ---------- 依赖阶段 ----------
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- 运行阶段 ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 只复制运行需要的东西，让源码层缓存更稳
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js publisher.js recordService.js ./
COPY public ./public

# 用非 root 用户运行
USER node

EXPOSE 33222

# 利用 server.js 自带的 /health 路由
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:33222/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

# 直接用 node 启动，PID 1 就是 node，能正确响应 SIGTERM
CMD ["node", "server.js"]
