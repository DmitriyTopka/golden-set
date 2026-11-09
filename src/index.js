// Resolver for the Golden Set queue page. Long jobs (scan, demo data) run in small steps that the UI
// repeats, so every call stays under the 25 s UI-function limit.
//
// Access model: everything is scoped to the JSM project the page is opened in. Reading the golden set
// needs "Browse projects" there and access to the configured Confluence space; changing it (settings,
// scan, demo data, "not golden" marks) needs "Administer projects". Permissions are checked as the
// calling user, while bulk reads run as the app.
import { Resolver, route } from './forge.js';
import { call, mapLimit } from './http.js';
import { forProject } from './store.js';
import { listServiceDesks, statusCategories, closedRequestKeys, readRequests } from './jsm.js';
import { readArticles } from './confluence.js';
import { seedNext, seedState, resetSeed } from './seed.js';
import { registerProject, publishByline, readByline, saveBaselines, checkPage, checkProject, listImpacts, clearImpacts, acceptEdit } from './impact.js';
import { selectFromCandidates, buildCandidate, reselect, toCsvChunks, cleanExpected, applyEdits, undoEdit } from '../core/index.js';
import { permissions, canSeeSpace, visibleKeys, readableImpacts, onReadablePages } from './access.js';

const resolver = new Resolver();
const SCAN_BATCH = 10;

function projectKeyOf(context) {
  const key = context?.extension?.project?.key;
  if (!key) throw new Error('Open Golden Set from a service project.');
  return key;
}

/** Resolves the project, checks the caller and returns project-scoped storage. */
async function guard(context, level) {
  const projectKey = projectKeyOf(context);
  const perms = await permissions(projectKey);
  if (!perms.browse || (level === 'admin' && !perms.admin)) {
    throw new Error(level === 'admin' ? 'Only project administrators can change the golden set.' : 'You do not have access to this project.');
  }
  return { projectKey, perms, db: forProject(projectKey) };
}

const configOf = async (db) => (await db.get('config')) || null;

/** Every key that holds pairs or anything derived from them. Cleared together when the space changes. */
const PAIR_LISTS = ['pairs:selected', 'pairs:reserve', 'pairs:excluded'];
const PAIR_KEYS = ['pairs:rejected', 'pairs:duplicates', 'result:summary', 'articles:versions', 'excluded', 'edits'];
async function clearResults(db, projectKey) {
  const versions = (await db.get('articles:versions')) || {};
  await clearImpacts(db);
  await Promise.all(Object.keys(versions).map((id) => db.del(`snap:${id}`)));
  const dropped = await registerProject(projectKey, []);
  for (const id of dropped) await publishByline(id, projectKey, null).catch(() => null);
  await Promise.all([...PAIR_LISTS.map((k) => db.clearList(k)), db.clearList('cand'), ...PAIR_KEYS.map((k) => db.del(k))]);
}


resolver.define('getOverview', async ({ context }) => {
  const { projectKey, perms, db } = await guard(context, 'browse');
  const [cfg, seed, scan, summary] = await Promise.all([configOf(db), seedState(db), db.get('scan:state'), db.get('result:summary')]);
  // Non-admins only need to know whether a set exists; seed progress and request keys stay with admins.
  const brief = (x) => (x ? { phase: x.phase, total: x.total, done: x.done } : { phase: 'idle' });
  return {
    projectKey,
    isAdmin: perms.admin,
    config: cfg && (perms.admin ? cfg : { spaceName: cfg.spaceName, projectName: cfg.projectName }),
    seed: perms.admin ? seed : brief(seed),
    scan: perms.admin ? scan || { phase: 'idle' } : brief(scan),
    // Readers see the numbers only with access to the knowledge base space, like the pairs themselves.
    summary: summary && (perms.admin || !summary.spaceId || (await canSeeSpace(summary.spaceId))) ? summary : null,
  };
});

