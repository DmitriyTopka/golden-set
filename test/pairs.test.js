import { buildCandidate, isReopened, cleanQuestion, baseScore, isAgentAuthor, REJECT, MAX_TEXT } from '../core/pairs.js';

const reporter = { id: 'c1', name: 'Priya Nair' };
const agent = { id: 'a1', name: 'Sam Rivera' };
const done = [
  { fromCategory: 'new', toCategory: 'indeterminate', at: '2026-09-01T09:05:00Z' },
  { fromCategory: 'indeterminate', toCategory: 'done', at: '2026-09-01T10:00:00Z' },
];

function req(over = {}) {
  return {
    key: 'NW-1',
    reporter,
    summary: 'Can I return my watch?',
    description: 'Bought it 3 weeks ago. Reach me at priya.nair@example.com.',
    statusHistory: done,
    resolvedAt: '2026-09-01T10:00:00Z',
    csat: 5,
    comments: [
      { id: 'n', author: agent, public: false, body: 'internal note', created: '2026-09-01T09:10:00Z' },
      {
        id: 'r',
        author: agent,
        public: true,
        body: 'Hi Priya,\nYou have 30 days from delivery.\nhttps://x.atlassian.net/wiki/spaces/HELP/pages/100001/Returns\nBest regards,\nSam Rivera',
        created: '2026-09-01T09:30:00Z',
      },
    ],
    ...over,
  };
}

describe('buildCandidate', () => {
  test('builds a clean pair from a good request', () => {
    const res = buildCandidate(req());
    expect(res.ok).toBe(true);
    expect(res.pair.question).toBe('Can I return my watch? Bought it 3 weeks ago.');
    expect(res.pair.expected).toBe('You have 30 days from delivery.');
    expect(res.pair.refs.pageIds).toEqual(['100001']);
    expect(res.pair.answerOriginal).not.toMatch(/Priya|Sam|example\.com|https?:/);
  });

  test('uses the last public agent reply before resolution, not internal notes', () => {
    const res = buildCandidate(req());
    expect(res.pair.answerOriginal).not.toMatch(/internal note/);
  });

  test('rejects requests without a public agent answer', () => {
    const r = req({ comments: [{ id: 'x', author: reporter, public: true, body: 'hello?', created: '2026-09-01T09:30:00Z' }] });
    expect(buildCandidate(r)).toEqual({ ok: false, key: 'NW-1', reason: REJECT.NO_ANSWER });
  });

  test('rejects reopened requests', () => {
    const reopened = [...done, { fromCategory: 'done', toCategory: 'indeterminate', at: 'x' }, { fromCategory: 'indeterminate', toCategory: 'done', at: 'y' }];
    expect(buildCandidate(req({ statusHistory: reopened })).reason).toBe(REJECT.REOPENED);
  });

  test('rejects low CSAT but accepts missing CSAT', () => {
    expect(buildCandidate(req({ csat: 2 })).reason).toBe(REJECT.LOW_CSAT);
    expect(buildCandidate(req({ csat: null })).ok).toBe(true);
  });

  test('a thank-you after the answer is fine, a complaint is not', () => {
    const thanks = { id: 't', author: reporter, public: true, body: 'Thanks, that helps!', created: '2026-09-01T09:45:00Z' };
    const complaint = { id: 'k', author: reporter, public: true, body: 'That did not work, still broken.', created: '2026-09-01T09:45:00Z' };
    const ok = buildCandidate(req({ comments: [...req().comments, thanks] }));
    expect(ok.ok).toBe(true);
    expect(ok.pair.signals.thanked).toBe(true);
    expect(buildCandidate(req({ comments: [...req().comments, complaint] })).reason).toBe(REJECT.COMPLAINT);
  });

  test('rejects empty questions', () => {
    expect(buildCandidate(req({ summary: '', description: '' })).reason).toBe(REJECT.EMPTY_QUESTION);
  });
});

describe('helpers', () => {
  test('isReopened', () => {
    expect(isReopened(done)).toBe(false);
    expect(isReopened([{ fromCategory: 'done', toCategory: 'new' }])).toBe(true);
    expect(isReopened()).toBe(false);
  });

  test('cleanQuestion joins summary and description and drops contact lines', () => {
    expect(cleanQuestion('Late parcel', 'Where is it? Call me on +1 415 555 0132.', [])).toBe('Late parcel. Where is it?');
  });

  test('baseScore rewards CSAT and calm endings', () => {
    expect(baseScore({ csat: 5, thanked: true, noFollowUp: false })).toBe(3);
    expect(baseScore({ csat: null, thanked: false, noFollowUp: true })).toBe(1);
  });
});

describe('who counts as the agent (review finding 12)', () => {
  test('a customer participant is not an agent, an Atlassian account is', () => {
    expect(isAgentAuthor({ id: 'c2', name: 'Other customer', accountType: 'customer' }, 'c1')).toBe(false);
    expect(isAgentAuthor({ id: 'a1', name: 'Sam from support', accountType: 'atlassian' }, 'c1')).toBe(true);
    expect(isAgentAuthor({ id: 'b1', name: 'Some bot', accountType: 'app' }, 'c1')).toBe(false);
  });
});

describe('long text is capped (review finding 10)', () => {
  test('a pasted log does not grow the stored pair without limit', () => {
    const log = 'ERROR line. '.repeat(1000);
    const res = buildCandidate({
      key: 'NS-1',
      reporter: { id: 'c1', name: 'Customer' },
      summary: 'App crashes',
      description: log,
      statusHistory: [],
      resolvedAt: '2026-11-01T10:00:00Z',
      comments: [{ id: '1', author: { id: 'a1', name: 'Agent', accountType: 'atlassian' }, public: true, body: `Please reinstall the app from the store and restart the phone. ${log}`, created: '2026-11-01T09:00:00Z' }],
    });
    expect(res.ok).toBe(true);
    expect(res.pair.question.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(res.pair.expected.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(res.pair.answerOriginal.length).toBeLessThanOrEqual(MAX_TEXT);
  });
});
