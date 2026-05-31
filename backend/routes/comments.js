const express = require('express');
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/articles/:articleId/comments - 获取文章评论（树形结构）
router.get('/articles/:articleId/comments', async (req, res) => {
  try {
    const { articleId } = req.params;
    const { sort = 'newest' } = req.query;

    let orderBy = 'c.created_at ASC';
    if (sort === 'popular') {
      orderBy = 'c.likes_count DESC, c.created_at DESC';
    } else {
      orderBy = 'c.created_at DESC';
    }

    const [rows] = await pool.query(`
      SELECT c.id, c.content, c.article_id, c.user_id, c.parent_id, c.created_at, c.likes_count,
             u.username, u.nickname, u.avatar
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.article_id = ?
      ORDER BY ${orderBy}
    `, [articleId]);

    // 构建树形结构
    const commentMap = {};
    const roots = [];

    rows.forEach(c => {
      commentMap[c.id] = { ...c, replies: [] };
    });

    rows.forEach(c => {
      if (c.parent_id && commentMap[c.parent_id]) {
        commentMap[c.parent_id].replies.push(commentMap[c.id]);
      } else {
        roots.push(commentMap[c.id]);
      }
    });

    res.json(roots);
  } catch (err) {
    console.error('[COMMENTS LIST]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// POST /api/articles/:articleId/comments - 发表评论
router.post('/articles/:articleId/comments', authenticate, async (req, res) => {
  try {
    const { articleId } = req.params;
    const { content, parent_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: '评论内容不能为空' });
    }

    // 验证文章存在
    const [article] = await pool.query('SELECT id FROM articles WHERE id = ?', [articleId]);
    if (article.length === 0) {
      return res.status(404).json({ message: '文章不存在' });
    }

    // 如果是回复，验证父评论存在且属于同一文章
    if (parent_id) {
      const [parent] = await pool.query('SELECT id, article_id FROM comments WHERE id = ?', [parent_id]);
      if (parent.length === 0) {
        return res.status(404).json({ message: '要回复的评论不存在' });
      }
      if (parent[0].article_id !== parseInt(articleId)) {
        return res.status(400).json({ message: '评论与文章不匹配' });
      }
    }

    const [result] = await pool.query(
      'INSERT INTO comments (content, article_id, user_id, parent_id) VALUES (?, ?, ?, ?)',
      [content.trim(), articleId, req.user.id, parent_id || null]
    );

    const [newComment] = await pool.query(`
      SELECT c.id, c.content, c.article_id, c.user_id, c.parent_id, c.created_at,
             u.username, u.nickname, u.avatar
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `, [result.insertId]);

    res.status(201).json(newComment[0]);
  } catch (err) {
    console.error('[COMMENT CREATE]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// DELETE /api/comments/:id - 删除评论
router.delete('/comments/:id', authenticate, async (req, res) => {
  try {
    const [comment] = await pool.query('SELECT * FROM comments WHERE id = ?', [req.params.id]);
    if (comment.length === 0) {
      return res.status(404).json({ message: '评论不存在' });
    }

    const [user] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (comment[0].user_id !== req.user.id && user[0].role !== 'admin') {
      return res.status(403).json({ message: '无权删除此评论' });
    }

    await pool.query('DELETE FROM comments WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('[COMMENT DELETE]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// POST /api/comments/:id/like - 点赞/取消点赞评论
router.post('/comments/:id/like', authenticate, async (req, res) => {
  try {
    const commentId = req.params.id;
    const [comment] = await pool.query('SELECT id FROM comments WHERE id = ?', [commentId]);
    if (comment.length === 0) {
      return res.status(404).json({ message: '评论不存在' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, req.user.id]
    );

    if (existing.length > 0) {
      await pool.query('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, req.user.id]);
      await pool.query('UPDATE comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [commentId]);
      const [row] = await pool.query('SELECT likes_count FROM comments WHERE id = ?', [commentId]);
      return res.json({ liked: false, likes_count: row[0].likes_count });
    } else {
      await pool.query('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)', [commentId, req.user.id]);
      await pool.query('UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?', [commentId]);
      const [row] = await pool.query('SELECT likes_count FROM comments WHERE id = ?', [commentId]);
      return res.json({ liked: true, likes_count: row[0].likes_count });
    }
  } catch (err) {
    console.error('[COMMENT LIKE]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// GET /api/comments/:id/like - 查询当前用户评论点赞状态
router.get('/comments/:id/like', authenticate, async (req, res) => {
  try {
    const [existing] = await pool.query(
      'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    const [row] = await pool.query('SELECT likes_count FROM comments WHERE id = ?', [req.params.id]);
    res.json({ liked: existing.length > 0, likes_count: row[0]?.likes_count || 0 });
  } catch (err) {
    console.error('[COMMENT LIKE STATUS]', err);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;