resolver.define('listSources', async ({ context }) => {
  await guard(context, 'admin');
  // Spaces are listed as the user, so an admin only picks from spaces they can read.
  const spaces = [];
  let cursor = null;
  do {
    const res = await call('user', 'confluence', cursor ? route`/wiki/api/v2/spaces?limit=100&type=global&cursor=${cursor}` : route`/wiki/api/v2/spaces?limit=100&type=global`);
    spaces.push(...(res?.results || []).map((s) => ({ id: String(s.id), key: s.key, name: s.name })));
    const next = res?._links?.next;
    cursor = next ? new URL(next, 'https://x').searchParams.get('cursor') : null;
  } while (cursor && spaces.length < 2000);
  return { spaces: spaces.sort((a, b) => a.name.localeCompare(b.name)) };
});

resolver.define('saveConfig', async ({ payload, context }) => {
  const { projectKey, db } = await guard(context, 'admin');
  const desk = (await listServiceDesks()).find((d) => d.projectKey === projectKey);
  if (!desk) throw new Error('This project is not a service project.');
  const spaces = await call('user', 'confluence', route`/wiki/api/v2/spaces?keys=${payload.spaceKey}`);
  const space = spaces?.results?.[0];
  if (!space) throw new Error('Confluence space not found or not visible to you.');
  const cfg = { serviceDeskId: desk.id, projectKey, projectName: desk.name, spaceId: String(space.id), spaceKey: space.key, spaceName: space.name };
  const previous = await configOf(db);
  if (previous && previous.spaceId !== cfg.spaceId) {
    // Pairs quote articles of the old space; drop them so readers are never checked against the wrong space.
    await clearResults(db, projectKey);
  }
  await db.set('config', cfg);
  return cfg;
});

resolver.define('seedNext', async ({ context }) => {
  const { db } = await guard(context, 'admin');
  const cfg = await configOf(db);
  if (!cfg) throw new Error('Choose a knowledge base space first.');
  const [me, info] = await Promise.all([
    call('user', 'jira', route`/rest/api/3/myself`),
    call('app', 'jira', route`/rest/api/3/serverInfo`),
  ]);
  // Queue pages do not always pass siteUrl in the context; serverInfo always has the base URL.
  const siteUrl = context.siteUrl || info?.baseUrl;
  return seedNext(db, cfg, { siteUrl, agentName: me?.displayName || 'Support' });
});

resolver.define('seedReset', async ({ context }) => {
  const { db } = await guard(context, 'admin');
  await resetSeed(db);
  return seedState(db);
});

resolver.define('scanStart', async ({ context }) => {
  const { db } = await guard(context, 'admin');
  const cfg = await configOf(db);
  if (!cfg) throw new Error('Choose a knowledge base space first.');
  const keys = await closedRequestKeys(cfg.projectKey);
  await db.clearList('cand');
  await db.clearList('raw'); // left by versions that stored whole requests
  const st = { phase: 'reading', keys, done: 0, startedAt: new Date().toISOString() };
  await db.set('scan:state', st);
  return { phase: st.phase, total: keys.length, done: 0 };
});

resolver.define('scanBatch', async ({ context }) => {
  const { db } = await guard(context, 'admin');
  const st = await db.get('scan:state');
  if (!st || st.phase !== 'reading') return st;
  const categories = await statusCategories();
  const batch = st.keys.slice(st.done, st.done + SCAN_BATCH);
  // Each request is turned into a redacted candidate (or a rejection) at once: raw customer text is never stored.
  const results = (await readRequests(batch, categories)).map(buildCandidate);
  await db.appendChunk('cand', Math.floor(st.done / SCAN_BATCH), results);
  st.done += batch.length;
  if (st.done >= st.keys.length) st.phase = 'selecting';
  await db.set('scan:state', st);
  return { phase: st.phase, total: st.keys.length, done: st.done };
});

