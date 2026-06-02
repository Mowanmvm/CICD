# ============================================================
# SRE 运维学习平台 — Dockerfile（Linux 通用）
# 基础镜像: node:18-alpine（基于 Alpine Linux，体积小、安全）
# ============================================================

# ========== 第一阶段：安装生产依赖 ==========
FROM node:18-alpine AS builder

WORKDIR /app

# 只复制 package 文件（利用 Docker 层缓存加速构建）
COPY backend/package*.json ./

# npm ci: 精确安装（比 npm install 快 2-10 倍）
# --only=production: 安装生产依赖（不装 eslint 等开发工具）
RUN npm ci --only=production && npm cache clean --force

# ========== 第二阶段：运行环境 ==========
FROM node:18-alpine

WORKDIR /app

# 从 builder 层复制 node_modules（不包括 package.json 等）
COPY --from=builder /app/node_modules ./node_modules

# 复制后端源码
COPY backend/ ./

# 复制前端页面（server.js 引用 ../ops-learning.html）
COPY ops-learning.html ../ops-learning.html

# 创建上传文件目录
RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "server.js"]
