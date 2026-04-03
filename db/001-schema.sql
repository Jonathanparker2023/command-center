-- Command Center Database Schema
-- Phase 1, Step 1: Foundation tables
-- PostgreSQL

-- ============================================
-- 1. USER PROFILE
-- The AI's evolving understanding of you
-- ============================================
CREATE TABLE user_profile (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
    wake_time_default TIME DEFAULT '09:00',
    sleep_time_default TIME DEFAULT '21:30',
    energy_patterns JSONB DEFAULT '{}',
    meal_preferences JSONB DEFAULT '{}',
    fitness_goals JSONB DEFAULT '{}',
    financial_goals JSONB DEFAULT '{}',
    productivity_patterns JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. CALENDAR SYNC
-- Mirror of Apple Calendar events
-- ============================================
CREATE TABLE calendar_sync (
    id SERIAL PRIMARY KEY,
    calendar_id VARCHAR(255) NOT NULL,
    calendar_name VARCHAR(100) NOT NULL,
    event_id VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule JSONB DEFAULT '{}',
    is_all_day BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'confirmed',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_sync_start ON calendar_sync(start_time);
CREATE INDEX idx_calendar_sync_calendar ON calendar_sync(calendar_name);

-- ============================================
-- 3. LIFE MAINTENANCE ITEMS
-- Recurring life stuff the chatbot sets up
-- ============================================
CREATE TABLE life_maintenance (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    interval_type VARCHAR(20) NOT NULL,
    interval_value INTEGER NOT NULL,
    last_completed_at TIMESTAMPTZ,
    last_completed_value INTEGER,
    next_due_at TIMESTAMPTZ,
    next_due_value INTEGER,
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 4. GOALS
-- Big-picture objectives that drive priority
-- ============================================
CREATE TABLE goals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    target_date DATE,
    milestones JSONB DEFAULT '[]',
    current_status TEXT,
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    linked_task_categories TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 5. PROJECTS
-- Ongoing efforts with steps and deadlines.
-- "Build the Command Center app", "Get car fixed",
-- "Cashflow Shiftboard updates", etc.
-- The AI breaks these into steps, assigns deadlines,
-- and feeds daily tasks from them automatically.
-- ============================================
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,        -- "tech" / "finance" / "personal" / "career" / "health" / "admin"
    goal_id INTEGER REFERENCES goals(id), -- optional link to a bigger goal
    status VARCHAR(20) DEFAULT 'active',  -- "active" / "paused" / "completed" / "abandoned"
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    deadline DATE,                        -- hard deadline if one exists
    estimated_total_hours INTEGER,        -- AI estimates this, refines over time
    hours_logged NUMERIC(6,2) DEFAULT 0,  -- tracked from completed steps
    progress_pct INTEGER DEFAULT 0,       -- auto-calculated from steps
    notes TEXT,                           -- anything the chatbot captures
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON projects(status);

-- ============================================
-- 5b. PROJECT STEPS
-- The actual to-dos within a project.
-- AI generates these when you describe a project,
-- and you can add/edit via chatbot anytime.
-- Each step can become a task on your NOW card.
-- ============================================
CREATE TABLE project_steps (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    step_order INTEGER NOT NULL,           -- sequence within the project
    depends_on INTEGER REFERENCES project_steps(id),  -- can't start until this step is done
    status VARCHAR(20) DEFAULT 'pending',  -- "pending" / "active" / "completed" / "skipped" / "blocked"
    deadline DATE,
    estimated_minutes INTEGER,
    energy_required VARCHAR(20) DEFAULT 'medium',
    is_flexible BOOLEAN DEFAULT TRUE,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_steps_project ON project_steps(project_id);
CREATE INDEX idx_steps_status ON project_steps(status);

-- ============================================
-- 6. ROUTINES
-- Recurring blocks the AI schedules around shifts
-- ============================================
CREATE TABLE routines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    preferred_time_window VARCHAR(50),
    days_of_week TEXT[] DEFAULT '{}',
    duration_minutes INTEGER,
    is_flexible BOOLEAN DEFAULT TRUE,
    energy_required VARCHAR(20) DEFAULT 'medium',
    sub_tasks JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 7. TASKS
-- Everything the system can surface as "do this now"
-- ============================================
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL,           -- "calendar" / "maintenance" / "goal" / "routine" / "project" / "ai_suggested"
    source_id INTEGER,
    project_id INTEGER REFERENCES projects(id),        -- which project this advances (if any)
    project_step_id INTEGER REFERENCES project_steps(id),  -- which specific step
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    deadline TIMESTAMPTZ,
    is_flexible BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    estimated_minutes INTEGER,
    energy_required VARCHAR(20) DEFAULT 'medium',
    category VARCHAR(50),
    status VARCHAR(20) DEFAULT 'upcoming',
    context_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_scheduled ON tasks(scheduled_start);
CREATE INDEX idx_tasks_priority ON tasks(priority);

-- ============================================
-- 7. REFLECTIONS
-- Logged every time a task completes or is skipped
-- ============================================
CREATE TABLE reflections (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    outcome VARCHAR(20) NOT NULL,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    energy_level VARCHAR(20),
    note TEXT,
    ai_observation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reflections_task ON reflections(task_id);
CREATE INDEX idx_reflections_date ON reflections(completed_at);

-- ============================================
-- 8. CHAT MESSAGES
-- Full chatbot history
-- ============================================
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    action_taken JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_date ON chat_messages(created_at);

-- ============================================
-- 9. AI CONTEXT LOG
-- Snapshot of what gets injected into each API call
-- ============================================
CREATE TABLE ai_context_log (
    id SERIAL PRIMARY KEY,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_task JSONB,
    upcoming_tasks_24h JSONB,
    recent_reflections_7d JSONB,
    active_goals_summary JSONB,
    user_profile_snapshot JSONB,
    calendar_events_48h JSONB,
    overdue_maintenance JSONB,
    patterns_detected JSONB,
    token_count INTEGER
);

-- ============================================
-- 10. NOTIFICATIONS / CHECK-INS
-- [FUTURE FEATURE] Push notifications that ask
-- simple yes/no questions throughout the day.
-- "Have you worked out today?" → No → logs it.
-- "Did you meal prep for tomorrow?" → Yes → logs it.
-- Responses feed directly into reflections and
-- the AI's understanding of your patterns.
-- ============================================
CREATE TABLE check_ins (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    linked_task_id INTEGER REFERENCES tasks(id),
    linked_routine_id INTEGER REFERENCES routines(id),
    linked_goal_id INTEGER REFERENCES goals(id),
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    response VARCHAR(20),            -- "yes" / "no" / "skipped" / "snoozed"
    response_note TEXT,               -- optional follow-up they type
    responded_at TIMESTAMPTZ,
    notification_method VARCHAR(20) DEFAULT 'push',  -- "push" / "sms" / "email"
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkins_scheduled ON check_ins(scheduled_at);
CREATE INDEX idx_checkins_category ON check_ins(category);

-- ============================================
-- COST OPTIMIZATION NOTES
-- ============================================
-- The Claude API is the only real cost driver.
-- Rules to keep it cheap but powerful:
--
-- 1. CONTEXT WINDOW BUDGET: Cap injected context at ~2,000 tokens per call.
--    Only send: current task, next 3 upcoming, last 3 reflections,
--    active goals summary (1 line each), user profile snapshot.
--
-- 2. SMART CACHING: Store the AI's last context snapshot.
--    If nothing changed since last call, skip rebuilding it.
--
-- 3. USE HAIKU FOR SIMPLE STUFF: Check-in responses ("yes/no" logging),
--    task completion logging, simple schedule queries → use claude-haiku (cheap).
--    Only use Sonnet for complex reasoning: replanning the day, weekly insights,
--    pattern detection, goal reviews.
--
-- 4. BATCH CONTEXT BUILDS: Run a cron job every 15 min that pre-builds
--    the context snapshot. Chatbot reads from cache, not live queries.
--
-- 5. NO FULL CHAT HISTORY IN CONTEXT: Only inject last 5 messages
--    into each API call. Full history stays in the DB for reference
--    but never gets sent to Claude.
--
-- Estimated daily cost at ~20 interactions/day:
--   Haiku calls (simple): ~15 × $0.001 = $0.015
--   Sonnet calls (complex): ~5 × $0.01 = $0.05
--   Total: ~$0.065/day ≈ $2/month
-- ============================================

-- ============================================
-- SEED: Your profile
-- ============================================
INSERT INTO user_profile (name, timezone, wake_time_default, sleep_time_default, energy_patterns, meal_preferences, fitness_goals)
VALUES (
    'Jon',
    'America/New_York',
    '09:00',
    '21:30',
    '{"post_overnight": "low", "afternoons": "moderate", "mornings_no_shift": "high"}',
    '{"style": "high protein, simple meals", "tracking": false, "notes": "knows what to eat, just needs suggestions and timing reminders"}',
    '{"type": "general fitness", "frequency_target": "3x per week", "notes": "building exercise habit"}'
);