resolver.define('scanFinish', async ({ context }) => {
  const { db } = await guard(context, 'admin');
  const cfg = await configOf(db);
  const st = await db.get('scan:state');
  const [results, articles, excludedList, edits, previousVersions] = await Promise.all([
    db.getList('cand'),
    readArticles(cfg.spaceId),
    db.get('excluded'),
    db.get('edits'),
    db.get('articles:versions'),
  ]);
  const result = selectFromCandidates(results, articles);
  const titles = Object.fromEntries(articles.map((a) => [a.pageId, a.title]));
  const withTitles = (p) => ({ ...p, articleTitle: p.link ? titles[p.link.pageId] : null });
  // "Not golden" marks survive a rescan: excluded pairs are parked, not lost, so they can be restored.
  // Answers rewritten by an admin, and applied suggestions, survive a rescan the same way.
  const next = reselect(applyEdits([...result.selected, ...result.reserve].map(withTitles), edits), new Set(excludedList || []));

  await db.setList('pairs:selected', next.selected);
  await db.setList('pairs:reserve', next.reserve);
  await db.setList('pairs:excluded', next.excluded);
  await db.set('pairs:rejected', result.rejected);
  await db.set('pairs:duplicates', result.duplicates);
  const usedPages = [...new Set(next.selected.map((p) => p.link?.pageId).filter(Boolean))];
  // Baselines only for pages the set relies on. A page that already has one keeps it: the answers were
  // written against that text, and an edit that is still open must not vanish because of a rescan.
  const known = previousVersions || {};
  await saveBaselines(db, articles.filter((a) => usedPages.includes(a.pageId) && !known[a.pageId]));
  await db.set('articles:versions', Object.fromEntries(usedPages.map((id) => [id, known[id] ?? articles.find((a) => a.pageId === id)?.version])));
  for (const r of await listImpacts(db)) if (!usedPages.includes(r.pageId)) await db.del(`impact:${r.pageId}`);
  await db.clearList('cand');
  const summary = { ...result.stats, selected: next.selected.length, excludedByAdmin: next.excluded.length, articles: articles.length, spaceId: cfg.spaceId, scannedAt: new Date().toISOString() };
  await db.set('result:summary', summary);
  await db.set('scan:state', { phase: 'done', total: st?.keys?.length || results.length, done: results.length });
  const dropped = await registerProject(cfg.projectKey, usedPages);
  // Bylines are best effort: the set is already saved, and the next check publishes them again.
  await mapLimit(usedPages, 4, (id) => publishByline(id, cfg.projectKey, { total: next.selected.filter((p) => p.link?.pageId === id).length, outdated: 0 }).catch(() => null));
  await mapLimit(dropped, 4, (id) => publishByline(id, cfg.projectKey, null).catch(() => null));
  return summary;
});

/**
 * Readers need access to the space the pairs were built from, and only see pairs whose request they
 * could open themselves (issue security levels can hide single requests inside a browsable project).
 */
async function readerDb(context) {
  const { db } = await guard(context, 'browse');
  const summary = await db.get('result:summary');
  const cfg = await configOf(db);
  const spaceId = summary?.spaceId || cfg?.spaceId;
  if (spaceId && !(await canSeeSpace(spaceId))) throw new Error('You do not have access to the knowledge base space of this golden set.');
  return db;
}

resolver.define('getPairs', async ({ context }) => {
  const db = await readerDb(context);
  const [selected, reserve, rejected, duplicates, summary, excluded] = await Promise.all([
    db.getList('pairs:selected'),
    db.getList('pairs:reserve'),
    db.get('pairs:rejected'),
    db.get('pairs:duplicates'),
    db.get('result:summary'),
    db.getList('pairs:excluded'),
  ]);
  const all = [...selected, ...reserve, ...excluded, ...(rejected || []), ...(duplicates || [])].map((x) => x.id).concat((duplicates || []).map((d) => d.duplicateOf));
  const visible = await visibleKeys([...new Set(all)]);
  const seen = (x) => visible.has(x.id);
  // Pages inside the space can carry their own restrictions: pairs tied to a page the user cannot read stay hidden.
  const [sel, res, exc] = await Promise.all([selected, reserve, excluded].map((l) => onReadablePages(l.filter(seen))));
  return {
    selected: sel,
    reserve: res,
    excluded: exc,
    rejected: (rejected || []).filter(seen),
    // A duplicate names another request, so both must be visible to the caller.
    duplicates: (duplicates || []).filter((d) => visible.has(d.id) && visible.has(d.duplicateOf)),
    summary,
  };
});

