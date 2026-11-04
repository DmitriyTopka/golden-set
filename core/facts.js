// Fact extraction: the one mechanism behind both "which article does this answer rely on"
// and "which answers did this edit make wrong". Deterministic, no LLM.
//
// A fact is something an answer can get wrong after an article edit:
//   duration  "30 days", "14-day", "two weeks", "twenty-one days", "5 business days", "3-5 days"
//   money     "$25", "$1,000", "25 USD", "USD 25", "€10"
//   percent   "15%", "15 percent", "15 per cent"
// Terms (content-word bigrams) cover edits without numbers, e.g. "returns are free".

import { tokenize, STOPWORDS } from './text.js';

const UNITS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const WORD_NUMBERS = {
  a: 1, an: 1, ...UNITS,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const COMPOUND = `(?:${TENS})[\\s-](?:${Object.keys(UNITS).join('|')})`;
// Compound words first, so "twenty-one" is never read as "one".
const NUM = `(${COMPOUND}|\\d+(?:\\.\\d+)?|${Object.keys(WORD_NUMBERS).join('|')})`;
const UNIT = `(?:(business|working|calendar)[\\s-]+)?(hour|day|week|month|year)s?\\b`;
const DASH = '(?:-|\\u2013|\\u2014|to)';

const RANGE = new RegExp(`(?<![\\w-])(\\d+)\\s?${DASH}\\s?(\\d+)[\\s-]+${UNIT}`, 'gi');
const DURATION = new RegExp(`(?<![\\w-])${NUM}[\\s-]+${UNIT}`, 'gi');

const AMOUNT = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
const MONEY_PREFIX = new RegExp(`([$€£])\\s?${AMOUNT}`, 'g');
const MONEY_CODE_FIRST = new RegExp(`\\b(usd|eur|gbp)\\s?${AMOUNT}`, 'gi');
const MONEY_SUFFIX = new RegExp(`\\b${AMOUNT}\\s?(usd|eur|gbp|dollars?|euros?|pounds?)\\b`, 'gi');
const PERCENT = /\b(\d+(?:\.\d+)?)\s?(%|per\s?cent\b)/gi;

const CURRENCY = { $: 'usd', '€': 'eur', '£': 'gbp', usd: 'usd', eur: 'eur', gbp: 'gbp', dollar: 'usd', dollars: 'usd', euro: 'eur', euros: 'eur', pound: 'gbp', pounds: 'gbp' };

function toNumber(raw) {
  const lower = raw.toLowerCase().trim();
  const compound = lower.match(new RegExp(`^(${TENS})[\\s-](\\w+)$`));
  if (compound) return WORD_NUMBERS[compound[1]] + UNITS[compound[2]];
  if (lower in WORD_NUMBERS) return WORD_NUMBERS[lower];
  // "1,000" and "1,250.00" use commas for thousands; "12,50" is a decimal comma.
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(lower)) return Number(lower.replace(/,/g, ''));
  return Number(lower.replace(',', '.'));
}

function unitKey(qualifier, unit) {
  const q = qualifier ? `${qualifier.toLowerCase().replace('working', 'business')} ` : '';
  return { q, u: unit.toLowerCase() };
}

function durationKey(n, qualifier, unit) {
  const { q, u } = unitKey(qualifier, unit);
  // Weeks compare as days so "two weeks" and "14 days" are the same fact.
  if (u === 'week' && !q) return `duration:${n * 7} day`;
  return `duration:${n} ${q}${u}`;
}

function rangeKey(a, b, qualifier, unit) {
  const { q, u } = unitKey(qualifier, unit);
  if (u === 'week' && !q) return `duration:${a * 7}-${b * 7} day`;
  return `duration:${a}-${b} ${q}${u}`;
}

const blank = (s) => ' '.repeat(s.length);

/**
 * @param {string} text
 * @returns {{kind:'duration'|'money'|'percent', key:string, raw:string}[]}
 */
export function extractFacts(text) {
  let t = String(text || '');
  const found = new Map();
  const add = (kind, key, raw) => {
    if (!found.has(key)) found.set(key, { kind, key, raw: raw.trim() });
  };

  // Ranges first, then blank them out so "3-5 days" does not also yield "5 days".
  for (const m of t.matchAll(RANGE)) add('duration', rangeKey(Number(m[1]), Number(m[2]), m[3], m[4]), m[0]);
  t = t.replace(RANGE, blank);

  for (const m of t.matchAll(DURATION)) {
    if (/^an?$/i.test(m[1])) {
      // "a day"/"an hour" and "once a month" describe frequency, not a promise.
      if (/^(hour|day)$/i.test(m[3])) continue;
      if (/\b(once|twice|per|every)\s+$/i.test(t.slice(Math.max(0, m.index - 8), m.index))) continue;
    }
    add('duration', durationKey(toNumber(m[1]), m[2], m[3]), m[0]);
  }

  for (const m of t.matchAll(MONEY_PREFIX)) add('money', `money:${toNumber(m[2])} ${CURRENCY[m[1]]}`, m[0]);
  for (const m of t.matchAll(MONEY_CODE_FIRST)) add('money', `money:${toNumber(m[2])} ${CURRENCY[m[1].toLowerCase()]}`, m[0]);
  for (const m of t.matchAll(MONEY_SUFFIX)) add('money', `money:${toNumber(m[1])} ${CURRENCY[m[2].toLowerCase()]}`, m[0]);
  for (const m of t.matchAll(PERCENT)) add('percent', `percent:${toNumber(m[1])}`, m[0]);

  return [...found.values()];
}

export function factKeys(text) {
  return new Set(extractFacts(text).map((f) => f.key));
}

/**
 * Content-word bigrams such as "returns free", "prepaid label".
 * Bigrams are built on the real token sequence and only then filtered, so dropping
 * "5" from "take 5 days" never invents a fake "take days" bigram.
 */
export function extractTerms(text) {
  // Keep one-digit numbers as tokens here (contentTokens drops length-1 tokens) so they still break bigrams.
  const tokens = tokenize(text).filter((t) => !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t)));
  const terms = new Set();
  const isWord = (t) => !/\d/.test(t) && !/^[$€£%]/.test(t);
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (isWord(tokens[i]) && isWord(tokens[i + 1])) terms.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return terms;
}
