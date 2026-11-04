// Builds seed/northwind.json from seed/data.mjs. Deterministic: same input, same file.
// Every request carries `_label` so tests know the truth; the loader strips it before upload.
//
// Usage: node seed/generate.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SITE, ARTICLES, DEMO_EDIT, CUSTOMERS, AGENTS, GOLDEN, NO_LINK, BAD, DUPLICATE_OF } from './data.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// Small LCG so the output never changes between runs.
let state = 20261104;
const rand = () => {
  state = (state * 1103515245 + 12345) % 2147483648;
  return state / 2147483648;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const GREETINGS = ['Hi {first},', 'Hello {first},', 'Hi {first}, thanks for reaching out.', 'Hey {first},'];
const SIGNOFFS = ['Best regards,\n{agent}', 'Kind regards,\n{agent}', 'Cheers,\n{agent}', 'Thanks,\n{agent}\nNorthwind Gear Support'];
const THANKS = ['Thanks, that helps!', 'Great, thank you.', 'Perfect, thanks!', 'Got it, thanks.'];

const start = Date.UTC(2026, 8, 1, 9, 0, 0);
let clock = 0;
const at = (minutesFromRequest) => new Date(start + clock * 3600_000 * 7 + minutesFromRequest * 60_000).toISOString();

function pageUrl(pageId) {
  const a = ARTICLES.find((x) => x.pageId === pageId);
  return `${SITE}/wiki/spaces/HELP/pages/${pageId}/${encodeURIComponent(a.title).replace(/%20/g, '+')}`;
}

// Adds personal data the way real customers do, so the PII filter has something to remove.
function withPII(detail, customer, i) {
  if (i % 4 === 0) return `${detail} My order is #NW-${48000 + i}.`;
  if (i % 4 === 1) return `${detail} You can reach me at ${customer.email}.`;
  if (i % 4 === 2) return `${detail} Call me on ${customer.phone} if easier.`;
  return detail;
}

function reply(customer, agent, answer, pageId) {
  const first = customer.name.split(' ')[0];
  const lines = [pick(GREETINGS).replace('{first}', first), answer];
  if (pageId) lines.push(`More details: ${pageUrl(pageId)}`);
  lines.push(pick(SIGNOFFS).replace('{agent}', agent.name));
  return lines.join('\n');
}

let seq = 0;
function request({ label, summary, detail, answer, pageId, csat, reopened = false, followUp = null, thank = false, internalNote = false }) {
  seq += 1;
  clock += 1;
  const key = `NW-${100 + seq}`;
  const customer = CUSTOMERS[seq % CUSTOMERS.length];
  const agent = AGENTS[seq % AGENTS.length];
  const comments = [];
  if (internalNote) comments.push({ id: `${key}-c0`, author: { id: agent.id, name: agent.name }, public: false, body: 'Checked the order in the admin panel.', created: at(10) });
  comments.push({ id: `${key}-c1`, author: { id: agent.id, name: agent.name }, public: true, body: reply(customer, agent, answer, pageId), created: at(30) });
  if (thank) comments.push({ id: `${key}-c2`, author: { id: customer.id, name: customer.name }, public: true, body: pick(THANKS), created: at(45) });
  if (followUp) comments.push({ id: `${key}-c2`, author: { id: customer.id, name: customer.name }, public: true, body: followUp, created: at(50) });

  const statusHistory = [
    { fromCategory: 'new', toCategory: 'indeterminate', at: at(5) },
    { fromCategory: 'indeterminate', toCategory: 'done', at: at(60) },
  ];
  if (reopened) {
    statusHistory.push({ fromCategory: 'done', toCategory: 'indeterminate', at: at(600) });
    statusHistory.push({ fromCategory: 'indeterminate', toCategory: 'done', at: at(900) });
  }
  return {
    key,
    _label: label,
    reporter: { id: customer.id, name: customer.name },
    summary,
    description: withPII(detail, customer, seq),
    created: at(0),
    statusHistory,
    comments,
    resolvedAt: reopened ? at(900) : at(60),
    csat: csat ?? null,
    _expectedPageId: pageId || null,
  };
}

const requests = [];
const dupSources = new Set(DUPLICATE_OF);

GOLDEN.forEach(([pageId, summary, detail, answer], i) => {
  const csat = dupSources.has(i) ? 5 : pick([5, 4, null, 5, null]);
  const thank = rand() < 0.5;
  requests.push(request({ label: 'golden', summary, detail, answer, pageId, csat, thank, internalNote: i % 7 === 0 }));
});

NO_LINK.forEach(([summary, detail, answer], i) => {
  const expectedPage = ['100001', '100002', '100003', '100004', '100005', '100006'][i] || null;
  const r = request({ label: i < 6 ? 'nolink_fact' : 'nolink_none', summary, detail, answer, pageId: null, csat: pick([5, 4, null]), thank: rand() < 0.5 });
  r._expectedPageId = expectedPage;
  requests.push(r);
});

BAD.forEach(([kind, pageId, summary, detail, answer]) => {
  requests.push(
    request({
      label: kind,
      summary,
      detail,
      answer,
      pageId,
      csat: kind === 'low_csat' ? pick([1, 2]) : null,
      reopened: kind === 'reopened',
      followUp: kind === 'complaint' ? "That didn't solve it, the problem is still there." : null,
    })
  );
});

DUPLICATE_OF.forEach((i) => {
  const [pageId, summary, detail, answer] = GOLDEN[i];
  requests.push(request({ label: 'duplicate', summary: `Hello, ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`, detail, answer, pageId, csat: null }));
});

const articles = ARTICLES.map((a) => ({ pageId: a.pageId, title: a.title, version: 1, body: a.body.map((s) => `<p>${s}</p>`).join('') }));
const edited = articles.find((a) => a.pageId === DEMO_EDIT.pageId);
const demoEdit = { pageId: DEMO_EDIT.pageId, version: 2, body: edited.body.replace(DEMO_EDIT.from, DEMO_EDIT.to) };

const out = { generatedFrom: 'seed/data.mjs', site: SITE, articles, demoEdit, customers: CUSTOMERS, agents: AGENTS, requests };
writeFileSync(join(here, 'northwind.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`northwind.json: ${requests.length} requests, ${articles.length} articles`);
