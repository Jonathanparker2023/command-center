const pool = require('../db/pool');

// Determine Jon's current energy based on time of day and recent shift patterns
function estimateCurrentEnergy(hour, recentReflections) {
  // Check recent energy from reflections
  const recentEnergy = recentReflections.slice(0, 3).map(r => r.energy_level).filter(Boolean);
  const avgLow = recentEnergy.filter(e => e === 'low').length;
  if (avgLow >= 2) return 'low'; // recently drained

  // Time of day defaults
  if (hour >= 6 && hour < 12) return 'high';
  if (hour >= 12 && hour < 17) return 'moderate';
  if (hour >= 17 && hour < 21) return 'low';
  return 'low'; // late night
}

// Score how well task energy matches current energy
function energyMatchScore(taskEnergy, currentEnergy) {
  const levels = { low: 1, moderate: 2, high: 3 };
  const task = levels[taskEnergy] || 2;
  const current = levels[currentEnergy] || 2;
  const diff = Math.abs(task - current);
  if (diff === 0) return 100;
  if (diff === 1) return 60;
  return 20; // big mismatch
}

// Score time urgency for a task
function timeUrgencyScore(task, calendarEvents, maintenanceItems) {
  const now = Date.now();

  // Calendar events — non-negotiable, highest priority
  if (task.source === 'calendar') {
    const event = calendarEvents.find(e => String(e.id) === String(task.source_id));
    if (event) {
      const msUntil = new Date(event.start_time).getTime() - now;
      const hoursUntil = msUntil / (1000 * 60 * 60);
      if (hoursUntil <= 0) return 100;   // happening now
      if (hoursUntil <= 1) return 95;
      if (hoursUntil <= 2) return 85;
      if (hoursUntil <= 4) return 70;
      if (hoursUntil <= 8) return 55;
      if (hoursUntil <= 24) return 35;
      return 15;
    }
  }

  // Maintenance — escalates the more overdue it is
  if (task.source === 'maintenance') {
    const item = maintenanceItems.find(m => String(m.id) === String(task.source_id));
    if (item && item.next_due_at) {
      const daysOverdue = (now - new Date(item.next_due_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysOverdue > 30) return 90;
      if (daysOverdue > 14) return 75;
      if (daysOverdue > 7) return 60;
      if (daysOverdue > 0) return 45;
      return 20; // not yet due
    }
  }

  // Tasks with deadlines
  if (task.deadline) {
    const daysUntil = (new Date(task.deadline).getTime() - now) / (1000 * 60 * 60 * 24);
    if (daysUntil < 0) return 95;  // overdue
    if (daysUntil < 1) return 85;
    if (daysUntil < 3) return 65;
    if (daysUntil < 7) return 45;
    return 20;
  }

  // Flexible tasks with no deadline
  return 25;
}

// Score goal alignment
function goalAlignmentScore(task, projects, goals) {
  if (!task.project_id) return 20; // no project link

  const project = projects.find(p => p.id === task.project_id);
  if (!project) return 20;

  let score = project.priority * 15; // priority 1-5 → 15-75

  // Bonus if project links to an active goal
  if (project.goal_id) {
    const goal = goals.find(g => g.id === project.goal_id);
    if (goal) score += goal.priority * 5; // up to 25 bonus
  }

  return Math.min(score, 100);
}

// Score pattern learning from reflections
function patternScore(task, reflections) {
  const relevant = reflections.filter(r => r.task_category === task.category);
  if (!relevant.length) return 50; // no data, neutral

  const completed = relevant.filter(r => r.outcome === 'completed').length;
  const successRate = completed / relevant.length;

  // Momentum: last 3 tasks all completed?
  const lastThree = reflections.slice(0, 3);
  const onStreak = lastThree.length === 3 && lastThree.every(r => r.outcome === 'completed');
  const streakBonus = onStreak ? 15 : 0;

  return Math.min(successRate * 85 + streakBonus, 100);
}

async function scoreTasks(tasks) {
  const [calEvents, projects, goals, reflections, maintenance] = await Promise.all([
    pool.query('SELECT * FROM calendar_sync WHERE start_time >= NOW() ORDER BY start_time ASC'),
    pool.query("SELECT * FROM projects WHERE status = 'active'"),
    pool.query('SELECT * FROM goals WHERE is_active = true'),
    pool.query(`
      SELECT r.*, t.category as task_category
      FROM reflections r JOIN tasks t ON r.task_id = t.id
      ORDER BY r.completed_at DESC LIMIT 20
    `),
    pool.query('SELECT * FROM life_maintenance'),
  ]);

  const now = new Date();
  const hour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  const currentEnergy = estimateCurrentEnergy(hour, reflections.rows);

  const scored = tasks.map(task => {
    const urgency = timeUrgencyScore(task, calEvents.rows, maintenance.rows);
    const goalAlign = goalAlignmentScore(task, projects.rows, goals.rows);
    const energy = energyMatchScore(task.energy_required || 'moderate', currentEnergy);
    const pattern = patternScore(task, reflections.rows);

    const totalScore = (urgency * 0.40) + (goalAlign * 0.25) + (energy * 0.20) + (pattern * 0.15);

    return {
      ...task,
      _score: Math.round(totalScore),
      _breakdown: { urgency, goalAlign, energy, pattern, currentEnergy },
    };
  });

  return scored.sort((a, b) => b._score - a._score);
}

module.exports = { scoreTasks };
