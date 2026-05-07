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

// Tools Claude can call to manage projects
const projectTools = [
  {
    name: 'create_project',
    description: "Create a new project in Jon's system. Use this when Jon describes a new project or goal. Break it into steps using add_project_steps right after.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short project title' },
        description: { type: 'string', description: 'What this project is and why it matters' },
        category: { type: 'string', enum: ['tech', 'finance', 'personal', 'career', 'health', 'admin'], description: 'Project category' },
        priority: { type: 'integer', description: '1 (low) to 5 (high)', minimum: 1, maximum: 5 },
        deadline: { type: 'string', description: 'Target date in YYYY-MM-DD format, if any' },
        estimated_total_hours: { type: 'integer', description: 'Rough total hours estimate' },
      },
      required: ['title', 'category', 'priority'],
    },
  },
  {
    name: 'add_project_steps',
    description: "Add ordered steps to a project. Call this after create_project, or when Jon wants to break down an existing project. Always add all steps at once in order.",
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer', description: 'The project ID to add steps to' },
        steps: {
          type: 'array',
          description: 'Ordered list of steps',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Step title — short and actionable' },
              estimated_minutes: { type: 'integer', description: 'How long this step takes in minutes' },
              energy_required: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Energy level needed' },
            },
            required: ['title'],
          },
        },
      },
      required: ['project_id', 'steps'],
    },
  },
  {
    name: 'complete_project_step',
    description: "Mark a project step as completed and advance the project progress.",
    input_schema: {
      type: 'object',
      properties: {
        step_id: { type: 'integer', description: 'The step ID to mark complete' },
        project_id: { type: 'integer', description: 'The project ID this step belongs to' },
      },
      required: ['step_id', 'project_id'],
    },
  },
  {
    name: 'update_project',
    description: "Update a project's details — status, priority, deadline, notes, etc.",
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer', description: 'The project ID to update' },
        fields: {
          type: 'object',
          description: 'Fields to update — any combination of: title, description, status, priority, deadline, notes',
        },
      },
      required: ['project_id', 'fields'],
    },
  },
];

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

const webSearchTool = { type: 'web_search_20250305', name: 'web_search' };

function shouldUseWebSearch(message) {
  return /\b(weather|news|price|prices|latest|current|today|tomorrow|search|look up|web|internet)\b/i.test(message);
}

function toolsForMessage(message) {
  const tools = [...projectTools, ...calendarTools];
  if (shouldUseWebSearch(message)) tools.push(webSearchTool);
  return tools;
}

