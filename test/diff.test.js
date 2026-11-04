import { readFileSync } from 'node:fs';
import { diffArticle, computeImpact, suggestFix, suggestAnswer, IMPACT } from '../core/diff.js';
import { selectGoldenSet, pairsByPage } from '../core/select.js';

const RETURNS = [
  'You can return most items within 30 days of delivery.',
  'Returns are free: we email you a prepaid return label.',
  'Opened laptops and tablets have a 15% restocking fee.',
].join('\n');

const edit = (from, to) => RETURNS.replace(from, to);

describe('diffArticle', () => {
  test('number change: old fact is outdated and its replacement is known', () => {
    const d = diffArticle(RETURNS, edit('30 days', '14 days'));
    expect(d.changed).toBe(true);
    expect(d.outdatedFacts).toHaveLength(1);
    expect(d.outdatedFacts[0]).toMatchObject({ key: 'duration:30 day', raw: '30 days', replacedBy: '14 days' });
    expect(d.removedTerms).toEqual([]);
  });

  test('unit change: 30 days -> two weeks', () => {
    const d = diffArticle(RETURNS, edit('30 days', 'two weeks'));
    expect(d.outdatedFacts[0].replacedBy).toBe('two weeks');
  });

  test('money and percent changes', () => {
    expect(diffArticle(RETURNS, edit('15%', '20%')).outdatedFacts[0].key).toBe('percent:15');
    expect(diffArticle('Express costs $12.', 'Express costs $15.').outdatedFacts[0]).toMatchObject({ raw: '$12', replacedBy: '$15' });
  });

  test('a fact that moved to another sentence is not outdated', () => {
    const d = diffArticle(RETURNS, `${RETURNS}\nReminder: 30 days.`.replace('within 30 days of delivery', 'after delivery'));
    expect(d.outdatedFacts).toEqual([]);
  });

  test('a removed fact without replacement', () => {
    const d = diffArticle(RETURNS, RETURNS.replace('Opened laptops and tablets have a 15% restocking fee.', ''));
    expect(d.outdatedFacts[0]).toMatchObject({ key: 'percent:15', replacedBy: null });
  });

  test('no-number edit 1: free returns become paid', () => {
    const d = diffArticle(RETURNS, edit('Returns are free: we email you a prepaid return label.', 'Return shipping is paid by the customer.'));
    expect(d.outdatedFacts).toEqual([]);
    expect(d.removedTerms).toContain('returns free');
    expect(d.factsDetected).toBe(true);
  });

  test('no-number edit 2: a condition is removed', () => {
    const before = 'Opened headphones cannot be returned unless they are faulty.';
    const d = diffArticle(before, 'Opened headphones cannot be returned.');
    expect(d.removedTerms.length).toBeGreaterThan(0);
  });

  test('no-number edit 3: only word order changes, nothing to detect', () => {
    const d = diffArticle('Refunds go to the original payment method.', 'Refunds go to the original payment method!');
    expect(d.changed).toBe(false);
  });

  test('pure wording change with no facts or terms lost', () => {
    const d = diffArticle('We reply fast.', 'We reply fast. We are friendly.');
    expect(d.changed).toBe(true);
    expect(d.factsDetected).toBe(false);
  });

  test('storage format html is handled', () => {
    const d = diffArticle('<p>Standard delivery takes 4 business days.</p>', '<p>Standard delivery takes 5 business days.</p>');
    expect(d.outdatedFacts[0]).toMatchObject({ raw: '4 business days', replacedBy: '5 business days' });
  });
});

describe('computeImpact', () => {
  const pairs = [
    { id: 'p1', answerOriginal: 'You have 30 days from delivery.', expected: 'You have 30 days from delivery.' },
    { id: 'p2', answerOriginal: 'Returns are free, we send a label.', expected: 'Returns are free.' },
    { id: 'p3', answerOriginal: 'A 15% fee applies.', expected: 'A 15% fee applies.' },
  ];

  test('number edit marks only answers with the old fact as outdated', () => {
    const impact = computeImpact(pairs, diffArticle(RETURNS, edit('30 days', '14 days')));
    expect(impact.counts).toEqual({ affected: 3, outdated: 1, recheck: 2 });
    expect(impact.affected.find((a) => a.id === 'p1')).toMatchObject({ status: IMPACT.OUTDATED, reasons: ['30 days -> 14 days'] });
  });

  test('term edit catches answers that repeat the removed wording', () => {
    const impact = computeImpact(pairs, diffArticle(RETURNS, edit('Returns are free: we email you a prepaid return label.', 'Return shipping is paid by the customer.')));
    expect(impact.affected.find((a) => a.id === 'p2').status).toBe(IMPACT.OUTDATED);
    expect(impact.affected.find((a) => a.id === 'p1').status).toBe(IMPACT.RECHECK);
  });

  test('edit without detectable facts asks to re-check everything', () => {
    const impact = computeImpact(pairs, diffArticle('Call us. We reply fast.', 'Email us. We reply fast.'));
    expect(impact.affected.every((a) => a.status === IMPACT.RECHECK_ALL)).toBe(true);
  });

  test('pure additions only ask for a glance, not a full re-check', () => {
    const impact = computeImpact(pairs, diffArticle('We reply fast.', 'We reply fast. We are friendly.'));
    expect(impact.affected.every((a) => a.status === IMPACT.NEW_TEXT)).toBe(true);
    expect(impact.counts.outdated).toBe(0);
  });

  test('rewording a number into words is not a change of fact', () => {
    const d = diffArticle('Refunds take 14 days.', 'Refunds take fourteen days to process.');
    expect(d.outdatedFacts).toEqual([]);
    const impact = computeImpact([{ id: 'r', answerOriginal: 'Refunds take 5 days.', expected: 'Refunds take 5 days.' }], d);
    expect(impact.affected[0].status).not.toBe(IMPACT.OUTDATED);
  });

  test('no change, no impact', () => {
    expect(computeImpact(pairs, diffArticle(RETURNS, RETURNS)).counts.affected).toBe(0);
  });

  test('Northwind demo edit: 12 affected, 8 likely outdated', () => {
    const seed = JSON.parse(readFileSync(new URL('../seed/northwind.json', import.meta.url), 'utf8'));
    const { selected } = selectGoldenSet(seed.requests, seed.articles);
    const ids = new Set(pairsByPage(selected).get('100001'));
    const page = seed.articles.find((a) => a.pageId === '100001');
    const impact = computeImpact(selected.filter((p) => ids.has(p.id)), diffArticle(page.body, seed.demoEdit.body));
    expect(impact.counts).toEqual({ affected: 12, outdated: 8, recheck: 4 });
  });
});

