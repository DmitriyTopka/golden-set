// Text helpers shared by every core module. Pure functions, no Forge imports,
// so the whole core can be tested locally with plain Node.

const STOPWORDS = new Set(
  `a an the and or but if then else of to in on at by for with from as is are was were be been being
   it its this that these those i you he she we they me my your our their his her them us
   do does did done can could would should will shall may might must have has had having
   not no yes so very just also too than there here what which who whom when where why how
   all any each some such only own same other into over under again further once about
   please thanks thank hi hello dear regards best kind cheers`
    .split(/\s+/)
    .filter(Boolean)
);

// Confluence storage format and JSM comments arrive as HTML-ish text.
export function stripMarkup(input) {
  if (!input) return '';
  return String(input)
    .replace(/<(br|\/p|\/li|\/h\d|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

export function normalizeSpace(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

export function tokenize(input) {
  return normalizeSpace(String(input || '').toLowerCase())
    .replace(/[^\p{L}\p{N}$%€£.\- ]/gu, ' ')
    .split(' ')
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter((t) => t.length > 0);
}

export function contentTokens(input) {
  return tokenize(input).filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

// Sentence split that survives "e.g." style abbreviations well enough for help articles.
export function splitSentences(input) {
  const text = stripMarkup(input);
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => normalizeSpace(s))
    .filter((s) => s.length > 0);
}

export function sentenceKey(sentence) {
  return tokenize(sentence).join(' ');
}

export function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  // Two empty token sets say nothing about similarity (e.g. text in a script we cannot tokenize).
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export { STOPWORDS };
