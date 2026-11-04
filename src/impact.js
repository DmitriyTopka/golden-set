// What an article edit means for one project's golden set.
//
// The baseline is the article text as it was when the pairs were built (stored by the scan), not
// "the previous version": several small edits in a row are judged together against what the
// expected answers were written for. The baseline moves forward only when an admin accepts the edit.
import { route, kvs } from './forge.js';
import { call } from './http.js';
import { forProject } from './store.js';
import { diffArticle, computeImpact, suggestFix } from '../core/index.js';
import { stripMarkup } from '../core/text.js';

// Jira and Confluence get separate installations of the app, and each installation has its own
// storage. Everything here runs in the Jira installation: it owns the pairs, finds edits by reading
// Confluence on a schedule (and when the page is opened), and publishes byline counts to Confluence
// as a content property, which the Confluence installation can read.
export const BYLINE_PROPERTY = 'golden-set-byline-6f1c2a';

/** Remembers which pages this project's golden set relies on, and which projects exist at all. */
export async function registerProject(projectKey, pageIds) {
  const db = forProject(projectKey);
  const previous = (await db.get('pages:used')) || [];
  await db.set('pages:used', pageIds.map(String));
  const all = new Set((await kvs.get('projects')) || []);
  if (pageIds.length) all.add(projectKey);
  else all.delete(projectKey);
  await kvs.set('projects', [...all]);
  return previous.filter((id) => !pageIds.map(String).includes(id));
}

export const registeredProjects = async () => (await kvs.get('projects')) || [];

async function readProperty(pageId) {
  const res = await call('app', 'confluence', route`/wiki/api/v2/pages/${pageId}/properties?key=${BYLINE_PROPERTY}`, { allow404: true });
  return res?.results?.[0] || null;
}

/**
 * Publishes the byline for one page: only counts, never request text, because Confluence readers
 * may not have access to the service project.
 */
export async function publishByline(pageId, projectKey, counts) {
  const existing = await readProperty(pageId);
  const projects = { ...(existing?.value?.projects || {}) };
  if (counts) projects[projectKey] = counts;
  else delete projects[projectKey];
  const total = Object.values(projects).reduce((n, c) => n + c.total, 0);
  const outdated = Object.values(projects).reduce((n, c) => n + c.outdated, 0);
  const value = {
    title: total === 0 ? 'Golden Set' : outdated ? `Golden Set: ${outdated} of ${total} answers may be outdated` : `Golden Set: ${total} answers depend on this page`,
    tooltip: total === 0 ? 'No golden answers rely on this page' : 'Golden answers from resolved service requests that rely on this article',
    projects,
  };
  if (existing) {
    await call('app', 'confluence', route`/wiki/api/v2/pages/${pageId}/properties/${existing.id}`, {
      method: 'PUT',
      body: { key: BYLINE_PROPERTY, value, version: { number: (existing.version?.number || 1) + 1, message: 'Golden Set counts' } },
    });
  } else {
    await call('app', 'confluence', route`/wiki/api/v2/pages/${pageId}/properties`, { method: 'POST', body: { key: BYLINE_PROPERTY, value } });
  }
  return value;
}

export async function readByline(pageId) {
  return (await readProperty(pageId))?.value || null;
}

export async function saveBaselines(db, articles) {
  for (const a of articles) await db.set(`snap:${a.pageId}`, { version: a.version, title: a.title, text: stripMarkup(a.body) });
}

async function currentPage(pageId) {
  const p = await call('app', 'confluence', route`/wiki/api/v2/pages/${pageId}?body-format=storage`, { allow404: true });
  return p ? { version: p.version?.number || 0, title: p.title, text: stripMarkup(p.body?.storage?.value || '') } : null;
}

/**
 * Compares the article with its baseline and stores the impact for the project.
 * @returns {{ record: object|null, reason: 'changed'|'no_change'|'no_pairs'|'no_baseline'|'page_not_found' }}
 */
