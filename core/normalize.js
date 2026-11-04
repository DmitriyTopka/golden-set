// Turns an agent reply into an "expected response" for Rovo Evaluations.
// The Evaluations judge is an LLM: greetings, names and sign-offs in the expected
// answer cost points that have nothing to do with the fact we want to check.

import { splitSentences, normalizeSpace } from './text.js';
import { extractFacts } from './facts.js';

// Only the salutation itself, up to the first comma or "!": "Hi there, refunds take..." keeps the fact.
const GREETING = /^(hi|hello|hey|dear|good (morning|afternoon|evening))\b[^,!.\n]{0,30}[,!]\s*/i;
const BARE_GREETING = /^(hi|hello|hey|dear)\b[^,!.\n]{0,30}[.!]?$/i;
const SIGNOFF_LINE =
  /^(best|kind|warm)?\s*(regards|wishes)|^(best|cheers|thanks|thank you|many thanks|sincerely)\s*[,!.]?\s*$|^-+\s*\w+|^the .* (team|support)\s*$/i;
// Filler clauses are cut out, the rest of the sentence stays.
const FILLER = [
  /thanks? (you )?(so much )?for (reaching out|contacting( us)?|getting in touch|your (message|patience|question))/i,
  /hope (this|that) helps/i,
  /let (me|us) know if/i,
  /(feel free|don't hesitate) to/i,
  /happy to help/i,
  /sorry (for|about) the (wait|delay|trouble|inconvenience)/i,
  /have a (great|nice|good) (day|week)/i,
  /i('| a)m closing this (ticket|request)/i,
];
const PLEASANTRY = /^(thanks|thank you|cheers|many thanks)[!.]?$/i;

function stripFiller(sentence) {
  let s = sentence;
  for (const re of FILLER) s = s.replace(new RegExp(`${re.source}[^,.!?]*[,.!?]?\\s*`, 'i'), '');
  return normalizeSpace(s);
}

/**
 * @param {string} reply agent reply, already PII-redacted
 * @param {{ maxSentences?: number }} [opts]
 * @returns {string}
 */
export function normalizeAnswer(reply, opts = {}) {
  const maxSentences = opts.maxSentences ?? 2;
  const lines = String(reply || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Drop sign-off block: everything from the first sign-off line to the end.
  const signoffAt = lines.findIndex((l, i) => i > 0 && SIGNOFF_LINE.test(l));
  const body = (signoffAt === -1 ? lines : lines.slice(0, signoffAt)).join('\n');

  const sentences = splitSentences(body)
    .map((s) => (BARE_GREETING.test(s) ? '' : normalizeSpace(s.replace(GREETING, ''))))
    .map((s) => s.replace(/^\[name\][,!]\s*/, ''))
    .map(stripFiller)
    .filter((s) => s.length > 3 && !PLEASANTRY.test(s) && !/^\[name\][.!]?$/.test(s));

  if (sentences.length === 0) return '';

  // Prefer sentences that carry facts, keep original order.
  const withFacts = sentences.filter((s) => extractFacts(s).length > 0);
  const picked = (withFacts.length > 0 ? withFacts : sentences).slice(0, maxSentences);
  const ordered = sentences.filter((s) => picked.includes(s));
  return ordered
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}
