// One test per finding of the 04.11 code review, so none of them comes back.
import { normalizeAnswer } from '../core/normalize.js';
import { factKeys, extractTerms } from '../core/facts.js';
import { tokenize, jaccard, contentTokens } from '../core/text.js';
import { buildCandidate, isAgentAuthor, REJECT } from '../core/pairs.js';
import { redactPII, containsPII, luhnValid } from '../core/pii.js';
import { dedupe } from '../core/select.js';
import { escapeCell, parseCsv, validateCsv } from '../core/csv.js';

const keys = (t) => [...factKeys(t)].sort();

describe('R1-R2 normalize keeps the fact next to greetings and fillers', () => {
  test('"Hi there," does not swallow the sentence', () => {
    expect(normalizeAnswer('Hi there, refunds take 5 business days.')).toBe('Refunds take 5 business days.');
  });
  test('"Hello [name], ..." keeps the rest and drops a trailing Thanks!', () => {
    expect(normalizeAnswer('Hello [name], you can return items within 30 days. Thanks!')).toBe('You can return items within 30 days.');
  });
  test('filler clause is cut, fact stays; bare "Best," ends the reply', () => {
    expect(normalizeAnswer('Hi [name],\nThanks for reaching out, refunds take 5 business days.\nBest,\n[name]')).toBe('Refunds take 5 business days.');
  });
});

describe('R3-R5 facts', () => {
  test('thousand separators', () => {
    expect(keys('$1,000')).toEqual(['money:1000 usd']);
    expect(keys('1,000 USD')).toEqual(['money:1000 usd']);
    expect(keys('$1,250.00')).toEqual(['money:1250 usd']);
    expect(keys('€12,50')).toEqual(['money:12.5 eur']);
  });
  test('compound and missing word numbers', () => {
    expect(keys('twenty-one days')).toEqual(['duration:21 day']);
    expect(keys('seventeen days')).toEqual(['duration:17 day']);
    expect(keys('fifty days')).toEqual(['duration:50 day']);
  });
  test('ranges are one fact and change when either end changes', () => {
    expect(keys('3-5 business days')).toEqual(['duration:3-5 business day']);
    expect(keys('3 to 5 days')).toEqual(['duration:3-5 day']);
    expect(keys('3-5 business days')).not.toEqual(keys('2-5 business days'));
    expect(keys('1-2 weeks')).toEqual(['duration:7-14 day']);
  });
  test('frequency is not a promise, currency code first and "per cent" work', () => {
    expect(keys('we restock once a month')).toEqual([]);
    expect(keys('USD 25')).toEqual(['money:25 usd']);
    expect(keys('15 per cent')).toEqual(['percent:15']);
  });
});

describe('R6 non-Latin text', () => {
  test('Cyrillic is tokenized and two different questions are not duplicates', () => {
    expect(tokenize('Где мой заказ?')).toEqual(['где', 'мой', 'заказ']);
    expect(jaccard(contentTokens('Где мой заказ?'), contentTokens('Как вернуть товар?'))).toBe(0);
    const { kept } = dedupe([
      { id: 'a', score: 1, question: 'Где мой заказ?', summary: 'Где мой заказ?' },
      { id: 'b', score: 1, question: 'Как вернуть товар?', summary: 'Как вернуть товар?' },
    ]);
    expect(kept).toHaveLength(2);
  });
  test('empty token sets are never similar', () => {
    expect(jaccard([], [])).toBe(0);
  });
});

const reporter = { id: 'c1', name: 'Priya Nair' };
const agent = { id: 'a1', name: 'Sam Rivera', accountType: 'atlassian' };
const base = {
  key: 'NW-9',
  reporter,
  summary: 'When will my refund arrive?',
  description: '',
  statusHistory: [{ fromCategory: 'indeterminate', toCategory: 'done' }],
  csat: null,
};

describe('R7-R8 who answered and when', () => {
  test('timestamps with offsets are compared as times, not strings', () => {
    // 09:30+0200 is 07:30Z, before the 08:00Z resolution; string order says the opposite.
    const r = {
      ...base,
      resolvedAt: '2026-09-01T08:00:00.000Z',
      comments: [{ id: 'x', author: agent, public: true, body: 'Card refunds take 3 business days.', created: '2026-09-01T09:30:00.000+0200' }],
    };
    expect(buildCandidate(r).ok).toBe(true);
  });
  test('automation and app comments are not the agent answer', () => {
    const bot = { id: 'b1', name: 'Automation for Jira', accountType: 'app' };
    const r = {
      ...base,
      resolvedAt: '2026-09-01T10:00:00Z',
      comments: [
        { id: '1', author: agent, public: true, body: 'Card refunds take 3 business days.', created: '2026-09-01T09:00:00Z' },
        { id: '2', author: bot, public: true, body: 'Your request has been resolved.', created: '2026-09-01T09:59:00Z' },
      ],
    };
    expect(buildCandidate(r).pair.expected).toBe('Card refunds take 3 business days.');
    expect(isAgentAuthor({ id: 'z', name: 'Support Bot' }, 'c1')).toBe(false);
    expect(isAgentAuthor({ id: 'z', name: 'Mia', accountType: 'customer' }, 'c1')).toBe(false);
  });
});

describe('R9 PII coverage and over-redaction', () => {
  test('IP addresses and ISO dates survive, serials become [id]', () => {
    expect(redactPII('router at 192.168.100.200')).toBe('router at 192.168.100.200');
    expect(redactPII('from 2026-11-04 2026-11-30')).toBe('from 2026-11-04 2026-11-30');
    expect(redactPII('serial 4820193746')).toBe('serial [id]');
  });
  test('names in any case and in Cyrillic', () => {
    expect(redactPII('ALEX MORGAN and alex wrote', { names: ['Alex Morgan'] })).toBe('[name] and [name] wrote');
    expect(redactPII('Пишет Олена Петренко', { names: ['Олена Петренко'] })).toBe('Пишет [name]');
  });
  test('IBAN and Luhn-checked cards', () => {
    expect(redactPII('IBAN DE89 3704 0044 0532 0130 00 please')).toBe('IBAN [iban] please');
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(redactPII('ref 1234 5678 9012 3456')).not.toBe('ref [card]');
  });
  test('validator now catches phones too', () => {
    expect(containsPII('call +44 20 7946 0958')).toBe(true);
    expect(containsPII('router 192.168.100.200')).toBe(false);
  });
});

describe('R10-R11 diff noise', () => {
  test('no phantom bigram across a removed number', () => {
    expect(extractTerms('refunds take 5 days').has('take days')).toBe(false);
    expect(extractTerms('refunds take 5 days').has('refunds take')).toBe(true);
  });
});

describe('R12 gratitude that is really a complaint', () => {
  test('"Thanks, but it still does not work" rejects the pair', () => {
    const r = {
      ...base,
      resolvedAt: '2026-09-01T10:00:00Z',
      comments: [
        { id: '1', author: agent, public: true, body: 'Card refunds take 3 business days.', created: '2026-09-01T09:00:00Z' },
        { id: '2', author: reporter, public: true, body: 'Thanks, but it still does not work', created: '2026-09-01T09:10:00Z' },
      ],
    };
    expect(buildCandidate(r).reason).toBe(REJECT.COMPLAINT);
  });
});

describe('CSV hardening', () => {
  test('formula injection is neutralised', () => {
    expect(escapeCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(escapeCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
  test('malformed quotes are rejected, trailing blank lines are fine', () => {
    expect(() => parseCsv('"a"b,c\n')).toThrow();
    expect(validateCsv('prompt\nq1\n\n').ok).toBe(true);
  });
});
