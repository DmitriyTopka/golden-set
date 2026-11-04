// "Load demo data": fills a JSM project and a Confluence space with the Northwind Gear demo.
// Runs as the clicking user (an agent), in small steps so each resolver call stays under 25 s.
//
// What a live site can and cannot reproduce from seed/data.mjs:
// - articles, requests raised on behalf of demo customers (example.com) or the project's own customers,
//   public agent replies, resolve/reopen: yes;
// - customer-authored follow-ups and CSAT need the customer's own login: no. The complaint and
//   low-CSAT examples are therefore seeded as reopened requests, which is how they usually end anyway.
import { route } from './forge.js';
import { call } from './http.js';
import { ARTICLES, GOLDEN, NO_LINK, BAD, DUPLICATE_OF } from '../seed/data.mjs';

const STATE = 'seed:state';
const PER_STEP = 4;
const GREETINGS = ['Hi {first},', 'Hello {first},', 'Hi {first}, thanks for reaching out.', 'Hey {first},'];
const SIGNOFFS = ['Best regards,\n{agent}', 'Kind regards,\n{agent}', 'Cheers,\n{agent}', 'Thanks,\n{agent}'];

/** Ordered list of requests to create; `page` is a synthetic page id from data.mjs. */
export function seedPlan() {
  const plan = [];
  GOLDEN.forEach(([page, summary, detail, answer]) => plan.push({ kind: 'golden', page, summary, detail, answer, link: true }));
  NO_LINK.forEach(([summary, detail, answer], i) => plan.push({ kind: i < 6 ? 'nolink_fact' : 'nolink_none', page: null, summary, detail, answer, link: false }));
  BAD.forEach(([, page, summary, detail, answer]) => plan.push({ kind: 'reopened', page, summary, detail, answer, link: true, reopen: true }));
  DUPLICATE_OF.forEach((i) => {
    const [page, summary, detail, answer] = GOLDEN[i];
    plan.push({ kind: 'duplicate', page, summary: `Hello, ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`, detail, answer, link: true });
  });
  return plan;
}

export async function seedState(db) {
  return (await db.get(STATE)) || { phase: 'idle' };
}

export async function resetSeed(db) {
  await db.del(STATE);
}

async function requestTypeId(serviceDeskId) {
  const res = await call('user', 'jira', route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype?limit=50`);
  const types = res?.values || [];
  const preferred = types.find((t) => /question|general|ask/i.test(t.name)) || types[0];
  if (!preferred) throw new Error('This service project has no request types.');
  return String(preferred.id);
}

const DEMO_NAMES = ['Northwind demo customer 1', 'Northwind demo customer 2', 'Northwind demo customer 3'];
const isDemo = (c) => DEMO_NAMES.includes(c.displayName);

async function projectCustomers(serviceDeskId) {
  const res = await call('user', 'jira', route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/customer?limit=50`, {
    headers: { 'X-ExperimentalApi': 'opt-in' },
  });
  return (res?.values || []).filter((c) => c.active !== false);
}

/**
 * Who the demo requests are raised for. First choice: three demo customers on example.com addresses,
 * a reserved domain, so JSM notifications go nowhere. Creating customers needs Jira admin rights; without
 * them the project's own customers are used. Customers of other projects are never touched.
 */