// Marks or restores a pair and recomputes the set at once from the stored scores; no new scan needed.
resolver.define('markNotGolden', async ({ payload, context }) => {
  const { db } = await guard(context, 'admin');
  const excluded = new Set((await db.get('excluded')) || []);
  if (payload.value) excluded.add(payload.id);
  else excluded.delete(payload.id);
  const [selected, reserve, parked] = await Promise.all([db.getList('pairs:selected'), db.getList('pairs:reserve'), db.getList('pairs:excluded')]);
  const pool = [...selected, ...reserve, ...parked];
  const next = reselect(pool, excluded);
  await db.setList('pairs:selected', next.selected);
  await db.setList('pairs:reserve', next.reserve);
  await db.setList('pairs:excluded', next.excluded);
  await db.set('excluded', [...excluded]);
  const summary = await db.get('result:summary');
  if (summary) await db.set('result:summary', { ...summary, selected: next.selected.length, excludedByAdmin: next.excluded.length });
  return { selected: next.selected.length, excluded: next.excluded.length };
});

// An admin rewrites an expected answer, for example one marked "needs a person" after an article edit.
resolver.define('editExpected', async ({ payload, context }) => {
  const { db } = await guard(context, 'admin');
  const id = String(payload?.id || '');
  const lists = await Promise.all(PAIR_LISTS.map((k) => db.getList(k)));
  const pair = lists.flat().find((p) => p.id === id);
  // Same answer for a missing pair and for a request hidden from this admin by issue security.
  if (!pair || !(await visibleKeys([id])).has(id)) throw new Error('This pair is not in the golden set any more.');
  const edits = { ...((await db.get('edits')) || {}) };
  let change;
  let text;
  if (payload?.undo) {
    // Back to the answer from the resolved request.
    delete edits[id];
    change = undoEdit;
    text = pair.edited?.from ?? pair.expected;
  } else {
    const clean = cleanExpected(payload?.expected);
    if (!clean.ok) throw new Error(clean.error);
    const edit = { expected: clean.text, at: new Date().toISOString() };
    edits[id] = edit;
    change = (p) => applyEdits([p], { [id]: edit })[0];
    text = clean.text;
  }
  await db.set('edits', edits);
  await Promise.all(PAIR_LISTS.map((k, i) => (lists[i].some((p) => p.id === id) ? db.setList(k, lists[i].map((p) => (p.id === id ? change(p) : p))) : null)));
  // An open article edit shows this answer too: show the new text at once and drop its suggestion,
  // so "Apply suggested answers" never overwrites what the admin wrote. The next check recomputes it.
  for (const record of await listImpacts(db)) {
    const pageId = record.pageId;
    if (!record.affected.some((a) => a.id === id)) continue;
    record.affected = record.affected.map((a) => (a.id === id ? { ...a, expected: text, suggestion: null, needsReview: null, editedByAdmin: !payload?.undo } : a));
    await db.set(`impact:${pageId}`, record);
  }
  return { id, expected: text };
});

resolver.define('getImpacts', async ({ context }) => {
  const db = await readerDb(context);
  // Pages inside the space can carry their own restrictions: show only impacts on pages the caller can read.
  const impacts = await readableImpacts(await listImpacts(db));
  const ids = [...new Set(impacts.flatMap((r) => r.affected.map((a) => a.id)))];
  const visible = await visibleKeys(ids);
  return impacts.map((r) => {
    const affected = r.affected.filter((a) => visible.has(a.id));
    return { ...r, affected, counts: { affected: affected.length, outdated: affected.filter((a) => a.status === 'likely_outdated').length } };
  });
});

