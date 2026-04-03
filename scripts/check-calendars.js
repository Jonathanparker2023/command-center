require('dotenv').config({ override: true });
const { getCalendarClient } = require('../src/lib/googleCalendar');

async function main() {
  const calendar = getCalendarClient();
  const now = new Date().toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const calList = await calendar.calendarList.list();
  const cals = calList.data.items || [];

  for (const cal of cals) {
    console.log('\nCalendar:', cal.summary, '(' + cal.id + ')');
    try {
      const res = await calendar.events.list({
        calendarId: cal.id,
        timeMin: now,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 5,
      });
      const events = res.data.items || [];
      console.log('  Events:', events.length);
      events.forEach(e => console.log('  -', e.summary, e.start.dateTime || e.start.date));
    } catch (err) {
      console.log('  Error:', err.message);
    }
  }
}

main();