describe('suggestFix', () => {
  const d = diffArticle(RETURNS, edit('30 days', '14 days'));
  test('swaps the number and keeps the wording', () => {
    expect(suggestFix('You have 30 days from delivery.', d.outdatedFacts)).toBe('You have 14 days from delivery.');
    expect(suggestFix('Yes, sale items have the same 30-day return window.', d.outdatedFacts)).toBe('Yes, sale items have the same 14-day return window.');
  });
  test('money and percent', () => {
    const m = diffArticle('Express costs $12.', 'Express costs $15.');
    expect(suggestFix('It costs $12 and arrives tomorrow.', m.outdatedFacts)).toBe('It costs $15 and arrives tomorrow.');
    const p = diffArticle(RETURNS, edit('15%', '20%'));
    expect(suggestFix('A 15% restocking fee applies.', p.outdatedFacts)).toBe('A 20% restocking fee applies.');
  });
  test('no suggestion for word numbers, unrelated text or removed facts', () => {
    expect(suggestFix('You have thirty days.', d.outdatedFacts)).toBeNull();
    expect(suggestFix('Returns are free.', d.outdatedFacts)).toBeNull();
    const removed = diffArticle(RETURNS, RETURNS.replace('Opened laptops and tablets have a 15% restocking fee.', ''));
    expect(suggestFix('A 15% fee applies.', removed.outdatedFacts)).toBeNull();
  });
  test('does not touch other numbers that only look similar', () => {
    expect(suggestFix('Order 1300 items within 30 days of delivery.', d.outdatedFacts)).toBe('Order 1300 items within 14 days of delivery.');
  });
});

// Found in the E4 end-to-end run: swapping only the number flipped the verdict of NS-2.
describe('suggestAnswer', () => {
  const d = diffArticle(RETURNS, edit('30 days', '14 days'));
  const pair = (question, expected) => ({ question, expected });

  test('NS-2: a verdict that depends on how long ago the item arrived goes to a human', () => {
    const r = suggestAnswer(
      pair('Can I still return my smartwatch? It arrived about three weeks ago and I do not like the strap.', 'You have 30 days from delivery to return it, so you are still in time.'),
      d.outdatedFacts,
    );
    expect(r).toEqual({ suggestion: null, needsReview: 'verdict_depends_on_elapsed_time' });
  });

  test('other elapsed-time wordings and verdicts', () => {
    const review = (q, a) => suggestAnswer(pair(q, a), d.outdatedFacts).needsReview;
    expect(review('Delivered 25 days ago, can I return it?', 'Yes, you can still return it within 30 days.')).toBe('verdict_depends_on_elapsed_time');
    expect(review('It came last month.', 'Sorry, it is too late: the window is 30 days.')).toBe('verdict_depends_on_elapsed_time');
    expect(review('Bought it two weeks ago.', 'No problem, 30 days from delivery, you are within the window.')).toBe('verdict_depends_on_elapsed_time');
    // An admin-written answer after the first edit, checked again when the article goes back to 30 days.
    const back = diffArticle(edit('30 days', '14 days'), RETURNS);
    expect(suggestAnswer(pair('It arrived about three weeks ago.', 'Three weeks is past our 14-day window, so it cannot be returned.'), back.outdatedFacts).needsReview).toBe('verdict_depends_on_elapsed_time');
  });

  test('a conditional answer is still safe to update (NS-6)', () => {
    const r = suggestAnswer(
      pair('Returning an unopened monitor. Monitor still sealed, delivered last month.', 'Our window is 30 days from delivery. If it arrived less than 30 days ago you can still return it.'),
      d.outdatedFacts,
    );
    expect(r).toEqual({ suggestion: 'Our window is 14 days from delivery. If it arrived less than 14 days ago you can still return it.', needsReview: null });
  });

  test('a plain fact next to an elapsed time is still updated (NS-3)', () => {
    const r = suggestAnswer(pair('Too late to return a keyboard? The keyboard was delivered 25 days ago, unopened.', 'The return window is 30 days from delivery.'), d.outdatedFacts);
    expect(r).toEqual({ suggestion: 'The return window is 14 days from delivery.', needsReview: null });
  });

  test('a verdict without any elapsed time in the question is updated (NS-8)', () => {
    const r = suggestAnswer(pair('Do you accept returns on sale items? I bought the earphones case in the autumn sale.', 'Yes, sale items have the same 30-day return window.'), d.outdatedFacts);
    expect(r).toEqual({ suggestion: 'Yes, sale items have the same 14-day return window.', needsReview: null });
  });

  test('no number to swap means neither a suggestion nor a review flag', () => {
    expect(suggestAnswer(pair('Arrived three weeks ago.', 'Returns are free.'), d.outdatedFacts)).toEqual({ suggestion: null, needsReview: null });
  });
});
