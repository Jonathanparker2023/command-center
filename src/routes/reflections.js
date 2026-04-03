const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const detectPatterns = require('../lib/detectPatterns');

// GET recent reflections
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, t.title as task_title, t.category
      FROM reflections r JOIN tasks t ON r.task_id = t.id
      ORDER BY r.completed_at DESC LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST log a reflection
router.post('/', async (req, res) => {
  const { task_id, outcome, rating, energy_level, note, ai_observation } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO reflections (task_id, outcome, rating, energy_level, note, ai_observation)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [task_id, outcome, rating, energy_level, note, ai_observation]
    );

    // Mark task as completed
    await pool.query(
      "UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = $1",
      [task_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST run pattern detection manually
router.post('/analyze', async (req, res) => {
  try {
    const patterns = await detectPatterns();
    if (!patterns) return res.json({ message: 'Not enough data yet (need at least 3 reflections)' });
    res.json(patterns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET current patterns from profile
router.get('/patterns', async (req, res) => {
  try {
    const result = await pool.query('SELECT productivity_patterns FROM user_profile WHERE id = 1');
    res.json(result.rows[0]?.productivity_patterns || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