async function demoCustomers(serviceDeskId) {
  let own = await projectCustomers(serviceDeskId);
  const missing = DEMO_NAMES.filter((n) => !own.some((c) => c.displayName === n));
  const added = [];
  for (const name of missing) {
    const n = DEMO_NAMES.indexOf(name) + 1;
    const created = await call('user', 'jira', route`/rest/servicedeskapi/customer`, {
      method: 'POST',
      body: { email: `northwind.demo.${n}@example.com`, displayName: name },
    }).catch(() => null);
    if (created?.accountId) added.push(created.accountId);
  }
  if (added.length) {
    await call('user', 'jira', route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/customer`, {
      method: 'POST',
      headers: { 'X-ExperimentalApi': 'opt-in' },
      body: { accountIds: added },
    });
    own = await projectCustomers(serviceDeskId);
  }
  const demo = own.filter(isDemo);
  const pick = demo.length ? demo : own;
  if (!pick.length) {
    throw new Error('Demo data needs at least one customer in this service project. Ask a Jira admin to load it (they can create demo customers), or add a test customer first.');
  }
  return pick.slice(0, 5).map((c) => ({ id: c.accountId, name: c.displayName, demo: isDemo(c) }));
}

/** Creates the demo articles, or reuses pages with the same titles. Progress is saved after each page. */
async function createPages(st, db) {
  st.pages = st.pages || {};
  for (const a of ARTICLES) {
    if (st.pages[a.pageId]) continue;
    const found = await call('user', 'confluence', route`/wiki/api/v2/spaces/${st.spaceId}/pages?title=${a.title}&status=current&limit=1`);
    const existing = found?.results?.[0];
    const page =
      existing ||
      (await call('user', 'confluence', route`/wiki/api/v2/pages`, {
        method: 'POST',
        body: { spaceId: st.spaceId, status: 'current', title: a.title, body: { representation: 'storage', value: a.body.map((x) => `<p>${x}</p>`).join('') } },
      }));
    st.pages[a.pageId] = String(page.id);
    await db.set(STATE, st);
  }
  return st.pages;
}

// Workflows differ: some go straight to Done, others need "In progress" first. Walk up to 4 steps,
// preferring a transition that lands where we want and never revisiting a status.
async function transitionTo(key, wantDone) {
  const seen = new Set();
  for (let hop = 0; hop < 4; hop += 1) {
    const res = await call('user', 'jira', route`/rest/api/3/issue/${key}/transitions?expand=transitions.fields`);
    const all = res?.transitions || [];
    const target = all.find((x) => (x.to?.statusCategory?.key === 'done') === wantDone);
    const step = target || all.find((x) => x.to?.statusCategory?.key === 'indeterminate' && !seen.has(x.to?.id));
    if (!step) throw new Error(`${key}: no transition to ${wantDone ? 'done' : 'open'}`);
    seen.add(step.to?.id);
    const body = { transition: { id: step.id } };
    if (step.to?.statusCategory?.key === 'done' && step.fields?.resolution) {
      const first = step.fields.resolution.allowedValues?.[0];
      body.fields = { resolution: first?.id ? { id: String(first.id) } : { name: 'Done' } };
    }
    await call('user', 'jira', route`/rest/api/3/issue/${key}/transitions`, { method: 'POST', body });
    if (step === target) return;
  }
  throw new Error(`${key}: could not reach ${wantDone ? 'done' : 'open'} in 4 steps`);
}

function replyText(spec, customer, agentName, pageUrl, n) {
  const first = (customer.name || 'there').split(' ')[0];
  const lines = [GREETINGS[n % GREETINGS.length].replace('{first}', first), spec.answer];
  if (spec.link && pageUrl) lines.push(`More details: ${pageUrl}`);
  lines.push(SIGNOFFS[n % SIGNOFFS.length].replace('{agent}', agentName));
  return lines.join('\n');
}

// Resumable: progress for the request in flight is kept in st.current, so a failed step is retried
// without raising the same request twice.
async function createRequest(spec, n, st, siteUrl, agentName, db) {
  const customer = st.customers[n % st.customers.length];
  if (st.current?.index === n) return finishRequest(spec, n, st, customer, siteUrl, agentName, db);
  const created = await call('user', 'jira', route`/rest/servicedeskapi/request`, {
    method: 'POST',
    body: {
      serviceDeskId: st.serviceDeskId,
      requestTypeId: st.requestTypeId,
      raiseOnBehalfOf: customer.id,
      requestFieldValues: { summary: spec.summary, description: spec.detail },
    },
  });
  st.current = { index: n, key: created.issueKey, step: 'comment' };
  await db.set(STATE, st);
  return finishRequest(spec, n, st, customer, siteUrl, agentName, db);
}

async function finishRequest(spec, n, st, customer, siteUrl, agentName, db) {
  const cur = st.current;
  const save = () => db.set(STATE, st);
  if (cur.step === 'comment') {
    const realPage = spec.page ? st.pages[spec.page] : null;
    const pageUrl = realPage ? `${siteUrl}/wiki/spaces/${st.spaceKey}/pages/${realPage}` : null;
    await call('user', 'jira', route`/rest/servicedeskapi/request/${cur.key}/comment`, {
      method: 'POST',
      body: { body: replyText(spec, customer, agentName, pageUrl, n), public: true },
    });
    cur.step = 'resolve';
    await save();
  }
  if (cur.step === 'resolve') {
    await transitionTo(cur.key, true);
    cur.step = spec.reopen ? 'reopen' : 'done';
    await save();
  }
  if (cur.step === 'reopen') {
    await transitionTo(cur.key, false);
    cur.step = 'resolve-again';
    await save();
  }
  if (cur.step === 'resolve-again') {
    await transitionTo(cur.key, true);
    cur.step = 'done';
  }
  const key = cur.key;
  delete st.current;
  return key;
}

/**
 * Runs one step and returns the new state. The UI calls it until phase === 'done'.
 * @param {object} db project-scoped storage from store.forProject
 * @param {{ serviceDeskId: string, spaceId: string, spaceKey: string }} config
 * @param {{ siteUrl: string, agentName: string }} ctx
 */
export async function seedNext(db, config, ctx) {
  let st = await seedState(db);
  const plan = seedPlan();

  if (st.phase === 'idle' || st.phase === 'error') {
    st = { phase: 'pages', serviceDeskId: config.serviceDeskId, spaceId: config.spaceId, spaceKey: config.spaceKey, created: [], total: plan.length };
  }
  try {
    if (st.phase === 'pages') {
      await createPages(st, db);
      st.phase = 'customers';
    } else if (st.phase === 'customers') {
      st.customers = await demoCustomers(st.serviceDeskId);
      st.requestTypeId = await requestTypeId(st.serviceDeskId);
      st.phase = 'requests';
    } else if (st.phase === 'requests') {
      const from = st.created.length;
      for (let i = from; i < Math.min(from + PER_STEP, plan.length); i += 1) {
        st.created.push(await createRequest(plan[i], i, st, ctx.siteUrl, ctx.agentName, db));
      }
      if (st.created.length >= plan.length) st.phase = 'done';
    }
    delete st.error;
  } catch (e) {
    st.error = String(e.message || e);
    st.phase = st.phase === 'requests' ? 'requests' : st.phase;
  }
  await db.set(STATE, st);
  return st;
}
