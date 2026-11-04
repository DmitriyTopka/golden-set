// CSV for Rovo Agent Evaluations: one prompt column and an optional expected-response column.
// Limit confirmed on a demo site 04.11: "can't exceed 100 prompts. The first row will be used as a header."

import { containsPII } from './pii.js';

export const CHUNK_SIZE = 100;
export const HEADER = ['prompt', 'expected_response'];

export function escapeCell(value) {
  let s = String(value ?? '');
  // Spreadsheet formula injection: a cell starting with = + - @ would run when the CSV is opened in Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {{question:string, expected:string}[]} pairs
 * @param {{ header?: boolean, withExpected?: boolean }} [opts]
 */
export function toCsv(pairs, opts = {}) {
  const header = opts.header ?? true;
  const withExpected = opts.withExpected ?? true;
  const cols = withExpected ? HEADER : HEADER.slice(0, 1);
  const rows = pairs.map((p) => (withExpected ? [p.question, p.expected] : [p.question]));
  const lines = (header ? [cols, ...rows] : rows).map((r) => r.map(escapeCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

export function chunk(items, size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function toCsvChunks(pairs, opts = {}) {
  return chunk(pairs, opts.size ?? CHUNK_SIZE).map((part) => toCsv(part, opts));
}

/** RFC 4180 parser, enough to read our own files and Evaluations result exports. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
        const next = s[i + 1];
        if (next !== undefined && next !== ',' && next !== '\n' && next !== '\r') throw new Error(`Unexpected character after closing quote at ${i + 1}`);
      }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('Unterminated quoted cell');
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * @returns {{ ok: boolean, errors: string[], rows: number }}
 */
export function validateCsv(text, opts = {}) {
  const max = opts.maxRows ?? CHUNK_SIZE;
  const errors = [];
  let rows;
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { ok: false, errors: [e.message], rows: 0 };
  }
  // A trailing blank line is common in hand-edited files and is not an empty prompt.
  rows = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  const header = rows[0] || [];
  const hasHeader = header[0] === HEADER[0];
  const data = hasHeader ? rows.slice(1) : rows;
  if (data.length === 0) errors.push('no prompts');
  if (data.length > max) errors.push(`too many prompts: ${data.length} > ${max}`);
  data.forEach((r, i) => {
    const line = i + (hasHeader ? 2 : 1);
    if (r.length < 1 || r.length > 2) errors.push(`line ${line}: expected 1-2 columns, got ${r.length}`);
    if (!r[0] || !r[0].trim()) errors.push(`line ${line}: empty prompt`);
    if (r.some((c) => containsPII(c))) errors.push(`line ${line}: looks like personal data`);
  });
  return { ok: errors.length === 0, errors, rows: data.length };
}
