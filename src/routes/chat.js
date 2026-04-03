const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db/pool');
const buildContext = require('../lib/buildContext');
const { createEvent, updateEvent, deleteEvent } = require('../lib/googleCalendar');
const syncCalendar = require('../lib/syncCalendar');

let anthropic;
function getClient() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
}

// Tools Claude can call to manage the calendar
const calendarTools = [
  {
    name: 'create_calendar_event',
    description: 'Create a new event in Jon\'s Google Calendar. It will appear on his phone immediately.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start time in ISO 8601 format, e.g. 2026-04-05T10:00:00' },
        end: { type: 'string', description: 'End time in ISO 8601 format' },
        description: { type: 'string', description: 'Optional notes or details for the event' },
      },
      required: ['title', 'start', 'end'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete an event from Jon\'s Google Calendar by its event ID.',
    input_schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'The Google Calendar event ID' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'update_calendar_event',
    description: 'Update an existing event in Jon\'s Google Calendar.',
    input_schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'The Google Calendar event ID' },
        title: { type: 'string', description: 'New title (optional)' },
        start: { type: 'string', description: 'New start time ISO 8601 (optional)' },
        end: { type: 'string', description: 'New end time ISO 8601 (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
      },
      required: ['eventId'],
    },
  },
];

async function runTool(name, input) {
  if (name === 'create_calendar_event') {
    const result = await createEvent(input);
    await syncCalendar(); // pull it into DB immediately
    return { success: true, eventId: result.id, htmlLink: result.htmlLink };
  }
  if (name === 'delete_calendar_event') {
    await deleteEvent(input);
    return { success: true };
  }
  if (name === 'update_calendar_event') {
    const result = await updateEvent(input);
    await syncCalendar();
    return { success: true, eventId: result.id };
  }
  return { error: 'Unknown tool' };
}

function buildSystemPrompt(context) {
  const projectsSummary = context.active_projects
    .map(p => `- ${p.title} (${p.progress_pct}% done) — next: ${p.next_step || 'no steps yet'}`)
    .join('\n');

  const goalsSummary = context.active_goals
    .map(g => `- ${g.title} [${g.category}] priority ${g.priority}`)
    .join('\n');

  const reflectionsSummary = context.recent_reflections
    .map(r => `- ${r.task_title}: ${r.outcome}, energy=${r.energy_level}, "${r.note || ''}"`)
    .join('\n');

  const maintenanceSummary = context.overdue_maintenance
    .map(m => `- ${m.name} (due ${m.next_due_at ? new Date(m.next_due_at).toLocaleDateString() : 'soon'})`)
    .join('\n');

  const upcomingEvents = context.upcoming_tasks
    .map(t => `- ${t.title} at ${t.scheduled_start || 'TBD'}`)
    .join('\n');

  return `You are Jon's Command Center AI. You manage his schedule, goals, projects, and life logistics.

CURRENT STATE:
- Time: ${context.now}
- Current task: ${context.current_task ? context.current_task.title : 'none'}
- Upcoming: ${upcomingEvents || 'nothing scheduled'}

JON'S PROFILE:
- Energy patterns: post-overnight shift = low, afternoons = moderate, mornings (no shift) = high
- Diet: high protein, simple meals — needs timing reminders, not calorie counts
- Fitness: building a 3x/week habit

ACTIVE PROJECTS (${context.active_projects.length} total):
${projectsSummary || 'none'}

ACTIVE GOALS:
${goalsSummary || 'none'}

OVERDUE / UPCOMING MAINTENANCE:
${maintenanceSummary || 'none'}

RECENT REFLECTIONS (last 3):
${reflectionsSummary || 'none'}

RULES:
- You have full control over Jon's Google Calendar — use it proactively
- When Jon mentions a shift, appointment, or event, create it in his calendar immediately
- When Jon asks you to reschedule or cancel something, do it
- When Jon describes a project, break it into ordered steps with time estimates
- Keep responses concise and direct — no fluff
- Always confirm when you've added or changed something in the calendar
- Jon has ${context.active_projects.length} active projects — always be aware of all of them
- You have web search — use it whenever Jon asks about current info, news, prices, weather, or anything that benefits from live data`;
}

// POST /api/chat
router.post('/', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    await pool.query('INSERT INTO chat_messages (role, content) VALUES ($1, $2)', ['user', message]);

    const history = await pool.query(
      'SELECT role, content FROM chat_messages ORDER BY created_at DESC LIMIT 10'
    );
    const messages = history.rows.reverse().map(m => ({ role: m.role, content: m.content }));

    const context = await buildContext();
    const systemPrompt = buildSystemPrompt(context);

    const model = 'claude-sonnet-4-6';

    // Agentic loop — Claude can call tools, we run them, then continue
    let response = await getClient().messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools: [
        ...calendarTools,
        { type: 'web_search_20250305', name: 'web_search' },
      ],
      messages,
    });

    let totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    const toolsUsed = [];

    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const block of toolUseBlocks) {
        const result = await runTool(block.name, block.input);
        toolsUsed.push({ tool: block.name, input: block.input, result });
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }

      // Continue the conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await getClient().messages.create({
        model,
        max_tokens: 500,
        system: systemPrompt,
        tools: calendarTools,
        messages,
      });

      totalTokens += response.usage.input_tokens + response.usage.output_tokens;
    }

    const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('') || '';

    await pool.query('INSERT INTO chat_messages (role, content) VALUES ($1, $2)', ['assistant', reply]);

    await pool.query(
      `INSERT INTO ai_context_log (current_task, upcoming_tasks_24h, recent_reflections_7d, active_goals_summary, user_profile_snapshot, overdue_maintenance, token_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        JSON.stringify(context.current_task),
        JSON.stringify(context.upcoming_tasks),
        JSON.stringify(context.recent_reflections),
        JSON.stringify(context.active_goals),
        JSON.stringify(context.user_profile),
        JSON.stringify(context.overdue_maintenance),
        totalTokens,
      ]
    );

    res.json({ reply, model: 'claude-sonnet-4-6', tokens: totalTokens, tools_used: toolsUsed });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/history
router.get('/history', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT role, content, created_at FROM chat_messages ORDER BY created_at ASC LIMIT 100'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
