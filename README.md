#  GitHub CI/CD：Linux 服务器部署完整指南

> **适用环境**：Ubuntu 20.04+ / CentOS 7+ / Debian 11+ / Rocky Linux 8+
> **目标**：在 Linux 服务器上搭建 Jenkins CI/CD 流水线，实现自动化构建与部署

---

## 目录

- [第一章：Linux 服务器初始化](#第一章linux-服务器初始化)
- [第二章：Docker 与 Docker Compose 安装](#第二章docker-与-docker-compose-安装)
- [第三章：Jenkins 容器化部署](#第三章jenkins-容器化部署)
- [第四章：Jenkins 基础配置](#第四章jenkins-基础配置)
- [第五章：Nginx 反向代理与 SSL](#第五章nginx-反向代理与-ssl)
- [第六章：编写 Jenkinsfile](#第六章编写-jenkinsfile)
- [第七章：GitHub Webhook 配置](#第七章github-webhook-配置)
- [第八章：生产环境部署方案](#第八章生产环境部署方案)
- [第九章：监控与运维](#第九章监控与运维)
- [附录：Linux 命令速查与排错](#附录linux-命令速查与排错)

---

## 第一章：Linux 服务器初始化

### 1.1 基础环境要求

| 组件     | 最低配置                 | 推荐配置           |
| -------- | ------------------------ | ------------------ |
| 操作系统 | Ubuntu 20.04 / CentOS 7+ | Ubuntu 22.04 LTS   |
| CPU      | 2 核                     | 4 核               |
| 内存     | 4 GB                     | 8 GB               |
| 磁盘     | 40 GB                    | 100 GB（SSD）      |
| 网络     | 公网 IP                  | 固定公网 IP + 域名 |

### 1.2 连接服务器

```bash
# 使用 SSH 连接到你的 Linux 服务器
# 将 <user> 替换为你的用户名，<server-ip> 替换为服务器 IP
ssh <user>@<server-ip>

# 例如：
# ssh root@123.45.67.89
# ssh ubuntu@your-server.com
```

### 1.3 系统更新

```bash
# ---- Ubuntu / Debian ----
sudo apt update && sudo apt upgrade -y

# ---- CentOS / Rocky / RHEL ----
sudo yum update -y
# 或（CentOS 8+）
sudo dnf update -y
```

### 1.4 安装基础工具

```bash
# ---- Ubuntu / Debian ----
sudo apt install -y curl wget git vim unzip tree

# ---- CentOS / Rocky / RHEL ----
sudo yum install -y curl wget git vim unzip tree
# 或
sudo dnf install -y curl wget git vim unzip tree
```

### 1.5 配置 Git

```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# 验证配置
git config --list
```

### 1.6 克隆项目代码

```bash
# 创建项目目录
sudo mkdir -p /opt/app
sudo chown $USER:$USER /opt/app

# 克隆代码（将 <your-username> 和 <repo> 替换为你的信息）
git clone https://github.com/<your-username>/<your-repo>.git /opt/app

# 进入项目目录
cd /opt/app
```

---

## 第二章：Docker 与 Docker Compose 安装

### 2.1 安装 Docker

```bash
# ==================== Ubuntu / Debian ====================
# 卸载旧版本
sudo apt remove docker docker-engine docker.io containerd runc

# 安装依赖
sudo apt install -y ca-certificates curl gnupg lsb-release

# 添加 Docker 官方 GPG 密钥
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 添加 Docker APT 源
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# ==================== CentOS / Rocky / RHEL ====================
# 安装依赖
sudo yum install -y yum-utils

# 添加 Docker YUM 源
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装 Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker   # 开机自启

# ==================== 验证安装 ====================
docker --version
docker compose version

# 预期输出示例:
# Docker version 27.0.3, build 7d4bcd8
# Docker Compose version v2.28.1
```

### 2.2 配置普通用户执行 Docker

```bash
# 将当前用户加入 docker 组（避免每次 sudo）
sudo usermod -aG docker $USER

#  重要：退出重新登录使组变更生效
# 或者使用以下命令立即生效（无需退出）
newgrp docker

# 验证：不用 sudo 执行 docker 命令
docker ps
```

### 2.3 配置 Docker 镜像加速器（可选，国内服务器推荐）

```bash
# 创建或编辑 Docker 配置文件
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

# **逐行解释 daemon.json：**
# registry-mirrors: Docker Hub 镜像加速地址列表
#   中科大 (ustc) 和网易 (163) 是国内常用的加速器
#   适用于从 Docker Hub 拉取镜像较慢的服务器
# log-driver: 日志驱动，json-file 是默认的 JSON 文件格式
# log-opts.max-size: 每个日志文件最大 10MB，防止日志撑爆磁盘
# log-opts.max-file: 保留最近 3 个日志文件

# 重启 Docker 使配置生效
sudo systemctl restart docker

# 验证加速器
docker info | grep -A 3 "Registry Mirrors"
```

### 2.4 安装 Nginx（用于反向代理）

```bash
# ---- Ubuntu / Debian ----
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# ---- CentOS / Rocky / RHEL ----
sudo yum install -y nginx
# 或
sudo dnf install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 验证 Nginx
sudo nginx -t
curl http://localhost
# 看到 Welcome to nginx 即成功
```

---

## 第三章：Jenkins 容器化部署

### 3.1 原理：Docker-outside-of-Docker (DinD)

```
                        Linux 服务器
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌───────────────────────┐     ┌──────────────────────────┐      │
│  │   Nginx (端口 80/443)  │────▶│  Jenkins (端口 8080)      │      │
│  │   反向代理 + SSL       │     │  docker exec/build/push  │      │
│  └───────────────────────┘     └──────────┬───────────────┘      │
│                                           │                      │
│                                 /var/run/docker.sock              │
│                                           │                      │
│                                           ▼                      │
│                              ┌──────────────────────┐            │
│                              │  宿主机 Docker 守护进程 │            │
│                              │  (直接构建和运行容器)   │            │
│                              └──────────────────────┘            │
│                                     │                            │
│                          ┌──────────┴──────────┐                 │
│                          ▼                     ▼                 │
│                   sre-learning-app        sre-mysql              │
│                   (端口 3000)              (端口 3306)            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**核心思想**：将宿主机的 `/var/run/docker.sock` 挂载到 Jenkins 容器内。Jenkins 容器内执行 `docker` 命令时，实际是通过这个 Unix 套接字与宿主机的 Docker 守护进程通信。这样 Jenkins 在容器内部，却能像在宿主机上一样构建和运行容器。

### 3.2 编写 Jenkins Compose 文件

> **📄 对应文件**：[docker-compose.jenkins.yml](docker-compose.jenkins.yml)

```yaml
version: '3.8'

services:
  jenkins:
    image: jenkins/jenkins:lts
    container_name: jenkins-server
    restart: unless-stopped

    # ====== 关键权限配置 ======
    # privileged: 特权模式，允许容器访问宿主机设备（docker.sock 需要）
    privileged: true
    # 以 root 用户运行（默认 jenkins 用户无 docker.sock 权限）
    user: root

    ports:
      - "8080:8080"      # Jenkins Web UI
      - "50000:50000"    # Jenkins Agent 通信端口

    volumes:
      # ---- Jenkins 数据持久化 ----
      # 映射到宿主机的 /opt/docker-data/jenkins-home
      # 容器删了，配置和构建历史还在
      - /opt/docker-data/jenkins-home:/var/jenkins_home

      # ---- Docker-in-Docker 核心卷 ----
      # ① Docker 套接字：让容器内 docker 命令与宿主机 Docker 通信
      - /var/run/docker.sock:/var/run/docker.sock
      # ② Docker CLI 二进制：Jenkins 官方镜像不含 docker 命令
      - /usr/bin/docker:/usr/bin/docker

    environment:
      # JVM 参数：限制 Jenkins 使用 2GB 内存（避免 OOM）
      - JAVA_OPTS=-Xmx2048m -Djenkins.install.runSetupWizard=false
      # 时区设置
      - TZ=Asia/Shanghai
```

### 3.3 准备目录并启动

```bash
# 创建数据目录
sudo mkdir -p /opt/docker-data/jenkins-home
sudo chown 1000:1000 /opt/docker-data/jenkins-home
# 为什么是 1000:1000？Jenkins 容器内以 uid=1000(jenkins) 运行
# 如果不改所有者，容器内 jenkins 用户无法写入宿主机目录

# 启动 Jenkins
cd /opt/app
docker compose -f ci-cd-tutorial/linux/docker-compose.jenkins.yml up -d

# 查看启动日志
docker logs -f jenkins-server
```

### 3.4 对比 Linux 与 Windows 的关键差异

| 项目         | Windows                   | Linux                                  |
| ------------ | ------------------------- | -------------------------------------- |
| 套接字路径   | `//var/run/docker.sock` | `/var/run/docker.sock`               |
| Docker CLI   | 挂载 `/usr/bin/docker`  | 挂载 `/usr/bin/docker`               |
| 数据目录权限 | 无需关心（Windows ACL）   | 需 `chown 1000:1000`                 |
| 路径格式     | `C:\xxx` 或 `/c/xxx`  | `/opt/xxx`                           |
| systemd 管理 | N/A                       | `systemctl enable docker`            |
| 文件权限     | 不需要                    | `chmod +x script.sh`                 |
| 防火墙       | Windows 防火墙            | `ufw` / `firewalld` / `iptables` |

### 3.5 初始化 Jenkins

```bash
# 获取初始密码
docker exec jenkins-server cat /var/jenkins_home/secrets/initialAdminPassword

# 输出示例: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
```

浏览器访问 `http://<你的服务器IP>:8080`，输入密码完成初始化。

> 安全提示：如果服务器有公网 IP，建议先配好 Nginx 反代 + HTTPS（见第五章），或者用 ufw 限制 8080 端口仅允许内网访问。

---

## 第四章：Jenkins 基础配置

### 4.1 安装必要插件

**路径**：Dashboard → Manage Jenkins → Plugins → Available plugins

| 插件名                        | 作用                      | 安装方式 |
| ----------------------------- | ------------------------- | -------- |
| **Pipeline**            | 流水线核心（通常已预装）  | 默认     |
| **Docker Pipeline**     | `docker.build()` 等语法 | 需安装   |
| **GitHub Integration**  | GitHub Webhook 集成       | 需安装   |
| **Credentials Binding** | 凭据注入                  | 需安装   |
| **Blue Ocean**          | Pipeline 可视化界面       | 推荐安装 |

### 4.2 添加凭据

#### GitHub Personal Access Token

```bash
# 在 GitHub 生成 Token：
# GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
# 权限: repo(全部), admin:repo_hook
```

在 Jenkins 添加：

- Dashboard → Manage Jenkins → Credentials → System → Global credentials → Add Credentials
- **Kind**: Username with password
- **Username**: 你的 GitHub 用户名
- **Password**: GitHub Personal Access Token
- **ID**: `github-token`

#### Docker Hub 凭据（可选）

- **Kind**: Username with password
- **Username**: Docker Hub 用户名
- **Password**: Docker Hub Access Token
- **ID**: `docker-hub-credentials`

### 4.3 Linux 下 Jenkins 的 Docker 权限验证

```bash
# 进入 Jenkins 容器
docker exec -it jenkins-server bash

# 验证 Docker 命令可用
docker --version
docker ps

# 预期输出（能看到宿主机上运行的所有容器）：
# CONTAINER ID   IMAGE                       COMMAND                   PORTS
# abc123   jenkins/jenkins:lts   "/sbin/tini -- /usr/…"   0.0.0.0:8080->8080/tcp
# def456   mysql:8.0             "docker-entrypoint.s…"   0.0.0.0:3306->3306/tcp

# exit 退出容器
exit
```

---

## 第五章：Nginx 反向代理与 SSL

### 5.1 为什么需要 Nginx？

```
用户浏览器                    Nginx                          Jenkins
    │                          │                              │
    │ https://jenkins.your.com │                              │
    │────────────────────────►│                              │
    │                          │                              │
    │                          │ http://localhost:8080        │
    │                          │────────────────────────────►│
    │                          │                              │
    │                          │ ◄────────────────────────────│
    │ ◄────────────────────────│                              │
    │                          │                              │
```

**Nginx 带来的好处：**

1. **HTTPS 终结**：统一管理 SSL 证书，应用无需关心
2. **域名访问**：`jenkins.your.com` 代替 `IP:8080`
3. **安全隔离**：8080 端口不暴露到公网
4. **负载均衡**：如需多实例，Nginx 负责分发
5. **缓存与压缩**：静态资源加速

### 5.2 配置 Jenkins 的 Nginx 反向代理

```nginx
# ============================================================
# SRE 运维学习平台 — Nginx 配置
# 文件位置: /etc/nginx/sites-available/jenkins.your.com
#          （CentOS: /etc/nginx/conf.d/jenkins.your.com.conf）
# ============================================================

# ---- 上游服务器定义 ----
# upstream 定义一组后端服务器，Nginx 会把请求转发给它们
upstream jenkins_backend {
    # 因为 Jenkins 在 Docker 中，通过 host.docker.internal 访问宿主机
    # 或用容器名（如果 Nginx 也在 Docker 网络中）
    server 127.0.0.1:8080;
}

# ---- HTTP → HTTPS 重定向 ----
server {
    listen 80;
    server_name jenkins.your.com;           # ① 替换为你的实际域名

    # 301 永久重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

# ---- HTTPS 服务器 ----
server {
    listen 443 ssl http2;                   # ② 监听 HTTPS（443）
    server_name jenkins.your.com;

    # ===== SSL 证书配置 =====
    ssl_certificate     /etc/ssl/certs/jenkins.your.com.pem;    # ③ 证书文件
    ssl_certificate_key /etc/ssl/private/jenkins.your.com.key;  # ④ 私钥文件

    # SSL 安全配置（现代浏览器推荐）
    ssl_protocols TLSv1.2 TLSv1.3;          # 只允许安全的 TLS 版本
    ssl_ciphers HIGH:!aNULL:!MD5;           # 强加密套件
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;        # SSL 会话缓存
    ssl_session_timeout 10m;

    # ---- 请求头设置 ----
    proxy_set_header Host $host;             # ⑤ 传递原始 Host 头
    proxy_set_header X-Real-IP $remote_addr; # ⑥ 传递客户端真实 IP
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;  # ⑦ 传递请求协议

    # ---- 根路径代理到 Jenkins ----
    location / {
        proxy_pass http://jenkins_backend;   # ⑧ 转发到 Jenkins
        proxy_redirect off;

        # WebSocket 支持（Jenkins 实时日志需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置（长任务不会超时）
        proxy_read_timeout 90s;
        proxy_connect_timeout 90s;
    }

    # ---- 静态资源缓存 ----
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://jenkins_backend;
        expires 7d;                          # ⑨ 静态资源缓存 7 天
        add_header Cache-Control "public, immutable";
    }
}
```

**逐行解释：**

| 行号 | 代码                                           | 含义                                                                     |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| ①   | `server_name jenkins.your.com`               | 指定这个 server 块匹配的域名。访问 jenkins.your.com 的请求才会进入此块   |
| ②   | `listen 443 ssl http2`                       | 监听 443 端口（HTTPS 默认端口），启用 SSL 和 HTTP/2 协议                 |
| ③   | `ssl_certificate`                            | PEM 格式的 SSL 证书文件路径。包含服务器证书和中间证书链                  |
| ④   | `ssl_certificate_key`                        | 证书私钥文件路径。注意保护好，**不要提交到 Git**                   |
| ⑤   | `proxy_set_header Host $host`                | 将客户端请求的原始 Host 头传递给后端。Jenkins 靠这个生成正确的重定向 URL |
| ⑥   | `proxy_set_header X-Real-IP $remote_addr`    | 传递客户端真实 IP，否则 Jenkins 看到的所有请求都来自 Nginx 的 IP         |
| ⑦   | `proxy_set_header X-Forwarded-Proto $scheme` | 告诉后端请求是 HTTP 还是 HTTPS。Jenkins 据此生成正确的绝对链接           |
| ⑧   | `proxy_pass http://jenkins_backend`          | 将请求转发给 upstream 定义的 Jenkins 后端                                |
| ⑨   | `expires 7d`                                 | 静态资源缓存控制：告诉浏览器缓存这些文件 7 天                            |

### 5.3 用 Certbot 免费获取 SSL 证书

```bash
# ---- 安装 Certbot ----
# Ubuntu / Debian
sudo apt install -y certbot python3-certbot-nginx

# CentOS / Rocky
sudo yum install -y certbot python3-certbot-nginx

# ---- 获取证书（自动配置 Nginx）----
# 确保域名已经指向服务器 IP，且 80/443 端口可访问
sudo certbot --nginx -d jenkins.your.com

# ---- 自动续期 ----
# Certbot 会自动添加 systemd timer，无需手动操作
# 测试续期是否正常
sudo certbot renew --dry-run

# 查看自动续期定时任务
systemctl list-timers | grep certbot
```

### 5.4 配置 Jenkins 的 Jenkins URL

**路径**：Dashboard → Manage Jenkins → System → Jenkins Location

```
Jenkins URL: https://jenkins.your.com
```

然后在 Jenkins 系统配置中找到 **Jenkins Location**，确保 URL 使用 HTTPS。同时配置：

```
# 在 Manage Jenkins → Configure System 中：
# 勾选 "Use your browser for this URL"（如适用）
```

### 5.5 配置 UFW 防火墙

```bash
# ---- Ubuntu UFW ----
sudo ufw allow 22/tcp       # SSH
sudo ufw allow 80/tcp       # HTTP
sudo ufw allow 443/tcp      # HTTPS
sudo ufw deny 8080          # 禁止公网直接访问 Jenkins
sudo ufw enable

# 查看状态
sudo ufw status verbose

# ---- CentOS firewalld ----
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --remove-port=8080/tcp
sudo firewall-cmd --reload
```

---

## 第六章：编写 Jenkinsfile

Jenkinsfile 的内容与 Windows 版本基本一致，但 Linux 部署脚本部分做了优化。

> **📄 对应文件**：[Jenkinsfile](Jenkinsfile)

### 6.1 Linux 环境下的 Jenkinsfile 关键差异

#!/bin/bash

pipeline {
    // 在任何可用的 agent 上运行
    agent any

    // ========== 定义构建参数 ==========
    parameters {
        string(name: 'BRANCH', defaultValue: 'main', description: '要构建的Git分支')
    }

    // ========== 定义环境变量 ==========
    environment {
        // Maven 本地仓库路径（用于缓存依赖）
        MAVEN_OPTS = '-Dmaven.repo.local=/var/jenkins_home/.m2/repository'
        // Java 环境变量
        JAVA_HOME = '/usr/lib/jvm/java-11-openjdk-amd64'
    }

    // ========== 定义构建阶段 ==========
    stages {
        // 阶段1：拉取代码
        stage('Checkout') {
            steps {
                echo '正在从 GitHub 拉取代码...'
                git branch: params.BRANCH,
                    url: 'https://github.com/Mowanmvm/CICD.git'
                echo '代码拉取完成'
            }
        }

    // 阶段2：编译代码
        stage('Compile') {
            steps {
                echo '开始编译 Java 代码...'
                sh 'mvn clean compile'
                echo '编译完成'
            }
        }

    // 阶段3：运行单元测试
        stage('Test') {
            steps {
                echo '开始运行单元测试...'
                sh 'mvn test'
                echo '测试完成'
            }
            post {
                // 保存测试报告
                always {
                    junit 'target/surefire-reports/*.xml'
                }
            }
        }

    // 阶段4：打包成 JAR
        stage('Package') {
            steps {
                echo '开始打包...'
                sh 'mvn package -DskipTests'
                echo '打包完成'
            }
            post {
                success {
                    // 保存构建产物
                    archiveArtifacts artifacts: 'target/*.jar', fingerprint: true
                }
            }
        }

    // 阶段5：显示结果
        stage('Result') {
            steps {
                echo '========================================'
                echo '构建成功！'
                echo '========================================'
                sh 'ls -la target/*.jar'
            }
        }
    }

// ========== 构建后操作 ==========
    post {
        always {
            echo "构建完成 - ${env.JOB_NAME} #${env.BUILD_NUMBER}"
        }
        success {
            echo ' 恭喜！所有阶段都成功了！'
        }
        failure {
            echo '构建失败，请检查 Console Output 中的错误信息'
        }
    }
}

### 6.2 Linux 部署脚本

> **📄 对应文件**：[deploy.sh](deploy.sh)

```bash
#!/bin/bash

set -euo pipefail  # ① 严格模式：任何错误立即退出

# ========== 彩色输出 ==========
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ========== 解析命令行参数 ==========
# 使用 getopts 解析 --key value 格式的参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        --env)      ENV="$2";      shift 2 ;;  # 部署环境 dev/staging/production
        --registry) REGISTRY="$2"; shift 2 ;;  # Docker 镜像仓库地址
        --image)    IMAGE="$2";    shift 2 ;;  # 镜像名称
        --tag)      TAG="$2";      shift 2 ;;  # 镜像标签（Git commit SHA）
        --db-pass)  DB_PASS="$2";  shift 2 ;;  # 数据库密码
        --db-name)  DB_NAME="$2";  shift 2 ;;  # 数据库名称
        --port)     PORT="$2";     shift 2 ;;  # 应用端口
        *)  echo "未知参数: $1"; exit 1 ;;
    esac
done

# ========== 参数校验 ==========
# -z: 检查变量是否为空，为空则报错退出
[ -z "${ENV}" ]     && { log_error "缺少 --env 参数"; exit 1; }
[ -z "${REGISTRY}" ] && { log_error "缺少 --registry 参数"; exit 1; }
[ -z "${IMAGE}" ]   && { log_error "缺少 --image 参数"; exit 1; }
[ -z "${TAG}" ]     && { log_error "缺少 --tag 参数"; exit 1; }
[ -z "${DB_PASS}" ] && { log_error "缺少 --db-pass 参数"; exit 1; }

# 默认值（如果未指定）
DB_NAME="${DB_NAME:-sre_learning}"
PORT="${PORT:-3000}"

log_info "========================================"
log_info "  开始部署到 ${ENV} 环境"
log_info "  镜像: ${REGISTRY}/${IMAGE}:${TAG}"
log_info "========================================"

# ========== 创建部署目录 ==========
# -p: 如目录已存在不报错
DEPLOY_DIR="/opt/sre-app/${ENV}"
mkdir -p "${DEPLOY_DIR}"
cd "${DEPLOY_DIR}"
log_info "部署目录: ${DEPLOY_DIR}"

# ========== 生成 docker-compose.yml ==========
# 使用 cat << EOF > file 生成配置文件
# 这种方式比手动编辑更可靠，且部署目录干净
cat > docker-compose.yml << EOF
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
EOF

log_info "docker-compose.yml 已生成"

# ========== 拉取最新镜像 ==========
log_info " 拉取最新镜像..."
docker compose pull app
log_info "镜像拉取完成"

# ========== 部署服务 ==========
log_info "启动服务..."
# --remove-orphans: 删除 compose 文件中不存在的旧容器
docker compose up -d --remove-orphans
log_info "服务已启动"

# ========== 清理旧镜像 ==========
log_info "清理旧镜像..."
# docker image prune -f: 删除未被使用的 dangling 镜像
# docker image prune -a -f: 删除所有未被使用的镜像（保留最新）
docker image prune -f
log_info "清理完成"

# ========== 输出状态 ==========
echo ""
log_info "========================================"
log_info "  部署完成！"
log_info "  环境: ${ENV}"
log_info "  镜像: ${REGISTRY}/${IMAGE}:${TAG}"
log_info "  访问: http://localhost:${PORT}"
log_info "========================================"
```

**逐行解释：**

| 行                      | 代码/概念             | 含义                                                                                                                               |
| ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ①                      | `set -euo pipefail` | **Shell 严格模式**：`-e` 命令失败立即退出；`-u` 使用未定义变量时报错；`-o pipefail` 管道中任一命令失败都使整个管道失败 |
| `getopts`             | 参数解析              | 用于解析 `--key value` 格式的命令行参数，使脚本可复用                                                                            |
| `DEPLOY_DIR`          | 环境隔离              | 每个环境有独立的部署目录 `/opt/sre-app/dev`、`/opt/sre-app/production`                                                         |
| `cat << EOF > file`   | 生成配置文件          | 用 heredoc 语法动态生成 docker-compose.yml，避免在 Jenkinsfile 中嵌入多行字符串                                                    |
| `docker compose pull` | 拉取新镜像            | 在重启服务前先拉取新版本，确保启动时是最新镜像                                                                                     |
| `docker image prune`  | 磁盘清理              | 删除旧的 dangling 镜像，防止磁盘被历史版本占满                                                                                     |

---

## 第七章：GitHub Webhook 配置

### 7.1 创建 Jenkins Pipeline 任务

1. **Dashboard → New Item** → 输入名称 `sre-learning-pipeline` → 选择 **Pipeline** → OK
2. **配置 Pipeline 来源：**

   ```
   Definition:    Pipeline script from SCM
   SCM:           Git
   Repository URL: https://github.com/<your-username>/<your-repo>.git
   Credentials:   github-token
   Branches:      */main
   Script Path:   ci-cd-tutorial/linux/Jenkinsfile
   ```
3. **Build Triggers：** 勾选 `GitHub hook trigger for GITScm polling`

### 7.2 在 GitHub 配置 Webhook

GitHub 仓库 → **Settings → Webhooks → Add webhook**：

| 字段                   | 值                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Payload URL**  | `http://<你的服务器IP>:8080/github-webhook/` 或 `https://jenkins.your.com/github-webhook/` |
| **Content type** | `application/json`                                                                           |
| **Secret**       | 留空或设置密钥                                                                                 |
| **Events**       | `Just the push event`                                                                        |
| **Active**       | 勾选                                                                                        |

### 7.3 Webhook 调试技巧

```bash
# 查看 Jenkins Webhook 日志
docker logs jenkins-server --tail 100 | grep -i "github\|webhook"

# 手动测试 Webhook（模拟 GitHub 推送）
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"ref": "refs/heads/main"}' \
  http://localhost:8080/github-webhook/
```

---

## 第八章：生产环境部署方案

### 8.1 一键部署脚本

> **📄 对应文件**：[setup.sh](setup.sh)

```bash
#!/bin/bash
set -euo pipefail

# 颜色定义
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    err "请以 root 或使用 sudo 运行此脚本"
    exit 1
fi

# ---- 配置变量 ----
GIT_REPO="https://github.com/<your-username>/<your-repo>.git"
DEPLOY_DIR="/opt/app"

info "=========================================="
info "  SRE 平台 — Linux 一键部署"
info "=========================================="

# ---- 1. 系统更新 ----
info "更新系统包..."
apt update && apt upgrade -y

# ---- 2. 安装基础工具 ----
info "安装基础工具..."
apt install -y curl wget git vim nginx certbot python3-certbot-nginx

# ---- 3. 安装 Docker ----
info "安装 Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# ---- 4. 安装 Docker Compose ----
info "安装 Docker Compose..."
apt install -y docker-compose-plugin

# ---- 5. 克隆项目代码 ----
info "克隆项目代码..."
mkdir -p "${DEPLOY_DIR}"
git clone "${GIT_REPO}" "${DEPLOY_DIR}"

# ---- 6. 创建 Jenkins 数据目录 ----
info "创建 Jenkins 数据目录..."
mkdir -p /opt/docker-data/jenkins-home
chown 1000:1000 /opt/docker-data/jenkins-home

# ---- 7. 启动 Jenkins ----
info "启动 Jenkins..."
cd "${DEPLOY_DIR}"
docker compose -f ci-cd-tutorial/linux/docker-compose.jenkins.yml up -d

# ---- 8. 输出信息 ----
echo ""
info "========================================"
info "  部署完成！"
info "========================================"
info "  Jenkins:   http://$(curl -s ifconfig.me):8080"
info "  项目目录:  ${DEPLOY_DIR}"
info ""
info "  下一步："
info "  1. 访问 http://$(curl -s ifconfig.me):8080 初始化 Jenkins"
info "  2. 初始密码: docker exec jenkins-server cat /var/jenkins_home/secrets/initialAdminPassword"
info "  3. 配置域名 DNS 指向本机 IP"
info "  4. 运行 sudo certbot --nginx -d jenkins.your.com 获取 SSL"
info "========================================"
```

### 8.2 应用与 MySQL 独立部署

生产环境建议将 MySQL 和应用分开管理，而不是让 Jenkins 每次都重新部署 MySQL：

```yaml
# /opt/sre-app/production/docker-compose.yml
version: '3.8'

services:
  # 数据库单独管理，不随部署更新
  mysql:
    image: mysql:8.0
    container_name: sre-mysql-production
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: sre_learning
    volumes:
      - sre-mysql-data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "127.0.0.1:3306:3306"  # 仅监听本地
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  sre-mysql-data:
```

### 8.3 应用配置环境变量文件

创建 `.env` 文件管理敏感配置（不提交到 Git）：

```bash
# /opt/sre-app/production/.env
# 不提交到 Git，手动创建
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-strong-password-here
DB_NAME=sre_learning
NODE_ENV=production
```

---

## 第九章：监控与运维

### 9.1 Docker 容器监控

```bash
# ---- 查看所有运行中的容器 ----
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"

# ---- 查看容器资源使用 ----
docker stats --no-stream

# ---- 查看容器日志 ----
docker logs --tail 100 sre-app-production
docker logs --tail 50 sre-mysql-production

# ---- 容器重启策略检查 ----
docker inspect sre-app-production | grep -A 5 RestartPolicy
```

### 9.2 磁盘空间管理

```bash
# ---- 查看磁盘使用 ----
df -h

# ---- 查看 Docker 占用的磁盘 ----
docker system df

# ---- 定期清理脚本（crontab）----
# 编辑定时任务
crontab -e

# 每天凌晨 3 点清理未使用的 Docker 资源
0 3 * * * docker system prune -af --filter "until=24h" >> /var/log/docker-cleanup.log 2>&1
```

### 9.3 日志轮转

Linux 自带的 `logrotate` 管理 Docker 日志：

```bash
# /etc/logrotate.d/docker-containers
# 每天轮转 Docker 容器日志，保留 7 天
/var/lib/docker/containers/*/*.log {
    daily
    rotate 7
    copytruncate
    compress
    missingok
    delaycompress
}
```

### 9.4 服务健康检查

```bash
#!/bin/bash
# /opt/sre-app/healthcheck.sh
# 监控服务状态，异常时重启

check_service() {
    local name=$1
    local url=$2
    local max_retries=3

    for i in $(seq 1 $max_retries); do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo "$(date): $name 正常"
            return 0
        fi
        echo "$(date): $name 检测失败 ($i/$max_retries)"
        sleep 2
    done

    echo "$(date): $name 异常，尝试重启..."
    docker compose -f /opt/sre-app/production/docker-compose.yml restart
}

# 检查应用
check_service "sre-app" "http://localhost:3000/api/health"
```

配合 crontab 每 5 分钟检查一次：

```bash
*/5 * * * * bash /opt/sre-app/healthcheck.sh >> /var/log/sre-healthcheck.log 2>&1
```

### 9.5 备份策略

```bash
#!/bin/bash
# /opt/sre-app/backup.sh
# 备份 MySQL 数据到指定目录

BACKUP_DIR="/opt/backups/sre-db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=30

mkdir -p "${BACKUP_DIR}"

# 执行 MySQL 备份（使用 docker exec）
docker exec sre-mysql-production \
    mysqldump -u root -p"${DB_PASSWORD}" sre_learning \
    | gzip > "${BACKUP_DIR}/sre_learning_${TIMESTAMP}.sql.gz"

# 删除 30 天前的旧备份
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "$(date): 备份完成: sre_learning_${TIMESTAMP}.sql.gz"
```

---

## Linux 版文件结构

```
ci-cd-tutorial/
└── linux/                                    # ── Linux 版
    ├── README.md                             # 本教程文档（Linux 专用）
    ├── Dockerfile                            # 应用 Dockerfile（跨平台通用）
    ├── docker-compose.yml                    # 应用 + MySQL 编排
    ├── docker-compose.jenkins.yml            # Jenkins 容器化部署
    ├── Jenkinsfile                           # CI/CD 流水线定义
    ├── deploy.sh                             # Linux 部署脚本
    ├── setup.sh                              # Linux 一键安装脚本
    └── nginx.conf                            # Nginx 反向代理配置参考
```

## Linux vs Windows 核心差异总结

| 维度             | Windows            | Linux                      | 为什么                      |
| ---------------- | ------------------ | -------------------------- | --------------------------- |
| Docker 安装      | Docker Desktop     | `apt install docker-ce`  | Linux 是 Docker 原生平台    |
| Docker 权限      | 管理员运行         | `usermod -aG docker`     | Linux 通过用户组控制权限    |
| 路径格式         | `C:\` 或 `/c/` | `/opt/`、`/var/`       | Linux 文件系统层级标准      |
| Jenkins 数据权限 | 自动处理           | `chown 1000:1000`        | Jenkins 容器用户 uid=1000   |
| 服务管理         | 无                 | `systemctl enable/start` | Linux 的 systemd 初始化系统 |
| 防火墙           | Windows Defender   | UFW / firewalld / iptables | 不同的防火墙管理工具        |
| 反向代理         | IIS / 无需         | Nginx / Apache             | Linux 生态标准方案          |
| SSL 证书         | 付费 / 自签        | Let's Encrypt (免费)       | certbot 自动续期            |
| Shell 脚本       | 需 Git Bash        | 原生 bash                  | POSIX 兼容的 Shell 环境     |
| 定时任务         | 任务计划程序       | crontab / systemd timer    | Linux 的 cron 服务          |
| 生产就绪度       | 适合开发测试       | 适合生产部署               | Linux 更稳定、资源占用更少  |

---

## Linux 命令速查

```bash
# 文件操作
ls -lah          # 列出文件（含隐藏文件、人类可读大小）
chmod +x file    # 给文件添加执行权限
chown user:group file  # 修改文件所有者
tail -f file     # 实时跟踪文件输出
grep -r "key" .  # 递归搜索关键字

# 进程管理
ps aux           # 查看所有进程
top / htop       # 实时进程监控
kill -9 PID      # 强制杀死进程

# 网络
ss -tlnp         # 查看监听端口（替代 netstat）
curl -I url      # 查看 HTTP 响应头
nc -zv host port # 测试端口连通性

# 系统
df -h            # 磁盘使用情况
free -h          # 内存使用情况
uname -a         # 查看内核版本
cat /etc/os-release  # 查看系统版本

# Docker
docker logs --tail 50 container_name
docker exec -it container_name bash
docker system df
docker stats --no-stream
```

---

> **学习建议**：先在 Linux 虚拟机或云服务器的测试环境完整走一遍流程，熟悉后再上生产环境。遇到问题先看附录的排错指南，或在 Jenkins 的构建日志中搜索错误关键字。
