// Attaches a pair to the help article it relies on.
// 1) exact: the agent linked the page in the reply;
// 2) by fact: the answer states a fact (number, sum, term) that only one article contains.
// Real agents rarely paste links, so (2) is what makes the app useful on a live site.

import { factKeys, extractTerms } from './facts.js';
import { contentTokens, stripMarkup } from './text.js';

/**
 * @param {{ pageId: string, title: string, body: string }[]} articles
 */
export function indexArticles(articles) {
  return articles.map((a) => {
    const text = stripMarkup(a.body);
    return {
      pageId: String(a.pageId),
      title: a.title,
      facts: factKeys(text),
      terms: extractTerms(text),
      titleTokens: new Set(contentTokens(a.title)),
    };
  });
}

/**
 * @param {{ refs: {pageIds:string[], titles:string[]}, answerOriginal: string, question: string }} pair
 * @param {ReturnType<typeof indexArticles>} index
 * @returns {{ pageId: string, method: 'link'|'fact', evidence: string[] } | null}
 */
export function linkPair(pair, index) {
  const byId = new Map(index.map((a) => [a.pageId, a]));
  for (const id of pair.refs?.pageIds || []) {
    if (byId.has(String(id))) return { pageId: String(id), method: 'link', evidence: [`link:${id}`] };
  }
  for (const title of pair.refs?.titles || []) {
    const hit = index.find((a) => a.title.toLowerCase() === title.toLowerCase());
    if (hit) return { pageId: hit.pageId, method: 'link', evidence: [`title:${title}`] };
  }

  const answerFacts = factKeys(pair.answerOriginal);
  const answerTerms = extractTerms(pair.answerOriginal);
  const qTokens = contentTokens(pair.question);

  let best = null;
  for (const a of index) {
    const sharedFacts = [...answerFacts].filter((f) => a.facts.has(f));
    if (sharedFacts.length === 0) continue;
    const sharedTerms = [...answerTerms].filter((t) => a.terms.has(t));
    const titleHits = qTokens.filter((t) => a.titleTokens.has(t)).length;
    const score = sharedFacts.length * 3 + sharedTerms.length + titleHits;
    if (!best || score > best.score) best = { a, score, sharedFacts, sharedTerms, tie: false };
    else if (score === best.score) best.tie = true;
  }
  // Two articles state the same fact equally well: refuse to guess.
  if (!best || best.tie) return null;
  return {
    pageId: best.a.pageId,
    method: 'fact',
    evidence: [...best.sharedFacts, ...best.sharedTerms.slice(0, 3).map((t) => `term:${t}`)],
  };
}
