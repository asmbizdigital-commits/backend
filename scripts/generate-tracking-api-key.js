#!/usr/bin/env node
/**
 * Génère une entrée TRACKING_API_KEYS prête à coller dans .env / Render.
 * Usage:
 *   node backend/scripts/generate-tracking-api-key.js [clientId] [label]
 */
const crypto = require('crypto');

const client = process.argv[2] || 'client-externe';
const label = process.argv[3] || 'Application tierce';
const key = crypto.randomBytes(32).toString('hex');

const entry = [
  {
    client,
    label,
    key,
    allowedIps: []
  }
];

console.log('\n=== Clé API Tracking Dossier ===\n');
console.log(`Client : ${client}`);
console.log(`Label  : ${label}`);
console.log(`Clé    : ${key}\n`);
console.log('Coller dans TRACKING_API_KEYS (JSON sur une ligne) :\n');
console.log(JSON.stringify(entry));
console.log('\nOu variable simple :\n');
console.log(`TRACKING_API_KEY=${key}`);
console.log(`TRACKING_API_KEY_CLIENTS=${client}\n`);
