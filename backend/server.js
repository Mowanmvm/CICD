const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./config/db');
const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const commentRoutes = require('./routes/comments');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 根路径返回 ops-learning.html（禁用缓存）
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, '..', 'ops-learning.html'));
});

// 静态文件服务（前端页面 + 上传文件）
app.use(express.static(path.join(__dirname, '..'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  },
}));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api', commentRoutes);

// 上传路由 — 头像文件
app.use('/api/upload', uploadRoutes);
// 提供上传文件的静态访问
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 启动服务
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`\n======================================`);
      console.log(`  SRE 运维学习平台 后端服务已启动`);
      console.log(`  地址: http://localhost:${PORT}`);
      console.log(`  API:  http://localhost:${PORT}/api`);
      console.log(`======================================\n`);
    });
  } catch (err) {
    console.error('[SERVER] 启动失败:', err.message);
    console.error('[SERVER] 请确保 MySQL 已启动且连接信息正确');
    process.exit(1);
  }
}

start();
