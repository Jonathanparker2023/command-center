require('dotenv').config({ override: true });
const app = require('./app');
const syncCalendar = require('./lib/syncCalendar');

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`Command Center API running on port ${PORT}`);
  // Initial sync on startup
  try { await syncCalendar(); } catch (err) { console.error('Initial calendar sync failed:', err.message); }
  // Sync every 15 minutes
  setInterval(async () => {
    try { await syncCalendar(); } catch (err) { console.error('Calendar sync failed:', err.message); }
  }, 15 * 60 * 1000);
});
