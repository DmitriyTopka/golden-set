// Rovo agent actions. All read-only (actionVerb GET): the agent explains, it never changes data.
// Each action answers only with what the asking user could see in Jira themselves.
import { route } from './forge.js';
import { call } from './http.js';
import { forProject } from './store.js';
import { registeredProjects, listImpacts } from './impact.js';
import { toCsv } from '../core/index.js';

async function canBrowse(projectKey) {
  try {
    const res = await call('user', 'jira', route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=BROWSE_PROJECTS`);
    return Boolean(res?.permissions?.BROWSE_PROJECTS?.havePermission);
  } catch {
    return false;
  }
}

async function visibleKeys(keys) {
  const visible = new Set();
  for (let i = 0; i < keys.length; i += 100) {
    const res = await call('user', 'jira', route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: { jql: `key in (${keys.slice(i, i + 100).join(',')})`, fields: ['summary'], maxResults: 100 },
    });
    for (const issue of res?.issues || []) visible.add(issue.key);
  }
  return visible;
}

/** Projects the asking user can browse, with their storage. */
async function myProjects() {
  const all = await registeredProjects();
  // Diagnostic for the multi-install question: which installation runs Rovo actions, and what it can see.
  console.log(`rovo action: ${all.length} registered project(s) in this installation`);
  const out = [];
  for (const key of all) if (await canBrowse(key)) out.push({ key, db: forProject(key) });
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function matchesArticle(title, wanted) {
  if (!wanted) return true;
  const a = norm(title);
  const b = norm(wanted);
  return a === b || a.includes(b) || b.includes(a);
}

const noProjects = 'Golden Set has no golden set you can see yet. A project administrator opens the Golden Set page in a service project and runs a scan first.';

export async function listArticleImpacts(payload) {
  const projects = await myProjects();
  if (projects.length === 0) return noProjects;
  const result = [];
  for (const { key, db } of projects) {
    for (const r of await listImpacts(db)) {
      if (!matchesArticle(r.title, payload?.articleTitle)) continue;
      const visible = await visibleKeys(r.affected.map((a) => a.id));
      const affected = r.affected.filter((a) => visible.has(a.id));
      result.push({
        project: key,
        article: r.title,
        change: r.changes.map((c) => (c.to ? `${c.from} -> ${c.to}` : `${c.from} removed`)).join(', ') || (r.removedTerms.length ? `wording removed: ${r.removedTerms.slice(0, 3).join(', ')}` : 'wording changed'),
        goldenAnswersOnThisArticle: affected.length,
        likelyOutdated: affected
          .filter((a) => a.status === 'likely_outdated')
          .map((a) => ({ request: a.id, question: a.question, currentExpectedAnswer: a.expected, suggestedAnswer: a.suggestion })),
        toRecheck: affected.filter((a) => a.status !== 'likely_outdated').map((a) => a.id),
        checkedAt: r.checkedAt,
      });
    }
  }
  if (result.length === 0) return 'No help article has changed since the golden set was built, so no golden answer is affected.';
  return { articleEdits: result };
}

export async function getArticlePairs(payload) {
  const projects = await myProjects();
  if (projects.length === 0) return noProjects;
  const out = [];
  for (const { key, db } of projects) {
    const pairs = (await db.getList('pairs:selected')).filter((p) => p.articleTitle && matchesArticle(p.articleTitle, payload?.articleTitle));
    const visible = await visibleKeys(pairs.map((p) => p.id));
    for (const p of pairs.filter((x) => visible.has(x.id))) {
      out.push({ project: key, article: p.articleTitle, request: p.id, question: p.question, expectedAnswer: p.expected });
    }
  }
  if (out.length === 0) return `No golden answers rely on an article called "${payload?.articleTitle || ''}".`;
  return { goldenPairs: out.slice(0, 50), total: out.length };
}

export async function getRetestCsv(payload) {
  const projects = await myProjects();
  if (projects.length === 0) return noProjects;
  const rows = [];
  for (const { db } of projects) {
    const impacts = (await listImpacts(db)).filter((r) => matchesArticle(r.title, payload?.articleTitle));
    const ids = new Set(impacts.flatMap((r) => r.affected.map((a) => a.id)));
    const pairs = (await db.getList('pairs:selected')).filter((p) => (ids.size ? ids.has(p.id) : p.articleTitle && matchesArticle(p.articleTitle, payload?.articleTitle)));
    const visible = await visibleKeys(pairs.map((p) => p.id));
    rows.push(...pairs.filter((p) => visible.has(p.id)));
  }
  if (rows.length === 0) return 'There is nothing to re-test for that article.';
  return {
    howToUse: 'Save this as a .csv file and upload it in Rovo Studio: your agent, Evaluation, Create dataset. Then run Response accuracy.',
    rows: rows.length,
    csv: toCsv(rows.slice(0, 100)),
  };
}
