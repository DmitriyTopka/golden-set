// Resolver for the Golden Set queue page. Long jobs (scan, demo data) run in small steps that the UI
// repeats, so every call stays under the 25 s UI-function limit.
//
// Access model: everything is scoped to the JSM project the page is opened in. Reading the golden set
// needs "Browse projects" there and access to the configured Confluence space; changing it (settings,
// scan, demo data, "not golden" marks) needs "Administer projects". Permissions are checked as the
// calling user, while bulk reads run as the app.
import { Resolver, route } from './forge.js';
import { call } from './http.js';
import { forProject } from './store.js';
import { listServiceDesks, statusCategories, closedRequestKeys, readRequests } from './jsm.js';
import { readArticles } from './confluence.js';
import { seedNext, seedState, resetSeed } from './seed.js';
import { registerProject, publishByline, readByline, saveBaselines, checkPage, checkProject, listImpacts, acceptEdit } from './impact.js';
import { selectGoldenSet, reselect, toCsvChunks } from '../core/index.js';

const resolver = new Resolver();
const SCAN_BATCH = 10;

function projectKeyOf(context) {
  const key = context?.extension?.project?.key;
  if (!key) throw new Error('Open Golden Set from a service project.');
  return key;
}

async function permissions(projectKey) {
  const res = await call('user', 'jira', route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=BROWSE_PROJECTS,ADMINISTER_PROJECTS`);
  return {
    browse: Boolean(res?.permissions?.BROWSE_PROJECTS?.havePermission),
    admin: Boolean(res?.permissions?.ADMINISTER_PROJECTS?.havePermission),
  };
}

async function canSeeSpace(spaceId) {
  const res = await call('user', 'confluence', route`/wiki/api/v2/spaces/${spaceId}`, { allow404: true }).catch(() => null);
  return Boolean(res?.id);
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
const PAIR_KEYS = ['pairs:rejected', 'pairs:duplicates', 'result:summary', 'articles:versions', 'excluded'];
async function clearResults(db, projectKey) {
  const versions = (await db.get('articles:versions')) || {};
  await clearImpacts(db);
  await Promise.all(Object.keys(versions).map((id) => db.del(`snap:${id}`)));
  const dropped = await registerProject(projectKey, []);
  for (const id of dropped) await publishByline(id, projectKey, null).catch(() => null);
  await Promise.all([...PAIR_LISTS.map((k) => db.clearList(k)), ...PAIR_KEYS.map((k) => db.del(k))]);
}

async function clearImpacts(db) {
  const ids = (await db.get('impacts')) || [];
  await Promise.all(ids.map((id) => db.del(`impact:${id}`)));
  await db.del('impacts');
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
    summary: summary || null,
  };
});

resolver.define('listSources', async ({ context }) => {
  await guard(context, 'admin');
  // Spaces are listed as the user, so an admin only picks from spaces they can read.
  const res = await call('user', 'confluence', route`/wiki/api/v2/spaces?limit=100&type=global`);
  return { spaces: (res?.results || []).map((s) => ({ id: String(s.id), key: s.key, name: s.name })) };
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
  await db.clearList('raw');
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
  const requests = await readRequests(batch, categories);
  await db.appendChunk('raw', Math.floor(st.done / SCAN_BATCH), requests);
  st.done += batch.length;
  if (st.done >= st.keys.length) st.phase = 'selecting';
  await db.set('scan:state', st);
  return { phase: st.phase, total: st.keys.length, done: st.done };
});

resolver.define('scanFinish', async ({ context }) => {
  const { db } = await guard(context, 'admin');
  const cfg = await configOf(db);
  const st = await db.get('scan:state');
  const [requests, articles, excludedList] = await Promise.all([db.getList('raw'), readArticles(cfg.spaceId), db.get('excluded')]);
  const result = selectGoldenSet(requests, articles);
  const titles = Object.fromEntries(articles.map((a) => [a.pageId, a.title]));
  const withTitles = (p) => ({ ...p, articleTitle: p.link ? titles[p.link.pageId] : null });
  // "Not golden" marks survive a rescan: excluded pairs are parked, not lost, so they can be restored.
  const next = reselect([...result.selected, ...result.reserve].map(withTitles), new Set(excludedList || []));

  await db.setList('pairs:selected', next.selected);
  await db.setList('pairs:reserve', next.reserve);
  await db.setList('pairs:excluded', next.excluded);
  await db.set('pairs:rejected', result.rejected);
  await db.set('pairs:duplicates', result.duplicates);
  await db.set('articles:versions', Object.fromEntries(articles.map((a) => [a.pageId, a.version])));
  // Fresh pairs were written against today's articles: they become the baseline for edit checks.
  await clearImpacts(db);
  await saveBaselines(db, articles);
  const usedPages = [...new Set(next.selected.map((p) => p.link?.pageId).filter(Boolean))];
  const dropped = await registerProject(cfg.projectKey, usedPages);
  for (const id of usedPages) await publishByline(id, cfg.projectKey, { total: next.selected.filter((p) => p.link?.pageId === id).length, outdated: 0 });
  for (const id of dropped) await publishByline(id, cfg.projectKey, null).catch(() => null);
  // Raw requests carry unredacted customer text; keep only the redacted pairs once selection is done.
  await db.clearList('raw');
  const summary = { ...result.stats, selected: next.selected.length, excludedByAdmin: next.excluded.length, articles: articles.length, spaceId: cfg.spaceId, scannedAt: new Date().toISOString() };
  await db.set('result:summary', summary);
  await db.set('scan:state', { phase: 'done', total: st?.keys?.length || requests.length, done: requests.length });
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

/** Keys of the given requests that the calling user can open. */
async function visibleKeys(keys) {
  const visible = new Set();
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const res = await call('user', 'jira', route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: { jql: `key in (${chunk.join(',')})`, fields: ['summary'], maxResults: 100 },
    });
    for (const issue of res?.issues || []) visible.add(issue.key);
  }
  return visible;
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
  return {
    selected: selected.filter(seen),
    reserve: reserve.filter(seen),
    excluded: excluded.filter(seen),
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

resolver.define('getImpacts', async ({ context }) => {
  const db = await readerDb(context);
  const impacts = await listImpacts(db);
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
  return res;
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
  return { pageId, projects: Object.entries(value?.projects || {}).map(([projectKey, c]) => ({ projectKey, ...c })) };
});

resolver.define('exportCsv', async ({ payload, context }) => {
  const db = await readerDb(context);
  const all = await db.getList('pairs:selected');
  const visible = await visibleKeys(all.map((p) => p.id));
  const selected = all.filter((p) => visible.has(p.id));
  const ids = payload?.ids ? new Set(payload.ids) : null;
  const rows = ids ? selected.filter((p) => ids.has(p.id)) : selected;
  return toCsvChunks(rows);
});

export const handler = resolver.getDefinitions();