resolver.define('checkNow', async ({ payload, context }) => {
  const { projectKey } = await guard(context, 'admin');
  const res = await checkPage(projectKey, payload.pageId);
  console.log(`checkNow ${projectKey} page ${payload.pageId}: ${res.reason}`);
  // The UI reloads impacts through getImpacts, which applies the per-user filters.
  return { reason: res.reason };
});

// Demo shortcut for judges: makes (or undoes) the 30 -> 14 days edit in the demo Returns policy article,
// as the clicking user, then checks the page at once. Only for the article the demo data created.
const DEMO_FROM = 'within 30 days of delivery';
const DEMO_TO = 'within 14 days of delivery';
resolver.define('demoEdit', async ({ payload, context }) => {
  const { projectKey, db } = await guard(context, 'admin');
  const st = await seedState(db);
  const pageId = st?.pages?.['100001'];
  if (!pageId) return { reason: 'no_demo' };
  const page = await call('user', 'confluence', route`/wiki/api/v2/pages/${pageId}?body-format=storage`);
  const body = page?.body?.storage?.value || '';
  const [from, to] = payload?.undo ? [DEMO_TO, DEMO_FROM] : [DEMO_FROM, DEMO_TO];
  if (!body.includes(from)) return { reason: body.includes(to) ? 'already' : 'changed_by_hand', pageId };
  await call('user', 'confluence', route`/wiki/api/v2/pages/${pageId}`, {
    method: 'PUT',
    body: {
      id: String(pageId),
      status: 'current',
      title: page.title,
      body: { representation: 'storage', value: body.split(from).join(to) },
      version: { number: (page.version?.number || 1) + 1, message: payload?.undo ? 'Golden Set demo: back to 30 days' : 'Golden Set demo: 30 -> 14 days' },
    },
  });
  const res = await checkPage(projectKey, pageId);
  console.log(`demoEdit ${projectKey} page ${pageId} undo=${Boolean(payload?.undo)}: ${res.reason}`);
  return { reason: res.reason, pageId };
});

// Opening the page checks for article edits at once, so nobody waits for the five-minute schedule.
resolver.define('refreshImpacts', async ({ context }) => {
  const { projectKey } = await guard(context, 'admin');
  const results = await checkProject(projectKey);
  return results.map((r) => ({ pageId: r.pageId, reason: r.reason }));
});

resolver.define('acceptEdit', async ({ payload, context }) => {
  const { projectKey } = await guard(context, 'admin');
  return acceptEdit(projectKey, payload.pageId, { applySuggestions: Boolean(payload.applySuggestions) });
});

/**
 * Confluence byline dialog. Runs in the Confluence installation, which cannot read the Jira
 * installation's storage, so it shows the counts the Jira side published on the page.
 */
resolver.define('getPageView', async ({ context }) => {
  const pageId = String(context?.extension?.content?.id || '');
  const value = await readByline(pageId);
  // Anyone who can edit the page can edit this property: show only well-formed project keys and counts.
  const count = (n) => (Number.isInteger(n) && n >= 0 && n < 100000 ? n : 0);
  const projects = Object.entries(value?.projects || {})
    .filter(([key]) => /^[A-Z][A-Z0-9_]{0,19}$/.test(key))
    .map(([projectKey, c]) => ({ projectKey, total: count(c?.total), outdated: Math.min(count(c?.outdated), count(c?.total)) }));
  return { pageId, projects };
});

resolver.define('exportCsv', async ({ payload, context }) => {
  const db = await readerDb(context);
  const all = await db.getList('pairs:selected');
  const visible = await visibleKeys(all.map((p) => p.id));
  const selected = await onReadablePages(all.filter((p) => visible.has(p.id)));
  const ids = payload?.ids ? new Set(payload.ids) : null;
  const rows = ids ? selected.filter((p) => ids.has(p.id)) : selected;
  return toCsvChunks(rows);
});

export const handler = resolver.getDefinitions();

