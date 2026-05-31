const express = require('express');
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/articles - 文章列表
router.get('/', async (req, res) => {
  try {
    const { category, tag, page = 1, limit = 20, sort = 'latest' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT a.id, a.title, a.summary, a.tags, a.category, a.user_id, a.likes_count, a.created_at, a.updated_at,
             u.username, u.nickname, u.avatar
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      sql += ' AND a.category = ?';
      params.push(category);
    }
    if (tag) {
      sql += ' AND FIND_IN_SET(?, a.tags)';
      params.push(tag);
    }

    // 排序：popular 按赞数降序，updated 按更新时间降序，latest 按发布时间降序
    if (sort === 'popular') {
      sql += ' ORDER BY a.likes_count DESC, a.created_at DESC';
    } else if (sort === 'updated') {
      sql += ' ORDER BY a.updated_at DESC';
    } else {
      sql += ' ORDER BY a.created_at DESC';
    }
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await pool.query(sql, params);

    // 构建 COUNT 查询（与主查询条件一致）
    let countSql = 'SELECT COUNT(*) as total FROM articles WHERE 1=1';
    const countParams = [];
    if (category) {
      countSql += ' AND category = ?';
      countParams.push(category);
    }
    if (tag) {
      countSql += ' AND FIND_IN_SET(?, tags)';
      countParams.push(tag);
    }
    const [countResult] = await pool.query(countSql, countParams);

    res.json({
      articles: rows,
      total: countResult[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('[ARTICLES LIST]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// GET /api/articles/:id - 文章详情
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, u.username, u.nickname, u.avatar
      FROM articles a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: '文章不存在' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[ARTICLE DETAIL]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// POST /api/articles - 发布文章
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, content, summary, tags, category } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: '标题和内容不能为空' });
    }

    const [result] = await pool.query(
      'INSERT INTO articles (title, content, summary, tags, category, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [title, content, summary || '', tags || '', category || '', req.user.id]
    );

    res.status(201).json({ message: '发布成功', id: result.insertId });
  } catch (err) {
    console.error('[ARTICLE CREATE]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// PUT /api/articles/:id - 编辑文章
router.put('/:id', authenticate, async (req, res) => {
  try {
    const [article] = await pool.query('SELECT * FROM articles WHERE id = ?', [req.params.id]);
    if (article.length === 0) {
      return res.status(404).json({ message: '文章不存在' });
    }

    const [user] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (article[0].user_id !== req.user.id && user[0].role !== 'admin') {
      return res.status(403).json({ message: '无权修改此文章' });
    }

    const { title, content, summary, tags, category } = req.body;
    await pool.query(
      'UPDATE articles SET title = ?, content = ?, summary = ?, tags = ?, category = ? WHERE id = ?',
      [title, content, summary || '', tags || '', category || '', req.params.id]
    );

    res.json({ message: '更新成功' });
  } catch (err) {
    console.error('[ARTICLE UPDATE]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// DELETE /api/articles/:id - 删除文章
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [article] = await pool.query('SELECT * FROM articles WHERE id = ?', [req.params.id]);
    if (article.length === 0) {
      return res.status(404).json({ message: '文章不存在' });
    }

    const [user] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (article[0].user_id !== req.user.id && user[0].role !== 'admin') {
      return res.status(403).json({ message: '无权删除此文章' });
    }

    await pool.query('DELETE FROM articles WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('[ARTICLE DELETE]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// POST /api/articles/:id/like - 点赞/取消点赞
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const articleId = req.params.id;
    const [article] = await pool.query('SELECT id FROM articles WHERE id = ?', [articleId]);
    if (article.length === 0) {
      return res.status(404).json({ message: '文章不存在' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM likes WHERE article_id = ? AND user_id = ?', [articleId, req.user.id]
    );

    if (existing.length > 0) {
      // 取消点赞
      await pool.query('DELETE FROM likes WHERE article_id = ? AND user_id = ?', [articleId, req.user.id]);
      await pool.query('UPDATE articles SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [articleId]);
      const [row] = await pool.query('SELECT likes_count FROM articles WHERE id = ?', [articleId]);
      return res.json({ liked: false, likes_count: row[0].likes_count });
    } else {
      // 点赞
      await pool.query('INSERT INTO likes (article_id, user_id) VALUES (?, ?)', [articleId, req.user.id]);
      await pool.query('UPDATE articles SET likes_count = likes_count + 1 WHERE id = ?', [articleId]);
      const [row] = await pool.query('SELECT likes_count FROM articles WHERE id = ?', [articleId]);
      return res.json({ liked: true, likes_count: row[0].likes_count });
    }
  } catch (err) {
    console.error('[LIKE]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// GET /api/articles/:id/like - 查询当前用户点赞状态
router.get('/:id/like', authenticate, async (req, res) => {
  try {
    const [existing] = await pool.query(
      'SELECT id FROM likes WHERE article_id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    const [row] = await pool.query('SELECT likes_count FROM articles WHERE id = ?', [req.params.id]);
    res.json({ liked: existing.length > 0, likes_count: row[0]?.likes_count || 0 });
  } catch (err) {
    console.error('[LIKE STATUS]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;
