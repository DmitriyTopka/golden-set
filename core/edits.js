// Expected answers written by an admin. Kept apart from the scanned pairs so a rescan does not lose them.
import { redactPII } from './pii.js';

export const MAX_EXPECTED = 1000;

/**
 * Validates and cleans an expected answer typed by an admin. Personal data is redacted the same way as
 * in scanned answers, because the text goes into CSV files and evaluation datasets.
 * @returns {{ok: true, text: string} | {ok: false, error: string}}
 */
export function cleanExpected(text) {
  if (typeof text !== 'string') return { ok: false, error: 'The expected answer must be text.' };
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: false, error: 'The expected answer cannot be empty.' };
  if (clean.length > MAX_EXPECTED) return { ok: false, error: `Keep the expected answer under ${MAX_EXPECTED} characters.` };
  return { ok: true, text: redactPII(clean) };
}

/**
 * @param {{id:string, expected:string, edited?:{from:string, at:string}}[]} pairs
 * @param {Record<string, {expected:string, at:string}>|null} edits
 */
export function applyEdits(pairs, edits) {
  if (!edits) return pairs;
  return pairs.map((p) => {
    const e = edits[p.id];
    if (!e) return p;
    return { ...p, expected: e.expected, edited: { from: p.edited?.from ?? p.expected, at: e.at } };
  });
}

/** Back to the answer from the resolved request. */
export function undoEdit(pair) {
  if (!pair.edited) return pair;
  const { edited, ...rest } = pair;
  return { ...rest, expected: edited.from };
}
