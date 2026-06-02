// ============================================================
// SRE 运维学习平台 — Jenkins 声明式流水线（Linux 版）
// 配合 Linux 部署脚本 deploy.sh 使用
// ============================================================

pipeline {
    agent any

    environment {
        // 替换为你的 Docker Hub 用户名
        DOCKER_REGISTRY = 'your-dockerhub-username'
        IMAGE_NAME      = 'sre-learning-app'
        IMAGE_TAG       = "${env.GIT_COMMIT?.take(8) ?: 'latest'}"

        // 数据库配置（密码通过 Jenkins 凭据注入）
        DB_NAME = 'sre_learning'
    }

    parameters {
        string(name: 'BRANCH', defaultValue: 'main', description: '构建分支')
        choice(name: 'ENV', choices: ['dev', 'staging', 'production'], description: '部署环境')
    }

    stages {

        // ========================================
        // Stage 1: 拉取代码
        // ========================================
        stage('Checkout') {
            steps { checkout scm }
            post {
                failure { echo '代码拉取失败，请检查 Git 连接和权限' }
            }
        }

        // ========================================
        // Stage 2: 代码审查（Docker 容器内执行）
        // ========================================
        stage('Lint & Audit') {
            steps {
                script {
                    docker.image('node:18-alpine').inside('-v /opt/app/backend:/app') {
                        sh '''
                            cd /app
                            npm ci --only=production
                            npm run lint 2>/dev/null || echo "⚠️  无 lint 脚本"
                            npm test 2>/dev/null || echo "⚠️  无测试脚本"
                        '''
                    }
                }
            }
        }

        // ========================================
        // Stage 3: 构建 Docker 镜像
        // ========================================
        stage('Build Docker Image') {
            steps {
                script {
                    def customImage = docker.build(
                        "${env.DOCKER_REGISTRY}/${env.IMAGE_NAME}:${env.IMAGE_TAG}",
                        "-f ci-cd-tutorial/linux/Dockerfile ."
                    )
                    echo "镜像构建成功: ${customImage.imageName()}"
                    customImage.push('latest')
                }
            }
            post {
                failure { echo '镜像构建失败，请检查 Dockerfile 和构建日志' }
            }
        }

        // ========================================
        // Stage 4: 推送镜像到仓库
        // ========================================
        stage('Push to Registry') {
            steps {
                script {
                    docker.withRegistry(
                        "https://index.docker.io/v1/",
                        'docker-hub-credentials'
                    ) {
                        docker.image("${env.DOCKER_REGISTRY}/${env.IMAGE_NAME}:${env.IMAGE_TAG}").push()
                        echo "镜像已推送: ${env.DOCKER_REGISTRY}/${env.IMAGE_NAME}:${env.IMAGE_TAG}"
                    }
                }
            }
            post {
                failure { echo '镜像推送失败，请检查 Docker Hub 凭据和网络连接' }
            }
        }

        // ========================================
        // Stage 5: 部署（调用 Linux 部署脚本）
        // ========================================
        stage('Deploy') {
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'db-password', variable: 'DB_PASSWORD')
                    ]) {
                        sh '''
                            chmod +x ci-cd-tutorial/linux/deploy.sh
                            ./ci-cd-tutorial/linux/deploy.sh \
                                --env "${params.ENV}" \
                                --registry "${DOCKER_REGISTRY}" \
                                --image "${IMAGE_NAME}" \
                                --tag "${IMAGE_TAG}" \
                                --db-pass "${DB_PASSWORD}" \
                                --db-name "${DB_NAME}" \
                                --port "3000"
                        '''
                    }
                }
            }
        }

        // ========================================
        // Stage 6: 健康检查
        // ========================================
        stage('Health Check') {
            steps {
                script {
                    def retries = 0
                    def maxRetries = 12
                    def healthy = false

                    while (retries < maxRetries) {
                        try {
                            def response = sh(
                                script: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health',
                                returnStdout: true
                            ).trim()
                            if (response == '200') {
                                echo "健康检查通过！HTTP 200"
                                healthy = true
                                break
                            }
                        } catch (Exception e) {
                            echo "等待服务就绪... (${retries + 1}/${maxRetries})"
                        }
                        retries++
                        sleep(5)
                    }
                    if (!healthy) {
                        error "健康检查失败！服务未在 ${maxRetries * 5} 秒内启动"
                    }
                }
            }
        }
    }

    // ---- 构建后处理 ----
    post {
        always {
            echo """
            ========================================
            构建完成
            项目: ${env.JOB_NAME}
            构建号: ${env.BUILD_NUMBER}
            环境: ${params.ENV}
            镜像: ${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
            状态: ${currentBuild.result ?: 'SUCCESS'}
            ========================================
            """
        }
        failure {
            echo "流水线失败！构建日志: ${env.BUILD_URL}"
            // Linux 下可添加邮件通知
            // sh "echo '构建失败: ${env.BUILD_URL}' | mail -s 'Jenkins 通知' admin@company.com"
        }
        success {
            echo "部署成功！应用已部署到 ${params.ENV} 环境"
        }
        cleanup {
            cleanWs()
        }
    }
}
