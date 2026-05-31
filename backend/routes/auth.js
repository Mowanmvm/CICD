const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register - 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ message: '用户名长度为 3-20 个字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: '密码长度至少 6 位' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ message: '用户名已存在' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)',
      [username, hashed, nickname || username]
    );

    const token = jwt.sign({ id: result.insertId, username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      message: '注册成功',
      token,
      user: { id: result.insertId, username, nickname: nickname || username, role: 'user' },
    });
  } catch (err) {
    console.error('[REGISTER]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// POST /api/auth/login - 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      message: '登录成功',
      token,
      user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    console.error('[LOGIN]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// GET /api/auth/me - 获取当前用户信息
router.get('/me', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, nickname, role, avatar, created_at FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[ME]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// PUT /api/auth/password - 修改密码
router.put('/password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: '旧密码和新密码不能为空' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: '新密码长度至少 6 位' });
    }

    const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(oldPassword, rows[0].password);
    if (!valid) {
      return res.status(400).json({ message: '旧密码不正确' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('[CHANGE PASSWORD]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// PUT /api/auth/profile - 更新个人信息（昵称、头像）
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { nickname, avatar } = req.body;
    if (!nickname && avatar === undefined) {
      return res.status(400).json({ message: '没有需要更新的信息' });
    }
    const updates = [];
    const params = [];
    if (nickname) {
      if (nickname.length > 50) return res.status(400).json({ message: '昵称过长' });
      updates.push('nickname = ?');
      params.push(nickname);
    }
    if (avatar !== undefined) {
      updates.push('avatar = ?');
      params.push(avatar);
    }
    params.push(req.user.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const [rows] = await pool.query('SELECT id, username, nickname, role, avatar FROM users WHERE id = ?', [req.user.id]);
    res.json({ message: '更新成功', user: rows[0] });
  } catch (err) {
    console.error('[UPDATE PROFILE]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// GET /api/auth/users - 获取用户列表（管理员用）
router.get('/users', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, nickname, role, created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('[USERS]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;
