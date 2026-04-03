const pool = require('../db/pool');

async function detectPatterns() {
  // Pull last 30 days of reflections with task info
  const { rows } = await pool.query(`
    SELECT r.*, t.title, t.category, t.energy_required, t.source,
           EXTRACT(HOUR FROM r.completed_at AT TIME ZONE 'America/New_York') AS hour_of_day,
           EXTRACT(DOW FROM r.completed_at AT TIME ZONE 'America/New_York') AS day_of_week
    FROM reflections r
    JOIN tasks t ON r.task_id = t.id
    WHERE r.completed_at > NOW() - INTERVAL '30 days'
    ORDER BY r.completed_at DESC
  `);

  if (rows.length < 3) return null; // not enough data yet

  const patterns = {};

  // 1. Completion rate by category
  const byCategory = {};
  rows.forEach(r => {
    if (!r.category) return;
    if (!byCategory[r.category]) byCategory[r.category] = { completed: 0, total: 0 };
    byCategory[r.category].total++;
    if (r.outcome === 'completed') byCategory[r.category].completed++;
  });
  patterns.completion_by_category = Object.entries(byCategory).map(([cat, data]) => ({
    category: cat,
    rate: Math.round((data.completed / data.total) * 100),
    total: data.total,
  })).sort((a, b) => b.rate - a.rate);

  // 2. Energy patterns by time of day
  const byHour = {};
  rows.forEach(r => {
    const bucket = r.hour_of_day < 12 ? 'morning' : r.hour_of_day < 17 ? 'afternoon' : 'evening';
    if (!byHour[bucket]) byHour[bucket] = { energyLevels: [], completions: 0, total: 0 };
    if (r.energy_level) byHour[bucket].energyLevels.push(r.energy_level);
    byHour[bucket].total++;
    if (r.outcome === 'completed') byHour[bucket].completions++;
  });
  patterns.energy_by_time = Object.entries(byHour).map(([time, data]) => {
    const low = data.energyLevels.filter(e => e === 'low').length;
    const high = data.energyLevels.filter(e => e === 'high').length;
    const dominant = low > high ? 'low' : high > low ? 'high' : 'moderate';
    return { time, dominant_energy: dominant, completion_rate: Math.round((data.completions / data.total) * 100) };
  });

  // 3. Tasks that keep getting skipped/deferred
  const skipCounts = {};
  rows.filter(r => r.outcome === 'skipped' || r.outcome === 'deferred').forEach(r => {
    skipCounts[r.title] = (skipCounts[r.title] || 0) + 1;
  });
  patterns.frequently_skipped = Object.entries(skipCounts)
    .filter(([, count]) => count >= 2)
    .map(([title, count]) => ({ title, skip_count: count }))
    .sort((a, b) => b.skip_count - a.skip_count);

  // 4. Current streak
  const recent = rows.slice(0, 5);
  const streakCount = recent.findIndex(r => r.outcome !== 'completed');
  patterns.current_streak = streakCount === -1 ? recent.length : streakCount;

  // 5. Average rating
  const rated = rows.filter(r => r.rating);
  patterns.avg_rating = rated.length
    ? Math.round((rated.reduce((sum, r) => sum + r.rating, 0) / rated.length) * 10) / 10
    : null;

  patterns.analyzed_at = new Date().toISOString();
  patterns.sample_size = rows.length;

  // Save to user_profile
  await pool.query(
    'UPDATE user_profile SET productivity_patterns = $1, updated_at = NOW() WHERE id = 1',
    [JSON.stringify(patterns)]
  );

  return patterns;
}

module.exports = detectPatterns;
