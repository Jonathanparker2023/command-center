const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { scoreTasks } = require('../lib/priorityEngine');

// GET /api/now — returns the single highest priority task
router.get('/', async (req, res) => {
  try {
    // Pull all actionable tasks
    const result = await pool.query(`
      SELECT * FROM tasks
      WHERE status IN ('upcoming', 'active')
      ORDER BY created_at ASC
    `);

    // Also surface upcoming calendar events as virtual tasks if not already in tasks
    const calEvents = await pool.query(`
      SELECT * FROM calendar_sync
      WHERE start_time BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM tasks WHERE source = 'calendar' AND source_id = calendar_sync.id
      )
      ORDER BY start_time ASC
    `);

    // Convert calendar events to task-like objects
    const calTasks = calEvents.rows.map(e => ({
      id: `cal_${e.id}`,
      title: e.title,
      source: 'calendar',
      source_id: e.id,
      scheduled_start: e.start_time,
      scheduled_end: e.end_time,
      energy_required: 'moderate',
      status: 'upcoming',
      is_calendar_event: true,
    }));

    const allTasks = [...result.rows, ...calTasks];

    if (!allTasks.length) {
      return res.json({ task: null, message: 'Nothing on the list. Add some tasks or projects.' });
    }

    const scored = await scoreTasks(allTasks);
    const top = scored[0];

    res.json({
      task: top,
      queue_length: allTasks.length,
    });
  } catch (err) {
    console.error('Now endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/now/complete — mark current task done and advance to next
router.post('/complete', async (req, res) => {
  const { task_id, outcome, rating, energy_level, note } = req.body;
  if (!task_id || !outcome) return res.status(400).json({ error: 'task_id and outcome required' });

  try {
    // Skip virtual calendar tasks (they don't live in the tasks table)
    if (!String(task_id).startsWith('cal_')) {
      // Update task status
      await pool.query(
        "UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = $1",
        [task_id]
      );

      // Log reflection
      await pool.query(
        `INSERT INTO reflections (task_id, outcome, rating, energy_level, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [task_id, outcome, rating, energy_level, note]
      );

      // If task came from a project step, mark step complete
      const task = await pool.query('SELECT * FROM tasks WHERE id = $1', [task_id]);
      if (task.rows[0]?.project_step_id) {
        await pool.query(
          "UPDATE project_steps SET status = 'completed', completed_at = NOW() WHERE id = $1",
          [task.rows[0].project_step_id]
        );
        // Recalculate project progress
        await pool.query(`
          UPDATE projects SET
            progress_pct = (
              SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*))
              FROM project_steps WHERE project_id = projects.id
            ),
            updated_at = NOW()
          WHERE id = $1
        `, [task.rows[0].project_id]);
      }
    }

    // Return the next task
    const next = await fetch(`http://localhost:${process.env.PORT || 3001}/api/now`).then(r => r.json());
    res.json({ completed: true, next });
  } catch (err) {
    console.error('Complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
