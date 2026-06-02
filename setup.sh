#!/bin/bash
# ============================================================
# SRE 运维学习平台 — Linux 一键安装脚本
#
# 用途：在新 Linux 服务器上从头搭建完整环境
#   - 安装 Docker、Docker Compose
#   - 克隆项目代码
#   - 启动 Jenkins
#
# 使用: sudo bash setup.sh
# ⚠️ 需要 root 权限运行
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

# ========== 检查 root 权限 ==========
# EUID=0 表示 root 用户
if [ "$EUID" -ne 0 ]; then
    error "请以 root 用户或使用 sudo 运行此脚本"
    echo "   sudo bash setup.sh"
    exit 1
fi

info "========================================"
info "  SRE 运维学习平台 — Linux 一键安装"
info "========================================"

# ========== 配置变量 ==========
# ⚠️ 请修改为你的 GitHub 仓库地址
GIT_REPO="https://github.com/<your-username>/<your-repo>.git"
APP_DIR="/opt/app"
JENKINS_DATA_DIR="/opt/docker-data/jenkins-home"

# ========== 0. 检测操作系统 ==========
info "🔍 检测操作系统..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
    info "  系统: ${OS} ${VER}"
else
    error "无法检测操作系统类型"
    exit 1
fi

# ========== 1. 系统更新 ==========
info "📦 更新系统包..."
case $OS in
    ubuntu|debian)
        apt update && apt upgrade -y
        apt install -y curl wget git vim nginx unzip
        ;;
    centos|rocky|rhel|fedora)
        yum update -y || dnf update -y
        yum install -y curl wget git vim nginx unzip || dnf install -y curl wget git vim nginx unzip
        ;;
    *)
        error "不支持的操作系统: ${OS}"
        exit 1
        ;;
esac
info "✅ 系统更新完成"

# ========== 2. 安装 Docker ==========
info "🐳 安装 Docker..."
if command -v docker &> /dev/null; then
    info "  Docker 已安装，版本: $(docker --version)"
else
    # 使用 Docker 官方一键安装脚本
    curl -fsSL https://get.docker.com | sh
    # 启动 Docker 并设置为开机自启
    systemctl enable docker
    systemctl start docker
    info "✅ Docker 安装完成，版本: $(docker --version)"
fi

# ========== 3. 安装 Docker Compose ==========
info "🐳 安装 Docker Compose..."
if docker compose version &> /dev/null; then
    info "  Docker Compose 已安装，版本: $(docker compose version)"
else
    # 较老的系统可能没有 docker-compose-plugin
    case $OS in
        ubuntu|debian)
            apt install -y docker-compose-plugin
            ;;
        centos|rocky|rhel)
            yum install -y docker-compose-plugin || dnf install -y docker-compose-plugin
            ;;
    esac
    info "✅ Docker Compose 安装完成"
fi

# ========== 4. 克隆项目代码 ==========
info "📂 克隆项目代码..."
if [ -d "${APP_DIR}/.git" ]; then
    info "  项目已存在，更新代码..."
    cd "${APP_DIR}"
    git pull
else
    mkdir -p "${APP_DIR}"
    git clone "${GIT_REPO}" "${APP_DIR}"
    info "✅ 代码克隆完成"
fi

# ========== 5. 创建 Jenkins 数据目录 ==========
info "📁 创建 Jenkins 数据目录..."
mkdir -p "${JENKINS_DATA_DIR}"
# Jenkins 容器内 jenkins 用户 uid=1000，所以这里设置所有者为 1000:1000
chown 1000:1000 "${JENKINS_DATA_DIR}"
info "✅ 数据目录: ${JENKINS_DATA_DIR}"

# ========== 6. 启动 Jenkins ==========
info "🚀 启动 Jenkins..."
cd "${APP_DIR}"
docker compose -f ci-cd-tutorial/linux/docker-compose.jenkins.yml up -d

# 等待 Jenkins 启动
info "⏳ 等待 Jenkins 启动..."
for i in $(seq 1 30); do
    if docker logs jenkins-server 2>&1 | grep -q "Jenkins is fully up and running"; then
        info "✅ Jenkins 已就绪"
        break
    fi
    sleep 2
done

# ========== 7. 输出信息 ==========
# 获取服务器公网 IP
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "获取失败")

echo ""
info "========================================"
info "  🎉 安装完成！"
info "========================================"
echo ""
info "  🔗 Jenkins 地址:"
info "     http://${PUBLIC_IP}:8080"
echo ""
info "  🔑 初始管理员密码:"
info "     docker exec jenkins-server cat /var/jenkins_home/secrets/initialAdminPassword"
echo ""
info "  📂 项目目录: ${APP_DIR}"
echo ""
info "  📝 后续步骤:"
info "  1. 访问 Jenkins 完成初始化"
info "  2. 安装插件: Pipeline, Docker Pipeline, GitHub Integration"
info "  3. 添加凭据: GitHub Token, Docker Hub Token"
info "  4. 创建 Pipeline 任务并配置 Webhook"
info "  5. 推送代码触发自动构建"
echo ""
info "  推荐: 配置域名和 SSL"
info "     sudo certbot --nginx -d jenkins.your.com"
echo ""
info "========================================"
