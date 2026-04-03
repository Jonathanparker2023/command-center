require('dotenv').config({ override: true });
const app = require('./app');
const syncCalendar = require('./lib/syncCalendar');
const detectPatterns = require('./lib/detectPatterns');

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`Command Center API running on port ${PORT}`);

  // Initial calendar sync on startup
  try { await syncCalendar(); } catch (err) { console.error('Initial calendar sync failed:', err.message); }

  // Sync calendar every 15 minutes
  setInterval(async () => {
    try { await syncCalendar(); } catch (err) { console.error('Calendar sync failed:', err.message); }
  }, 15 * 60 * 1000);

  // Run pattern detection once a week
  setInterval(async () => {
    try { await detectPatterns(); console.log('Pattern detection complete.'); }
    catch (err) { console.error('Pattern detection failed:', err.message); }
  }, 7 * 24 * 60 * 60 * 1000);
});
