const { getCalendarClient } = require('./googleCalendar');
const pool = require('../db/pool');

const CALENDARS = [
  { id: '886236859435-60l2hol58ad4othhbj6nlml5e7s6mei5.apps.googleusercontent.com', name: 'Primary' },
];

async function syncCalendar() {
  const calendar = getCalendarClient();

  // Get the user's actual calendar list
  const calList = await calendar.calendarList.list();
  const cals = calList.data.items || [];

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // next 30 days

  let totalSynced = 0;

  for (const cal of cals) {
    // Skip contacts/birthdays (not calendar events)
    if (cal.id.includes('addressbook') || cal.id.includes('contacts')) continue;

    try {
      const response = await calendar.events.list({
        calendarId: cal.id,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });

      const events = response.data.items || [];

      for (const event of events) {
        if (!event.summary) continue;

        const startTime = event.start.dateTime || event.start.date;
        const endTime = event.end?.dateTime || event.end?.date;
        const isAllDay = !event.start.dateTime;

        await pool.query(
          `INSERT INTO calendar_sync (calendar_id, calendar_name, event_id, title, start_time, end_time, is_all_day, status, last_synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (event_id) DO UPDATE SET
             title = EXCLUDED.title,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             is_all_day = EXCLUDED.is_all_day,
             status = EXCLUDED.status,
             last_synced_at = NOW()`,
          [cal.id, cal.summary, event.id, event.summary, startTime, endTime, isAllDay, event.status || 'confirmed']
        );
        totalSynced++;
      }
    } catch (err) {
      console.error(`Error syncing calendar ${cal.summary}:`, err.message);
    }
  }

  console.log(`Calendar sync complete: ${totalSynced} events synced`);
  return totalSynced;
}

module.exports = syncCalendar;
