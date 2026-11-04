// "Dirty" requests shaped like real support traffic: HTML, signatures, several agent replies,
// automation comments, offsets in timestamps, Cyrillic, bare links. Each case says what must happen.
import { readFileSync } from 'node:fs';
import { selectGoldenSet } from '../core/select.js';

const seed = JSON.parse(readFileSync(new URL('../seed/northwind.json', import.meta.url), 'utf8'));
const articles = seed.articles;
const SITE = 'https://acme.atlassian.net';
const page = (id) => `${SITE}/wiki/spaces/HELP/pages/${id}/x`;

const agent = { id: 'a1', name: 'Sam Rivera', accountType: 'atlassian' };
const bot = { id: 'b1', name: 'Automation for Jira', accountType: 'app' };
let n = 0;
function req(expect, { comments, history, csat = null, summary = 'Question', description = '', resolvedAt = '2026-09-01T12:00:00Z' }) {
  n += 1;
  const reporter = { id: `c${n}`, name: 'Olena Kovalenko' };
  return {
    expect,
    request: {
      key: `D-${n}`,
      reporter,
      summary,
      description,
      csat,
      resolvedAt,
      statusHistory: history || [{ fromCategory: 'indeterminate', toCategory: 'done', at: resolvedAt }],
      comments: comments.map((c, i) => ({ id: `D-${n}-${i}`, public: true, created: `2026-09-01T1${i}:00:00Z`, ...c, author: c.author === 'customer' ? reporter : c.author })),
    },
  };
}

const CASES = [
  req('golden', {
    summary: 'Return window?',
    comments: [{ author: agent, body: `<p>Hi Olena,</p><p>You have 30 days from delivery to return it.</p><p><a href="${page('100001')}">Returns policy</a></p><p>--<br/>Sam<br/>Northwind Gear | Support</p>` }],
  }),
  req('golden', {
    summary: 'Express cost',
    comments: [
      { author: agent, body: 'Let me check that for you.' },
      { author: agent, body: `Express delivery costs $12 and arrives in 1 business day. ${page('100003')}` },
    ],
  }),
  req('golden', {
    summary: 'Warranty on cables',
    comments: [
      { author: agent, body: `Cables have a 1-year warranty. ${page('100002')}` },
      { author: bot, body: 'Your request has been resolved. Reply to reopen.' },
    ],
  }),
  req('reject', {
    summary: 'Cancel fee',
    comments: [
      { author: agent, body: `After 2 hours there is a $5 handling fee. ${page('100004')}` },
      { author: 'customer', body: 'Thanks! One more question though, can I change the address?' },
    ],
  }),
  req('golden', {
    summary: 'PayPal refund speed',
    comments: [
      { author: agent, body: `PayPal refunds arrive within 24 hours. ${page('100005')}` },
      { author: 'customer', body: 'Thank you so much, worked perfectly' },
    ],
  }),
  req('reject', {
    summary: 'Prepaid label',
    comments: [
      { author: agent, body: `Returns are free: we email you a prepaid return label. ${page('100001')}` },
      { author: 'customer', body: 'thx but still no label in my inbox' },
    ],
  }),
  req('golden', {
    summary: 'How long to send it back',
    comments: [{ author: agent, body: 'You can send it back within thirty days of delivery.' }],
  }),
  req('reject-empty', {
    summary: 'Order status',
    comments: [{ author: agent, body: 'Done.' }],
  }),
  req('reject', {
    summary: 'Damaged parcel',
    history: [
      { fromCategory: 'indeterminate', toCategory: 'done', at: '2026-09-01T12:00:00.000+0200' },
      { fromCategory: 'done', toCategory: 'indeterminate', at: '2026-09-02T09:00:00.000+0200' },
      { fromCategory: 'indeterminate', toCategory: 'done', at: '2026-09-02T10:00:00.000+0200' },
    ],
    comments: [{ author: agent, body: `Report damage within 48 hours of delivery. ${page('100006')}` }],
  }),
  req('reject', {
    summary: 'Store credit',
    csat: 1,
    comments: [{ author: agent, body: `We can issue store credit with a 10% bonus. ${page('100005')}` }],
  }),
  req('golden', {
    summary: 'Где мой возврат денег?',
    description: 'Вернул наушники неделю назад.',
    comments: [{ author: agent, body: `Card refunds appear on your statement within 3 business days after we issue them. ${page('100005')}` }],
  }),
  req('golden', {
    summary: 'Free shipping threshold',
    description: 'Call me on +380 67 123 4567 or olena.k@example.com',
    comments: [{ author: agent, body: `Hi Olena, orders over $75 ship free. ${page('100003')}` }],
  }),
  req('reject-empty', {
    summary: 'Delivery time',
    comments: [{ author: agent, body: `See ${page('100003')}` }],
  }),
  req('reserve', {
    summary: 'Repair time estimate',
    comments: [{ author: agent, body: 'Usually 3-5 business days.' }],
  }),
  req('golden', {
    summary: 'Damaged cable under $30',
    comments: [{ author: agent, body: `<div>No need to return a damaged item worth under $30.</div><div>Kind regards,</div><div>Mia</div> ${page('100006')}` }],
  }),
];

const result = selectGoldenSet(CASES.map((c) => c.request), articles);
const selectedIds = new Set(result.selected.map((p) => p.id));
const byId = new Map(result.selected.concat(result.reserve).map((p) => [p.id, p]));

describe('dirty, realistic requests', () => {
  test('every expected golden pair is selected and nothing else is', () => {
    const want = CASES.filter((c) => c.expect === 'golden').map((c) => c.request.key).sort();
    expect([...selectedIds].sort()).toEqual(want);
  });

  test('precision and recall are measured, both 100% on this set', () => {
    const want = new Set(CASES.filter((c) => c.expect === 'golden').map((c) => c.request.key));
    const tp = [...selectedIds].filter((id) => want.has(id)).length;
    expect(tp / selectedIds.size).toBe(1);
    expect(tp / want.size).toBe(1);
  });

  test('rejections carry the right reason', () => {
    const reason = Object.fromEntries(result.rejected.map((r) => [r.id, r.reason]));
    expect(reason['D-4']).toBe('customer_followed_up');
    expect(reason['D-6']).toBe('customer_followed_up');
    expect(reason['D-9']).toBe('reopened');
    expect(reason['D-10']).toBe('low_csat');
    expect(reason['D-13']).toBe('answer_has_no_content');
  });

  test('the agent answer wins over a later automation comment and an earlier "let me check"', () => {
    expect(byId.get('D-2').expected).toBe('Express delivery costs $12 and arrives in 1 business day.');
    expect(byId.get('D-3').expected).toBe('Cables have a 1-year warranty.');
  });

  test('HTML, signatures and personal data do not reach the expected answer', () => {
    expect(byId.get('D-1').expected).toBe('You have 30 days from delivery to return it.');
    expect(byId.get('D-15').expected).toBe('No need to return a damaged item worth under $30.');
    expect(byId.get('D-12').question).not.toMatch(/380|example\.com/);
    expect(byId.get('D-12').expected).toBe('Orders over $75 ship free.');
  });

  test('a word-number answer without a link is tied to the article by fact', () => {
    expect(byId.get('D-7').link).toMatchObject({ pageId: '100001', method: 'fact' });
  });

  test('answers without any fact or link stay in reserve, contentless ones are rejected', () => {
    expect(result.rejected).toContainEqual({ id: 'D-8', reason: 'answer_has_no_content' });
    expect(byId.get('D-14').link).toBeNull();
  });
});
