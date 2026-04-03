const pool = require('../db/pool');

async function buildContext() {
  const [profile, tasks, goals, projects, reflections, maintenance] = await Promise.all([
    pool.query('SELECT * FROM user_profile LIMIT 1'),
    pool.query(`
      SELECT * FROM tasks
      WHERE status IN ('upcoming', 'active')
      ORDER BY scheduled_start ASC NULLS LAST, priority DESC
      LIMIT 4
    `),
    pool.query(`
      SELECT id, title, category, priority, current_status, target_date
      FROM goals WHERE is_active = true ORDER BY priority DESC
    `),
    pool.query(`
      SELECT id, title, category, priority, progress_pct, deadline,
             (SELECT title FROM project_steps WHERE project_id = projects.id AND status = 'pending' ORDER BY step_order ASC LIMIT 1) AS next_step
      FROM projects WHERE status = 'active' ORDER BY priority DESC
    `),
    pool.query(`
      SELECT r.outcome, r.rating, r.energy_level, r.note, t.title as task_title, r.completed_at
      FROM reflections r JOIN tasks t ON r.task_id = t.id
      ORDER BY r.completed_at DESC LIMIT 3
    `),
    pool.query(`
      SELECT name, category, next_due_at
      FROM life_maintenance
      WHERE next_due_at < NOW() + INTERVAL '3 days'
      ORDER BY next_due_at ASC LIMIT 5
    `),
  ]);

  const p = profile.rows[0] || {};
  const now = new Date().toLocaleString('en-US', { timeZone: p.timezone || 'America/New_York' });
  const currentTask = tasks.rows[0] || null;
  const upcomingTasks = tasks.rows.slice(1);

  const context = {
    now,
    current_task: currentTask,
    upcoming_tasks: upcomingTasks,
    user_profile: {
      name: p.name,
      energy_patterns: p.energy_patterns,
      meal_preferences: p.meal_preferences,
      fitness_goals: p.fitness_goals,
    },
    active_goals: goals.rows,
    active_projects: projects.rows,
    recent_reflections: reflections.rows,
    overdue_maintenance: maintenance.rows,
  };

  return context;
}

module.exports = buildContext;
