require('dotenv').config({ override: true });
const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Command Center API running on port ${PORT}`);
});
