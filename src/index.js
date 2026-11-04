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
import { selectGoldenSet, toCsvChunks } from '../core/index.js';

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

resolver.define('getOverview', async ({ context }) => {
  const { projectKey, perms, db } = await guard(context, 'browse');
  const [cfg, seed, scan, summary] = await Promise.all([configOf(db), seedState(db), db.get('scan:state'), db.get('result:summary')]);
  return { projectKey, isAdmin: perms.admin, config: cfg, seed, scan: scan || { phase: 'idle' }, summary: summary || null };
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
  const result = selectGoldenSet(requests, articles, { excluded: new Set(excludedList || []) });
  const titles = Object.fromEntries(articles.map((a) => [a.pageId, a.title]));
  const withTitles = (p) => ({ ...p, articleTitle: p.link ? titles[p.link.pageId] : null });

  await db.setList('pairs:selected', result.selected.map(withTitles));
  await db.setList('pairs:reserve', result.reserve.map(withTitles));
  await db.set('pairs:rejected', result.rejected);
  await db.set('pairs:duplicates', result.duplicates);
  await db.set('articles:versions', Object.fromEntries(articles.map((a) => [a.pageId, a.version])));
  // Raw requests carry unredacted customer text; keep only the redacted pairs once selection is done.
  await db.clearList('raw');
  const summary = { ...result.stats, articles: articles.length, scannedAt: new Date().toISOString() };
  await db.set('result:summary', summary);
  await db.set('scan:state', { phase: 'done', total: st?.keys?.length || requests.length, done: requests.length });
  return summary;
});

/** Readers also need access to the knowledge base space, because pairs quote its articles. */
async function readerDb(context) {
  const { db } = await guard(context, 'browse');
  const cfg = await configOf(db);
  if (cfg && !(await canSeeSpace(cfg.spaceId))) throw new Error(`You do not have access to the ${cfg.spaceName} space.`);
  return db;
}

resolver.define('getPairs', async ({ context }) => {
  const db = await readerDb(context);
  const [selected, reserve, rejected, duplicates, summary] = await Promise.all([
    db.getList('pairs:selected'),
    db.getList('pairs:reserve'),
    db.get('pairs:rejected'),
    db.get('pairs:duplicates'),
    db.get('result:summary'),
  ]);
  return { selected, reserve, rejected: rejected || [], duplicates: duplicates || [], summary };
});

resolver.define('markNotGolden', async ({ payload, context }) => {
  const { db } = await guard(context, 'admin');
  const excluded = new Set((await db.get('excluded')) || []);
  if (payload.value) excluded.add(payload.id);
  else excluded.delete(payload.id);
  await db.set('excluded', [...excluded]);
  return [...excluded];
});

resolver.define('exportCsv', async ({ payload, context }) => {
  const db = await readerDb(context);
  const selected = await db.getList('pairs:selected');
  const ids = payload?.ids ? new Set(payload.ids) : null;
  const rows = ids ? selected.filter((p) => ids.has(p.id)) : selected;
  return toCsvChunks(rows);
});

export const handler = resolver.getDefinitions();
