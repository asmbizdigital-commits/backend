#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '../..');
module.paths.unshift(path.join(ROOT, 'backend/node_modules'));
require('dotenv').config({ path: path.join(ROOT, 'backend/.env') });
const { sequelize } = require(path.join(ROOT, 'backend/server/config/database'));

(async () => {
  const sqlPath = path.join(ROOT, 'backend/database/create_tbl_teams_integration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));
  try {
    for (const stmt of statements) {
      await sequelize.query(stmt);
      console.log('OK:', stmt.slice(0, 60).replace(/\s+/g, ' '), '…');
    }
    console.log('Migration Teams terminée.');
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