export async function checkPage(projectKey, pageId) {
  const db = forProject(projectKey);
  const id = String(pageId);
  const [baseline, selected] = await Promise.all([db.get(`snap:${id}`), db.getList('pairs:selected')]);
  const pairs = selected.filter((p) => p.link?.pageId === id);
  if (!baseline) return { record: null, reason: 'no_baseline' };
  if (pairs.length === 0) return { record: null, reason: 'no_pairs' };

  const current = await currentPage(id);
  if (!current) return { record: null, reason: 'page_not_found' };
  if (current.version === baseline.version) return { record: null, reason: 'no_change' };
  const diff = diffArticle(baseline.text, current.text);
  const impacts = new Set((await db.get('impacts')) || []);

  if (!diff.changed) {
    if (impacts.has(id)) {
      await db.del(`impact:${id}`);
      impacts.delete(id);
      await db.set('impacts', [...impacts]);
      await publishByline(id, projectKey, { total: pairs.length, outdated: 0 });
    }
    return { record: null, reason: 'no_change' };
  }

  const impact = computeImpact(pairs, diff);
  const byId = new Map(pairs.map((p) => [p.id, p]));
  const record = {
    pageId: id,
    title: current.title,
    fromVersion: baseline.version,
    toVersion: current.version,
    checkedAt: new Date().toISOString(),
    changes: diff.outdatedFacts.map((f) => ({ from: f.raw, to: f.replacedBy })),
    removedTerms: diff.removedTerms,
    factsDetected: diff.factsDetected,
    additionsOnly: diff.additionsOnly,
    counts: impact.counts,
    affected: impact.affected.map((a) => {
      const p = byId.get(a.id);
      return { ...a, question: p.question, expected: p.expected, suggestion: a.status === 'likely_outdated' ? suggestFix(p.expected, diff.outdatedFacts) : null };
    }),
  };
  const previous = await db.get(`impact:${id}`);
  await db.set(`impact:${id}`, record);
  impacts.add(id);
  await db.set('impacts', [...impacts]);
  if (!previous || previous.toVersion !== record.toVersion) await publishByline(id, projectKey, { total: pairs.length, outdated: record.counts.outdated });
  return { record, reason: 'changed' };
}

export async function listImpacts(db) {
  const ids = (await db.get('impacts')) || [];
  const records = await Promise.all(ids.map((id) => db.get(`impact:${id}`)));
  return records.filter(Boolean).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}

/**
 * The admin accepts the edit: suggested answers are applied (when asked) and the baseline moves to
 * the current version, so the next check compares against the article the answers now match.
 */
export async function acceptEdit(projectKey, pageId, { applySuggestions }) {
  const db = forProject(projectKey);
  const id = String(pageId);
  const record = await db.get(`impact:${id}`);
  if (!record) return null;
  if (applySuggestions) {
    const fixes = new Map(record.affected.filter((a) => a.suggestion).map((a) => [a.id, a.suggestion]));
    const selected = await db.getList('pairs:selected');
    await db.setList('pairs:selected', selected.map((p) => (fixes.has(p.id) ? { ...p, expected: fixes.get(p.id), updatedFrom: p.expected } : p)));
  }
  const current = await currentPage(id);
  if (current) await db.set(`snap:${id}`, current);
  await db.del(`impact:${id}`);
  await db.set('impacts', ((await db.get('impacts')) || []).filter((x) => x !== id));
  const total = (await db.getList('pairs:selected')).filter((p) => p.link?.pageId === id).length;
  await publishByline(id, projectKey, { total, outdated: 0 });
  return { accepted: id, applied: applySuggestions ? record.affected.filter((a) => a.suggestion).length : 0 };
}

/** Checks every page the project relies on. Cheap when nothing changed: one version read per page. */
export async function checkProject(projectKey) {
  const db = forProject(projectKey);
  let pages = await db.get('pages:used');
  if (!pages) {
    // Sets built before page tracking existed: derive the pages from the pairs once and remember them.
    pages = [...new Set((await db.getList('pairs:selected')).map((p) => p.link?.pageId).filter(Boolean))];
    await registerProject(projectKey, pages);
  }
  const results = [];
  for (const id of pages) {
    try {
      results.push({ pageId: id, ...(await checkPage(projectKey, id)) });
    } catch (e) {
      results.push({ pageId: id, record: null, reason: `error: ${e.message}` });
    }
  }
  return results;
}

/** Scheduled every five minutes in the Jira installation. */
export async function scheduledCheck() {
  for (const projectKey of await registeredProjects()) {
    const results = await checkProject(projectKey);
    const changed = results.filter((r) => r.reason === 'changed');
    if (changed.length) console.log(`scheduled check ${projectKey}: ${changed.map((r) => `${r.pageId} ${r.record.counts.affected}/${r.record.counts.outdated}`).join(', ')}`);
  }
}
