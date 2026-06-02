#!/bin/bash
# ============================================================
# SRE 运维学习平台 — Linux 部署脚本
#
# 用途：在 Linux 服务器上部署新版本应用
#   - Pull 最新镜像
#   - 生成 docker-compose.yml（环境区分）
#   - 重启服务
#   - 清理旧镜像
#
# 使用:
#   chmod +x deploy.sh
#   ./deploy.sh --env production --registry myuser --image sre-app --tag abc12345 --db-pass Mowan123
#
# 参数说明:
#   --env       部署环境 (dev/staging/production)
#   --registry  Docker 镜像仓库地址
#   --image     镜像名称
#   --tag       镜像标签（Git commit SHA）
#   --db-pass   数据库密码
#   --db-name   数据库名称（可选，默认 sre_learning）
#   --port      应用端口（可选，默认 3000）
# ============================================================

set -euo pipefail

# ========== 颜色输出 ==========
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
ok()    { echo -e "${GREEN}✔${NC} $1"; }

# ========== 解析命令行参数 ==========
# getopts 风格：支持 --key value 格式
while [[ $# -gt 0 ]]; do
    case "$1" in
        --env)      ENV="$2";      shift 2 ;;
        --registry) REGISTRY="$2"; shift 2 ;;
        --image)    IMAGE="$2";    shift 2 ;;
        --tag)      TAG="$2";      shift 2 ;;
        --db-pass)  DB_PASS="$2";  shift 2 ;;
        --db-name)  DB_NAME="$2";  shift 2 ;;
        --port)     PORT="$2";     shift 2 ;;
        *)
            error "未知参数: $1"
            echo "用法: $0 --env <env> --registry <reg> --image <img> --tag <tag> --db-pass <pass> [--db-name <name>] [--port <port>]"
            exit 1
            ;;
    esac
done

# ========== 参数校验 ==========
# -z 检查变量是否为空（未设置则退出）
[ -z "${ENV}" ]     && { error "缺少 --env 参数 (dev/staging/production)";      exit 1; }
[ -z "${REGISTRY}" ] && { error "缺少 --registry 参数 (Docker Hub 用户名)";     exit 1; }
[ -z "${IMAGE}" ]   && { error "缺少 --image 参数 (镜像名称)";                  exit 1; }
[ -z "${TAG}" ]     && { error "缺少 --tag 参数 (镜像标签/commit SHA)";         exit 1; }
[ -z "${DB_PASS}" ] && { error "缺少 --db-pass 参数 (数据库密码)";              exit 1; }

# 设置默认值（如果未传入）
DB_NAME="${DB_NAME:-sre_learning}"
PORT="${PORT:-3000}"

info "========================================"
info "  部署环境: ${ENV}"
info "  镜像: ${REGISTRY}/${IMAGE}:${TAG}"
info "  端口: ${PORT}"
info "========================================"

# ========== 1. 创建部署目录 ==========
# 不同环境隔离到不同目录
# /opt/sre-app/dev
# /opt/sre-app/staging
# /opt/sre-app/production
DEPLOY_DIR="/opt/sre-app/${ENV}"
mkdir -p "${DEPLOY_DIR}"
cd "${DEPLOY_DIR}"
info "部署目录: ${DEPLOY_DIR}"

# ========== 2. 生成 docker-compose.yml ==========
# 使用 heredoc (cat << EOF > file) 动态写入
# 优点: 灵活注入变量，无需模板文件
info "生成 docker-compose.yml..."
cat > docker-compose.yml << YAML
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: sre-mysql-${ENV}
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASS}
      MYSQL_DATABASE: ${DB_NAME}
      MYSQL_CHARACTER_SET_SERVER: utf8mb4
      MYSQL_COLLATION_SERVER: utf8mb4_unicode_ci
    volumes:
      - sre-mysql-data-${ENV}:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M

  app:
    image: ${REGISTRY}/${IMAGE}:${TAG}
    container_name: sre-app-${ENV}
    restart: unless-stopped
    ports:
      - "${PORT}:3000"
    environment:
      DB_HOST: mysql
      DB_PORT: 3306
      DB_USER: root
      DB_PASSWORD: ${DB_PASS}
      DB_NAME: ${DB_NAME}
      NODE_ENV: ${ENV}
    depends_on:
      mysql:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  sre-mysql-data-${ENV}:
YAML

ok "docker-compose.yml 已生成"

# ========== 3. 拉取最新镜像 ==========
info "拉取 ${REGISTRY}/${IMAGE}:${TAG}..."
docker compose pull app
ok "镜像拉取完成"

# ========== 4. 重新创建服务 ==========
info "启动服务..."
# --remove-orphans: 清理 docker-compose.yml 中不存在的旧容器
docker compose up -d --remove-orphans
ok "服务已启动"

# ========== 5. 等待服务就绪 ==========
info "等待应用就绪..."
for i in $(seq 1 12); do
    if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
        ok "应用已就绪 (第 ${i} 秒)"
        break
    fi
    if [ "$i" -eq 12 ]; then
        warn "健康检查超时，请手动检查: docker logs sre-app-${ENV}"
    fi
    sleep 5
done

# ========== 6. 清理旧镜像 ==========
info "🧹 清理旧镜像..."
# docker image prune -f: 删除 dangling 镜像（无标签的 <none>:<none>）
# docker image prune -a -f: 删除所有未被容器引用的镜像
docker image prune -f
ok "清理完成"

# ========== 7. 输出部署状态 ==========
echo ""
info "========================================"
info "  部署完成！"
info "  环境: ${ENV}"
info "  镜像: ${REGISTRY}/${IMAGE}:${TAG}"
info "  访问: http://localhost:${PORT}"
info "  API:  http://localhost:${PORT}/api/health"
info "========================================"
