const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'sre-learning-jwt-secret-key';

// 验证 JWT Token
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未登录，请先登录' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token 已过期，请重新登录' });
  }
}

// 验证管理员权限
async function requireAdmin(req, res, next) {
  const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
  if (rows.length === 0 || rows[0].role !== 'admin') {
    return res.status(403).json({ message: '权限不足，需要管理员权限' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, JWT_SECRET };
