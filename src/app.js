const express = require('express');
const cors = require('cors');

const healthRouter = require('./routes/health');
const tasksRouter = require('./routes/tasks');
const projectsRouter = require('./routes/projects');
const projectStepsRouter = require('./routes/projectSteps');
const goalsRouter = require('./routes/goals');
const routinesRouter = require('./routes/routines');
const maintenanceRouter = require('./routes/maintenance');
const reflectionsRouter = require('./routes/reflections');
const profileRouter = require('./routes/profile');
const chatRouter = require('./routes/chat');
const calendarRouter = require('./routes/calendar');
const nowRouter = require('./routes/now');
const ttsRouter = require('./routes/tts');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/project-steps', projectStepsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/routines', routinesRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/reflections', reflectionsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/chat', chatRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/now', nowRouter);
app.use('/api/tts', ttsRouter);

module.exports = app;