async function runTool(name, input) {
  if (name === 'create_project') {
    const { title, description, category, priority, deadline, estimated_total_hours } = input;
    const result = await pool.query(
      `INSERT INTO projects (title, description, category, priority, deadline, estimated_total_hours, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING *`,
      [title, description || null, category, priority || 3, deadline || null, estimated_total_hours || null]
    );
    return { success: true, project: result.rows[0] };
  }
  if (name === 'add_project_steps') {
    const { project_id, steps } = input;
    const inserted = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const r = await pool.query(
        `INSERT INTO project_steps (project_id, title, step_order, estimated_minutes, energy_required, status)
         VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
        [project_id, s.title, i + 1, s.estimated_minutes || null, s.energy_required || 'medium']
      );
      inserted.push(r.rows[0]);
    }
    return { success: true, steps_added: inserted.length };
  }
  if (name === 'complete_project_step') {
    const { step_id, project_id } = input;
    await pool.query(
      `UPDATE project_steps SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [step_id]
    );
    // Recalculate project progress
    await pool.query(`
      UPDATE projects SET
        progress_pct = (
          SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0))
          FROM project_steps WHERE project_id = projects.id
        ),
        updated_at = NOW()
      WHERE id = $1
    `, [project_id]);
    return { success: true };
  }
  if (name === 'update_project') {
    const { project_id, fields } = input;
    const keys = Object.keys(fields);
    if (!keys.length) return { error: 'No fields provided' };
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = keys.map(k => fields[k]);
    await pool.query(
      `UPDATE projects SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1}`,
      [...values, project_id]
    );
    return { success: true };
  }
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

  const calendarEvents = (context.calendar_events || [])
    .map(e => {
      const start = new Date(e.start_time).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const end = e.end_time ? new Date(e.end_time).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : '';
      return `- ${e.title} | ${start}${end ? ' - ' + end : ''} (${e.calendar_name})`;
    })
    .join('\n');

  return `CRITICAL FORMATTING RULE: Never use asterisks, markdown, bullet dashes, hashtags, underscores, backticks, or any symbols in your responses. Plain conversational sentences only. This is enforced because your responses are read aloud by a text-to-speech engine.

You are Jon's Command Center AI. Your job is not just to know his schedule — it's to understand what's actually happening right now and guide him to the best use of his time.

CURRENT STATE:
- Time: ${context.now}
- Current task (from task engine): ${context.current_task ? context.current_task.title : 'none'}

GOOGLE CALENDAR (next 7 days):
${calendarEvents || 'no events found'}

JON'S PROFILE:
- Works overnight shifts (Sunrise Cottage overnights Thu/Fri/Sat 10pm–8am, Prestige Sun 8pm–Mon 8am, Home Helpers Mon/Thu 12–3pm, Fri 3–4pm)
- Energy: post-overnight shift = low, mornings on off-days = high, afternoons = moderate
- Diet: high protein, simple meals — timing reminders, not calorie counts
- Fitness: building a 3x/week habit
- Piano: Sundays 10am–1pm

ACTIVE PROJECTS (${context.active_projects.length} total):
${projectsSummary || 'none'}

ACTIVE GOALS:
${goalsSummary || 'none'}

OVERDUE / UPCOMING MAINTENANCE:
${maintenanceSummary || 'none'}

RECENT REFLECTIONS (last 3):
${reflectionsSummary || 'none'}

CORE BEHAVIOR:

Projects are the source of truth for what Jon should be doing. Each project has ordered steps. Your job is to know which step is next for each project, factor in Jon's current situation, and tell him exactly what to work on right now.

The calendar shows his schedule but events are not always wall-to-wall busy. Shifts especially have downtime — overnight shifts at Sunrise Cottage and Prestige are often quiet for hours. That time is prime for project work.

When Jon asks what to do, first understand his actual situation with one probing question if needed:
- On a shift: is he in active care or does he have downtime?
- Just woke up: off a shift or regular morning?
- Free block: what is his energy like?

Then pick the single best next action from his projects based on his current state and energy. Factor in deadlines, what has been sitting too long, and what will move the needle most. Say it directly. One thing.

When Jon describes a new project or task verbally, break it into concrete ordered steps, store them, and confirm.

RESPONSE STYLE:
- Short and direct. One question or one suggestion at a time.
- Never dump a list. Pick the best one thing and say it.
- Conversational, like a sharp advisor who knows his whole life
- Confirm calendar changes immediately when made

TOOLS AVAILABLE:
- create_project: when Jon describes a new project, create it immediately then add steps
- add_project_steps: break a project into ordered, actionable steps right after creating it
- complete_project_step: mark a step done when Jon says he finished something
- update_project: change status, priority, deadline, notes on any project
- create_calendar_event / update / delete: full Google Calendar control
- web_search: use for live data — weather, prices, news, anything current

When Jon describes a new project: create it, then immediately break it into steps in the same response. Do not ask for confirmation first — just do it and tell him what you did.`;
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

    await syncCalendar(); // always pull latest before building context
    const context = await buildContext();
    const systemPrompt = buildSystemPrompt(context);

    const model = 'claude-sonnet-4-6';
    const tools = toolsForMessage(message);

    // Agentic loop — Claude can call tools, we run them, then continue
    let response = await getClient().messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools,
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
        max_tokens: 1024,
        system: systemPrompt,
        tools,
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
