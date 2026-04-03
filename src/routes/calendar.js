const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const syncCalendar = require('../lib/syncCalendar');

// GET upcoming events from DB
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM calendar_sync
      WHERE start_time >= NOW()
      ORDER BY start_time ASC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST trigger a manual sync
router.post('/sync', async (req, res) => {
  try {
    const count = await syncCalendar();
    res.json({ synced: count });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
