import { extractFacts, factKeys, extractTerms } from '../core/facts.js';

const keys = (t) => [...factKeys(t)].sort();

describe('extractFacts', () => {
  test('durations in digits, hyphenated and words', () => {
    expect(keys('within 30 days')).toEqual(['duration:30 day']);
    expect(keys('a 30-day window')).toEqual(['duration:30 day']);
    expect(keys('two weeks')).toEqual(['duration:14 day']);
    expect(keys('a 2-year warranty')).toEqual(['duration:2 year']);
  });

  test('weeks and days compare as the same fact', () => {
    expect(keys('two weeks')).toEqual(keys('14 days'));
  });

  test('business days are a different fact from calendar days', () => {
    expect(keys('5 business days')).toEqual(['duration:5 business day']);
    expect(keys('5 working days')).toEqual(['duration:5 business day']);
    expect(keys('5 days')).not.toEqual(keys('5 business days'));
  });

  test('money with prefix and suffix currencies', () => {
    expect(keys('costs $12')).toEqual(['money:12 usd']);
    expect(keys('costs 12 USD')).toEqual(['money:12 usd']);
    expect(keys('€10 or £5')).toEqual(['money:10 eur', 'money:5 gbp']);
    expect(keys('49 dollars')).toEqual(['money:49 usd']);
  });

  test('percentages', () => {
    expect(keys('a 15% fee and a 10 percent bonus')).toEqual(['percent:10', 'percent:15']);
  });

  test('ignores "a day" style noise but keeps "a week"', () => {
    expect(keys('we check once a day')).toEqual([]);
    expect(keys('in a week')).toEqual(['duration:7 day']);
  });

  test('deduplicates repeated facts and keeps the raw text', () => {
    const facts = extractFacts('30 days. Again: 30 days.');
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: 'duration', raw: '30 days' });
  });

  test('empty input', () => {
    expect(extractFacts('')).toEqual([]);
    expect(extractFacts(undefined)).toEqual([]);
  });
});

describe('extractTerms', () => {
  test('content bigrams without numbers or stopwords', () => {
    const terms = extractTerms('Returns are free: we email you a prepaid return label.');
    expect(terms.has('returns free')).toBe(true);
    expect(terms.has('prepaid return')).toBe(true);
    expect([...terms].some((t) => /\d/.test(t))).toBe(false);
  });
});
