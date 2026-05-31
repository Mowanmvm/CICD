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
                echo '✅ 构建成功！'
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
            echo '🎉 恭喜！所有阶段都成功了！'
        }
        failure {
            echo '❌ 构建失败，请检查 Console Output 中的错误信息'
        }
    }
}
