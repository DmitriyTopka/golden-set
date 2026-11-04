// End-to-end checks of the selection on the Northwind fixture.
// The fixture labels every request, so we know exactly what should come out.

import { readFileSync } from 'node:fs';
import { selectGoldenSet, balancedTop, dedupe, pairsByPage, reselect } from '../core/select.js';
import { indexArticles, linkPair } from '../core/link.js';
import { buildCandidate } from '../core/pairs.js';
import { toCsv } from '../core/csv.js';
import { containsPII } from '../core/pii.js';

const seed = JSON.parse(readFileSync(new URL('../seed/northwind.json', import.meta.url), 'utf8'));
const label = new Map(seed.requests.map((r) => [r.key, r._label]));
const result = selectGoldenSet(seed.requests, seed.articles);

describe('selectGoldenSet on Northwind', () => {
  test('selects exactly the 50 golden requests', () => {
    expect(result.selected).toHaveLength(50);
    expect(result.selected.every((p) => label.get(p.id) === 'golden')).toBe(true);
  });

  test('none of the reopened, complaint or low-CSAT requests get in', () => {
    const bad = ['reopened', 'complaint', 'low_csat'];
    const rejectedIds = new Set(result.rejected.map((r) => r.id));
    for (const r of seed.requests.filter((x) => bad.includes(x._label))) expect(rejectedIds.has(r.key)).toBe(true);
    expect(result.rejected).toHaveLength(15);
  });

  test('all 5 duplicates are folded into their originals', () => {
    expect(result.duplicates).toHaveLength(5);
    for (const d of result.duplicates) {
      expect(label.get(d.id)).toBe('duplicate');
      expect(label.get(d.duplicateOf)).toBe('golden');
    }
  });

  test('every golden pair is linked by its link to the right article', () => {
    const expected = new Map(seed.requests.map((r) => [r.key, r._expectedPageId]));
    for (const p of result.selected) {
      expect(p.link.method).toBe('link');
      expect(p.link.pageId).toBe(expected.get(p.id));
    }
  });

  test('6 of 10 link-less answers are attached by fact, 4 stay unlinked', () => {
    const noLink = result.reserve.filter((p) => label.get(p.id)?.startsWith('nolink'));
    const byFact = noLink.filter((p) => p.link?.method === 'fact');
    expect(byFact).toHaveLength(6);
    for (const p of byFact) expect(p.link.pageId).toBe(seed.requests.find((r) => r.key === p.id)._expectedPageId);
    expect(noLink.filter((p) => !p.link)).toHaveLength(4);
  });

  test('Returns policy carries 12 golden pairs', () => {
    expect(pairsByPage(result.selected).get('100001')).toHaveLength(12);
  });

  test('exported CSV contains no personal data', () => {
    const csv = toCsv(result.selected);
    expect(containsPII(csv)).toBe(false);
    for (const c of seed.customers) {
      expect(csv).not.toContain(c.name.split(' ')[0]);
      expect(csv).not.toContain(c.phone);
    }
    expect(csv).not.toMatch(/NW-\d{5}/);
  });

  test('admin "not golden" marks are respected', () => {
    const first = result.selected[0].id;
    const again = selectGoldenSet(seed.requests, seed.articles, { excluded: new Set([first]) });
    expect(again.selected.map((p) => p.id)).not.toContain(first);
    expect(again.rejected).toContainEqual({ id: first, reason: 'marked_not_golden' });
  });

  test('limit is honoured', () => {
    expect(selectGoldenSet(seed.requests, seed.articles, { limit: 10 }).selected).toHaveLength(10);
  });
});

describe('reselect after "not golden"', () => {
  test('the best reserve pair takes the freed slot, and restoring brings the pair back', () => {
    const pool = [...result.selected, ...result.reserve];
    const victim = result.selected[0].id;
    const once = reselect(pool, new Set([victim]));
    expect(once.selected).toHaveLength(50);
    expect(once.selected.map((p) => p.id)).not.toContain(victim);
    expect(once.excluded.map((p) => p.id)).toEqual([victim]);
    const promoted = once.selected.find((p) => !result.selected.some((q) => q.id === p.id));
    expect(label.get(promoted.id)).toBe('nolink_fact');
    const back = reselect(pool, new Set());
    expect(back.selected.map((p) => p.id).sort()).toEqual(result.selected.map((p) => p.id).sort());
  });

  test('unlinked pairs never enter the set', () => {
    const pool = [...result.selected, ...result.reserve];
    const all = new Set(result.selected.map((p) => p.id));
    expect(reselect(pool, all).selected.every((p) => p.link)).toBe(true);
  });
});

describe('selection building blocks', () => {
  const mk = (id, score, pageId) => ({ id, score, question: `q ${id}`, link: { pageId } });

  test('balancedTop caps one page and fills leftovers by score', () => {
    // 3 pages, limit 6: cap is 4 per page, so the weak B and C pairs still get in.
    const pairs = [...Array.from({ length: 10 }, (_, i) => mk(`a${i}`, 10, 'A')), mk('b0', 1, 'B'), mk('c0', 1, 'C')];
    const top = balancedTop(pairs, 6);
    expect(top.map((p) => p.id)).toEqual(['a0', 'a1', 'a2', 'a3', 'b0', 'c0']);
    // Leftover slots go back to the strongest pairs once every page had its turn.
    expect(balancedTop(pairs, 12).filter((p) => p.link.pageId === 'A')).toHaveLength(10);
  });

  test('dedupe keeps the higher score', () => {
    const { kept, duplicates } = dedupe([
      { id: 'x', score: 1, question: 'How long does standard delivery take', summary: 'How long does standard delivery take' },
      { id: 'y', score: 5, question: 'how long does standard delivery take?', summary: 'how long does standard delivery take?' },
    ]);
    expect(kept.map((p) => p.id)).toEqual(['y']);
    expect(duplicates).toEqual([{ id: 'x', duplicateOf: 'y' }]);
  });

  test('linkPair refuses to guess when two articles share the fact', () => {
    const index = indexArticles([
      { pageId: '1', title: 'A', body: 'Shipping takes 3 business days.' },
      { pageId: '2', title: 'B', body: 'Refunds take 3 business days.' },
    ]);
    expect(linkPair({ refs: { pageIds: [], titles: [] }, answerOriginal: 'Done within 3 business days.', question: 'when?' }, index)).toBeNull();
  });

  test('linkPair by storage-format title', () => {
    const index = indexArticles([{ pageId: '9', title: 'Warranty', body: 'x' }]);
    expect(linkPair({ refs: { pageIds: [], titles: ['warranty'] }, answerOriginal: '', question: '' }, index)).toMatchObject({ pageId: '9', method: 'link' });
  });

  test('buildCandidate works on every fixture request without throwing', () => {
    for (const r of seed.requests) expect(() => buildCandidate(r)).not.toThrow();
  });
});
