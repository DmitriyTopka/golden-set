// What an article edit means for one project's golden set.
//
// The baseline is the article text as it was when the pairs were built (stored by the scan), not
// "the previous version": several small edits in a row are judged together against what the
// expected answers were written for. The baseline moves forward only when an admin accepts the edit.
import { route, kvs } from './forge.js';
import { call } from './http.js';
import { forProject } from './store.js';
import { diffArticle, computeImpact, suggestAnswer, applyEdits } from '../core/index.js';
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
  // Content properties can be edited by anyone who can edit the page, so nothing read back is
  // trusted: keep only projects this installation knows, with sane counts.
  const known = new Set(await registeredProjects());
  const count = (n) => (Number.isInteger(n) && n >= 0 && n < 100000 ? n : 0);
  const projects = {};
  for (const [key, c] of Object.entries(existing?.value?.projects || {})) {
    if (known.has(key) && key !== projectKey) projects[key] = { total: count(c?.total), outdated: count(c?.outdated) };
  }
  if (counts) projects[projectKey] = { total: count(counts.total), outdated: count(counts.outdated) };
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

async function currentPage(pageId, spaceId) {
  const p = await call('app', 'confluence', route`/wiki/api/v2/pages/${pageId}?body-format=storage`, { allow404: true });
  // Only pages of the connected knowledge base: a page id from anywhere else is treated as missing.
  if (!p || (spaceId && String(p.spaceId) !== String(spaceId))) return null;
  return { version: p.version?.number || 0, title: p.title, text: stripMarkup(p.body?.storage?.value || '') };
}

/**
 * Compares the article with its baseline and stores the impact for the project.
 * @returns {{ record: object|null, reason: 'changed'|'no_change'|'no_pairs'|'no_baseline'|'page_not_found' }}
 */
export async function checkPage(projectKey, pageId) {
  const db = forProject(projectKey);
  const id = String(pageId);
  const [baseline, selected, cfg] = await Promise.all([db.get(`snap:${id}`), db.getList('pairs:selected'), db.get('config')]);
  const pairs = selected.filter((p) => p.link?.pageId === id);
  if (!baseline) return { record: null, reason: 'no_baseline' };
  if (pairs.length === 0) return { record: null, reason: 'no_pairs' };

  const current = await currentPage(id, cfg?.spaceId);
  if (!current) return { record: null, reason: 'page_not_found' };
  const previous = await db.get(`impact:${id}`);
  const diff = current.version === baseline.version ? { changed: false } : diffArticle(baseline.text, current.text);

  if (!diff.changed) {
    // Back to the baseline, or accepted while this check was running: no open edit for this page.
    if (previous) {
      await db.del(`impact:${id}`);
      await publishByline(id, projectKey, { total: pairs.length, outdated: 0 }).catch(() => null);
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
      const fix = a.status === 'likely_outdated' ? suggestAnswer(p, diff.outdatedFacts) : { suggestion: null, needsReview: null };
      return { ...a, question: p.question, expected: p.expected, suggestion: fix.suggestion, needsReview: fix.needsReview };
    }),
  };
  // The byline is published first and remembered on the record, so a failed write is retried next time.
  const bylineOk = previous?.bylineFor === `${record.toVersion}:${record.counts.outdated}`;
  if (!bylineOk) {
    const ok = await publishByline(id, projectKey, { total: pairs.length, outdated: record.counts.outdated }).then(() => true).catch(() => false);
    if (ok) record.bylineFor = `${record.toVersion}:${record.counts.outdated}`;
  } else record.bylineFor = previous.bylineFor;
  await db.set(`impact:${id}`, record);
  return { record, reason: 'changed' };
}

export async function listImpacts(db) {
  const records = await db.valuesByPrefix('impact:');
  return records.filter((r) => r?.pageId).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}

export async function clearImpacts(db) {
  for (const r of await listImpacts(db)) await db.del(`impact:${r.pageId}`);
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
  const cfg = await db.get('config');
  const current = await currentPage(id, cfg?.spaceId);
  // Someone edited the article again after this check: accepting now would hide the newer change.
  if (current && current.version !== record.toVersion) {
    await checkPage(projectKey, id);
    return { accepted: null, changedAgain: true };
  }
  let applied = 0;
  if (applySuggestions) {
    // Applied suggestions are stored as edits, so a rescan keeps them instead of bringing back the old text.
    const at = new Date().toISOString();
    const fixes = Object.fromEntries(record.affected.filter((a) => a.suggestion).map((a) => [a.id, { expected: a.suggestion, at, source: 'suggestion' }]));
    applied = Object.keys(fixes).length;
    await db.set('edits', { ...((await db.get('edits')) || {}), ...fixes });
    for (const k of ['pairs:selected', 'pairs:reserve', 'pairs:excluded']) {
      const list = await db.getList(k);
      if (list.some((p) => fixes[p.id])) await db.setList(k, applyEdits(list, fixes));
    }
  }
  if (current) await db.set(`snap:${id}`, current);
  await db.del(`impact:${id}`);
  const total = (await db.getList('pairs:selected')).filter((p) => p.link?.pageId === id).length;
  await publishByline(id, projectKey, { total, outdated: 0 }).catch(() => null);
  return { accepted: id, applied };
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
    // One failing project must not stop the checks of the others.
    const results = await checkProject(projectKey).catch((e) => {
      console.error(`scheduled check ${projectKey} failed: ${e.message}`);
      return [];
    });
    const changed = results.filter((r) => r.reason === 'changed');
    if (changed.length) console.log(`scheduled check ${projectKey}: ${changed.map((r) => `${r.pageId} ${r.record.counts.affected}/${r.record.counts.outdated}`).join(', ')}`);
  }
}
