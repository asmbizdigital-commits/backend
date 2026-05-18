#!/usr/bin/env node
/**
 * Importe un extrait JSON unifié pour un connaissement (lignes article machine / châssis / moteur).
 *
 * Usage (depuis la racine du projet) :
 *   node backend/scripts/ingest-unified-json.js --bl HLCUSZX2602BOXQ5 --file "DOC-AFR-JOH-2026-000004_unifie-extract (2).json"
 *
 * Variables : backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const { sequelize } = require('../server/config/database');
const { ingestUnifiedExtract } = require('../server/services/connaissementFicheAsmService');

function parseArgs(argv) {
  const out = { bl: null, id: null, file: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--bl' && argv[i + 1]) out.bl = argv[++i];
    else if (argv[i] === '--id' && argv[i + 1]) out.id = parseInt(argv[++i], 10);
    else if (argv[i] === '--file' && argv[i + 1]) out.file = argv[++i];
  }
  return out;
}

async function main() {
  const dbName = process.env.DB_NAME || 'asmdb';
  console.log(`Connexion BDD : ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306} / ${dbName}`);

  const { bl, id, file } = parseArgs(process.argv);
  if (!file) {
    console.error('Option requise : --file <chemin.json>');
    process.exit(1);
  }
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const payload = JSON.parse(fs.readFileSync(abs, 'utf8'));

  let connaissementId = id;
  if (!connaissementId && bl) {
    const [rows] = await sequelize.query(
      `SELECT id FROM connaissements WHERE bl_number = ? LIMIT 1`,
      { replacements: [bl] }
    );
    connaissementId = rows[0]?.id;
  }
  if (!connaissementId) {
    const blFromJson = payload?.bl_details?.bl_number;
    if (blFromJson) {
      const [rows] = await sequelize.query(
        `SELECT id FROM connaissements WHERE bl_number = ? LIMIT 1`,
        { replacements: [String(blFromJson).trim()] }
      );
      connaissementId = rows[0]?.id;
    }
  }
  if (!connaissementId) {
    console.error('Connaissement introuvable (--bl ou --id).');
    process.exit(1);
  }

  const detail = await ingestUnifiedExtract(connaissementId, payload);
  const items = detail?.commercial_invoice?.items || [];
  console.log(`Import OK — connaissement #${connaissementId}, ${items.length} ligne(s) article.`);
  items.forEach((it, i) => {
    console.log(
      `  ${i + 1}: model=${it.model || '—'} machine=${it.machine_no || '—'} chassis=${it.chassis_no || '—'} engine=${it.engine_no || '—'}`
    );
  });
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
