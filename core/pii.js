// Removes customer personal data before anything is stored in KVS or exported to CSV.
// Order matters: emails first (they contain digits), then IBANs, cards, order numbers, phones, names.
// When in doubt we redact: a lost serial number costs less than a leaked phone.

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g;
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
// "order 482913", "order #NW-48291", "Order no. 1029384"
const ORDER = /\b(order|invoice|ticket|tracking)(\s+(?:no\.?|number|id))?\s*[:#]?\s*([A-Z]{1,4}-?)?\d{4,}\b/gi;
const BARE_ORDER = /#\s?[A-Z]{0,4}-?\d{4,}\b/g;
// Any run of digits and phone separators; kept only if it has 9-15 digits (see redactPhone).
const PHONE = /(?:\+|\(|\b)\d[\d\s().-]{7,}\d\b/g;
const ISO_DATE = /\d{4}-\d{2}-\d{2}/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function redactCard(m) {
  if (ISO_DATE.test(m)) return m;
  const digits = m.replace(/\D/g, '');
  return digits.length >= 13 && luhnValid(digits) ? '[card]' : m;
}

function redactPhone(m) {
  const trimmed = m.trim();
  if (ISO_DATE.test(trimmed) || IPV4.test(trimmed)) return m;
  const digits = trimmed.replace(/\D/g, '').length;
  if (digits < 9 || digits > 15) return m;
  // A bare run of digits with no "+" and no separators is more likely a serial or account id.
  return /^\d+$/.test(trimmed) ? '[id]' : '[phone]';
}

/**
 * @param {string} text
 * @param {{ names?: string[] }} [opts] display names known from the request (reporter, agent)
 * @returns {string}
 */
export function redactPII(text, opts = {}) {
  if (!text) return '';
  let out = String(text)
    .replace(EMAIL, '[email]')
    .replace(IBAN, '[iban]')
    .replace(CARD, redactCard)
    .replace(ORDER, (m, word) => `${word} [order]`)
    .replace(BARE_ORDER, '[order]')
    .replace(PHONE, redactPhone);

  const parts = new Set();
  for (const name of opts.names || []) {
    if (!name) continue;
    const trimmed = name.trim();
    if (trimmed.length < 2) continue;
    parts.add(trimmed);
    for (const piece of trimmed.split(/\s+/)) if (piece.length >= 3) parts.add(piece);
  }
  // Longest first so "Alex Morgan" wins over "Alex". Case-insensitive and Unicode-aware,
  // so "ALEX", "alex" and Cyrillic names are caught too.
  for (const part of [...parts].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(part)}(?![\\p{L}\\p{N}])`, 'giu'), '[name]');
  }
  return out.replace(/\[name\](\s+\[name\])+/g, '[name]');
}

/** Used by the CSV validator as a last line of defence before export. */
export function containsPII(text) {
  const t = String(text || '');
  if (new RegExp(EMAIL.source, 'u').test(t)) return true;
  if (new RegExp(IBAN.source).test(t)) return true;
  for (const m of t.matchAll(CARD)) if (redactCard(m[0]) === '[card]') return true;
  for (const m of t.matchAll(PHONE)) if (redactPhone(m[0]) === '[phone]') return true;
  return false;
}
