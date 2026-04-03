require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/pool');

async function runSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '001-schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Schema applied successfully.');
  } catch (err) {
    console.error('Schema error:', err.message);
  } finally {
    await pool.end();
  }
}

runSchema();
