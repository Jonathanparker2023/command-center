const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reflections ORDER BY completed_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { task_id, outcome, rating, energy_level, note, ai_observation } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO reflections (task_id, outcome, rating, energy_level, note, ai_observation)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [task_id, outcome, rating, energy_level, note, ai_observation]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
