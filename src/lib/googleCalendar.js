const { google } = require('googleapis');

function getCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost'
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

async function createEvent({ title, start, end, description, allDay = false }) {
  const calendar = getCalendarClient();
  const event = {
    summary: title,
    description,
    start: allDay ? { date: start } : { dateTime: start, timeZone: 'America/New_York' },
    end: allDay ? { date: end } : { dateTime: end, timeZone: 'America/New_York' },
  };
  const res = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
  return res.data;
}

async function updateEvent({ eventId, title, start, end, description }) {
  const calendar = getCalendarClient();
  const existing = await calendar.events.get({ calendarId: 'primary', eventId });
  const updated = {
    ...existing.data,
    summary: title || existing.data.summary,
    description: description || existing.data.description,
    start: start ? { dateTime: start, timeZone: 'America/New_York' } : existing.data.start,
    end: end ? { dateTime: end, timeZone: 'America/New_York' } : existing.data.end,
  };
  const res = await calendar.events.update({ calendarId: 'primary', eventId, requestBody: updated });
  return res.data;
}

async function deleteEvent({ eventId }) {
  const calendar = getCalendarClient();
  await calendar.events.delete({ calendarId: 'primary', eventId });
  return { deleted: true };
}

module.exports = { getCalendarClient, createEvent, updateEvent, deleteEvent };
