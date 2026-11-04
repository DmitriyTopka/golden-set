// Validates a CSV before it goes to Rovo Agent Evaluations.
// Usage: node tools/check-csv.mjs out.csv [--max 100]

import { readFileSync } from 'node:fs';
import { validateCsv } from '../core/csv.js';

const [file, flag, value] = process.argv.slice(2);
if (!file) {
  console.error('usage: node tools/check-csv.mjs <file.csv> [--max N]');
  process.exit(2);
}
const maxRows = flag === '--max' ? Number(value) : undefined;
const res = validateCsv(readFileSync(file, 'utf8'), { maxRows });
console.log(`${file}: ${res.rows} prompts`);
if (!res.ok) {
  for (const e of res.errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log('OK');
