// Rovo agent actions. All read-only (actionVerb GET): the agent explains, it never changes data.
// Each action answers only with what the asking user could see in Jira themselves.
import { registeredProjects, listImpacts } from './impact.js';
import { toCsv } from '../core/index.js';
import { readerAccess, readableImpacts, visibleKeys, canReadPage } from './access.js';

/**
 * Projects the asking user may read: the same gate as the Golden Set page (browse permission in Jira
 * and access to the knowledge base space the pairs were built from).
 */
async function myProjects() {
  const out = [];
  for (const key of await registeredProjects()) {
    const access = await readerAccess(key);
    if (access) out.push({ key, db: access.db });
  }
  return out;
}

/** Pairs on pages the user cannot read are left out, like on the Golden Set page. */
async function onReadablePages(pairs) {
  const pages = [...new Set(pairs.map((p) => p.link?.pageId).filter(Boolean))];
  const ok = new Set();
  for (const id of pages) if (await canReadPage(id)) ok.add(id);
  return pairs.filter((p) => p.link?.pageId && ok.has(p.link.pageId));
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
    for (const r of await readableImpacts(await listImpacts(db))) {
      if (!matchesArticle(r.title, payload?.articleTitle)) continue;
      const visible = await visibleKeys(r.affected.map((a) => a.id));
      const affected = r.affected.filter((a) => visible.has(a.id));
      if (affected.length === 0) continue;
      result.push({
        project: key,
        article: r.title,
        change: r.changes.map((c) => (c.to ? `${c.from} -> ${c.to}` : `${c.from} removed`)).join(', ') || (r.removedTerms.length ? `wording removed: ${r.removedTerms.slice(0, 3).join(', ')}` : 'wording changed'),
        goldenAnswersOnThisArticle: affected.length,
        likelyOutdated: affected
          .filter((a) => a.status === 'likely_outdated')
          .map((a) => ({
            request: a.id,
            question: a.question,
            currentExpectedAnswer: a.expected,
            suggestedAnswer: a.suggestion,
            ...(a.needsReview ? { note: 'No suggestion: the answer decides from how long ago the customer got the item, so a person should rewrite it.' } : {}),
          })),
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
    const pairs = await onReadablePages((await db.getList('pairs:selected')).filter((p) => p.articleTitle && matchesArticle(p.articleTitle, payload?.articleTitle)));
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
    const impacts = (await readableImpacts(await listImpacts(db))).filter((r) => matchesArticle(r.title, payload?.articleTitle));
    const ids = new Set(impacts.flatMap((r) => r.affected.map((a) => a.id)));
    const pairs = await onReadablePages((await db.getList('pairs:selected')).filter((p) => (ids.size ? ids.has(p.id) : p.articleTitle && matchesArticle(p.articleTitle, payload?.articleTitle))));
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
