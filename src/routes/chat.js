const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db/pool');
const buildContext = require('../lib/buildContext');

let anthropic;
function getClient() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
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

  return `You are Jon's Command Center AI. You manage his schedule, goals, projects, and life logistics.

CURRENT STATE:
- Time: ${context.now}
- Current task: ${context.current_task ? context.current_task.title : 'none'}
- Next 3 upcoming: ${context.upcoming_tasks.map(t => t.title).join(', ') || 'none'}

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
- When Jon mentions a new life maintenance item, tell him you've noted it (the app will save it)
- When Jon describes a project, break it into ordered steps with time estimates
- When Jon completes a task, acknowledge it and suggest what's next
- Keep responses concise and direct — no fluff
- Adjust suggestions based on energy patterns and reflection history
- For simple confirmations, respond in 1-2 sentences max
- Jon has ${context.active_projects.length} active projects — always be aware of all of them`;
}

// POST /api/chat
router.post('/', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    // Save user message
    await pool.query(
      'INSERT INTO chat_messages (role, content) VALUES ($1, $2)',
      ['user', message]
    );

    // Get last 5 messages for conversation history
    const history = await pool.query(
      'SELECT role, content FROM chat_messages ORDER BY created_at DESC LIMIT 10'
    );
    const messages = history.rows.reverse();

    // Build context
    const context = await buildContext();
    const systemPrompt = buildSystemPrompt(context);

    // Route to Haiku for short/simple messages, Sonnet for complex
    const isComplex = message.length > 120 || /plan|replan|review|insight|goal|project|week|priorit/i.test(message);
    const model = isComplex ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';

    // Call Claude
    const response = await getClient().messages.create({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const reply = response.content[0].text;

    // Save assistant reply
    await pool.query(
      'INSERT INTO chat_messages (role, content) VALUES ($1, $2)',
      ['assistant', reply]
    );

    // Log context snapshot
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
        response.usage.input_tokens + response.usage.output_tokens,
      ]
    );

    res.json({
      reply,
      model,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
    });
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
