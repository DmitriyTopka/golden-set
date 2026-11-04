// Runs the whole selection: candidates -> link -> score -> dedupe -> balanced top N.

import { buildCandidate, baseScore, LINK_BONUS } from './pairs.js';
import { indexArticles, linkPair } from './link.js';
import { contentTokens, jaccard } from './text.js';

export const DEFAULT_LIMIT = 50;
const DUPLICATE_THRESHOLD = 0.8;

/** Keeps the best-scored pair from each group of near-identical questions. */
export function dedupe(pairs) {
  const sorted = [...pairs].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const kept = [];
  const duplicates = [];
  for (const p of sorted) {
    // Customers repeat the same question in the summary and add different details below,
    // so the summary alone is also enough to call two requests duplicates.
    const tokens = contentTokens(p.question);
    const summaryTokens = contentTokens(p.summary || '');
    const twin = kept.find(
      (k) =>
        jaccard(k._tokens, tokens) >= DUPLICATE_THRESHOLD ||
        (summaryTokens.length >= 2 && jaccard(k._summary, summaryTokens) >= DUPLICATE_THRESHOLD)
    );
    if (twin) duplicates.push({ id: p.id, duplicateOf: twin.id });
    else kept.push({ ...p, _tokens: tokens, _summary: summaryTokens });
  }
  return { kept: kept.map(({ _tokens, _summary, ...p }) => p), duplicates };
}

/**
 * Highest scores first with a per-article cap, so one popular page cannot eat the whole set.
 * The cap is twice an even share; slots left over after the capped pass are filled by score.
 */
export function balancedTop(pairs, limit = DEFAULT_LIMIT) {
  const sorted = [...pairs].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const pages = new Set(sorted.map((p) => p.link?.pageId || '_unlinked'));
  const cap = Math.max(1, Math.ceil((limit / Math.max(pages.size, 1)) * 2));
  const perPage = new Map();
  const out = [];
  const skipped = [];
  for (const p of sorted) {
    if (out.length >= limit) break;
    const k = p.link?.pageId || '_unlinked';
    const n = perPage.get(k) || 0;
    if (n >= cap) {
      skipped.push(p);
      continue;
    }
    perPage.set(k, n + 1);
    out.push(p);
  }
  for (const p of skipped) {
    if (out.length >= limit) break;
    out.push(p);
  }
  return out;
}

/**
 * @param {object[]} requests closed JSM requests in the internal shape (see pairs.js)
 * @param {{pageId:string,title:string,body:string}[]} articles
 * @param {{ limit?: number, excluded?: Set<string> }} [opts] excluded = pairs an admin marked "not golden"
 */
export function selectGoldenSet(requests, articles, opts = {}) {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const excluded = opts.excluded || new Set();
  const index = indexArticles(articles);
  const rejected = [];
  const candidates = [];

  for (const r of requests) {
    const res = buildCandidate(r);
    if (!res.ok) {
      rejected.push({ id: res.key, reason: res.reason });
      continue;
    }
    if (excluded.has(res.pair.id)) {
      rejected.push({ id: res.pair.id, reason: 'marked_not_golden' });
      continue;
    }
    const link = linkPair(res.pair, index);
    const score = baseScore(res.pair.signals) + (link ? LINK_BONUS[link.method] : 0);
    candidates.push({ ...res.pair, link, score });
  }

  const { kept, duplicates } = dedupe(candidates);
  const linked = kept.filter((p) => p.link);
  const selected = balancedTop(linked, limit);
  const selectedIds = new Set(selected.map((p) => p.id));

  return {
    selected,
    reserve: kept.filter((p) => !selectedIds.has(p.id)),
    rejected,
    duplicates,
    stats: {
      requests: requests.length,
      candidates: candidates.length,
      rejected: rejected.length,
      duplicates: duplicates.length,
      unlinked: kept.length - linked.length,
      selected: selected.length,
      byMethod: {
        link: selected.filter((p) => p.link.method === 'link').length,
        fact: selected.filter((p) => p.link.method === 'fact').length,
      },
    },
  };
}

/** pageId -> pair ids, the index the confluence trigger reads. */
export function pairsByPage(pairs) {
  const m = new Map();
  for (const p of pairs) {
    if (!p.link) continue;
    if (!m.has(p.link.pageId)) m.set(p.link.pageId, []);
    m.get(p.link.pageId).push(p.id);
  }
  return m;
}
