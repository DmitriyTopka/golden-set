// Resolver for the Golden Set queue page. Long jobs (scan, demo data) run in small steps that the UI
// repeats, so every call stays under the 25 s UI-function limit.
import { Resolver, route } from './forge.js';
import { call } from './http.js';
import * as store from './store.js';
import { listServiceDesks, statusCategories, closedRequestKeys, readRequests } from './jsm.js';
import { listSpaces, spaceByKey, readArticles } from './confluence.js';
import { seedNext, seedState, resetSeed } from './seed.js';
import { selectGoldenSet, toCsvChunks } from '../core/index.js';

const resolver = new Resolver();
const SCAN_BATCH = 10;

const config = async () => (await store.get('config')) || null;

resolver.define('getOverview', async () => {
  const [cfg, seed, scan, summary] = await Promise.all([config(), seedState(), store.get('scan:state'), store.get('result:summary')]);
  return { config: cfg, seed, scan: scan || { phase: 'idle' }, summary: summary || null };
});

resolver.define('listSources', async () => {
  const [desks, spaces] = await Promise.all([listServiceDesks(), listSpaces()]);
  return { desks, spaces };
});

resolver.define('saveConfig', async ({ payload }) => {
  const desks = await listServiceDesks();
  const desk = desks.find((d) => d.id === String(payload.serviceDeskId));
  if (!desk) throw new Error('Service project not found');
  const space = await spaceByKey(payload.spaceKey);
  if (!space) throw new Error('Confluence space not found');
  const cfg = { serviceDeskId: desk.id, projectKey: desk.projectKey, projectName: desk.name, spaceId: space.id, spaceKey: space.key, spaceName: space.name };
  await store.set('config', cfg);
  return cfg;
});

resolver.define('seedNext', async ({ context }) => {
  const cfg = await config();
  if (!cfg) throw new Error('Choose a service project and a Confluence space first');
  const me = await call('user', 'jira', route`/rest/api/3/myself`);
  return seedNext(cfg, { siteUrl: context.siteUrl, agentName: me?.displayName || 'Support' });
});

resolver.define('seedReset', async () => {
  await resetSeed();
  return seedState();
});

resolver.define('scanStart', async () => {
  const cfg = await config();
  if (!cfg) throw new Error('Choose a service project and a Confluence space first');
  const keys = await closedRequestKeys(cfg.projectKey);
  await store.clearList('raw');
  const st = { phase: 'reading', keys, done: 0, startedAt: new Date().toISOString() };
  await store.set('scan:state', st);
  return { phase: st.phase, total: keys.length, done: 0 };
});

resolver.define('scanBatch', async () => {
  const st = await store.get('scan:state');
  if (!st || st.phase !== 'reading') return st;
  const categories = await statusCategories();
  const batch = st.keys.slice(st.done, st.done + SCAN_BATCH);
  const requests = await readRequests(batch, categories);
  await store.appendChunk('raw', Math.floor(st.done / SCAN_BATCH), requests);
  st.done += batch.length;
  if (st.done >= st.keys.length) st.phase = 'selecting';
  await store.set('scan:state', st);
  return { phase: st.phase, total: st.keys.length, done: st.done };
});

resolver.define('scanFinish', async () => {
  const cfg = await config();
  const st = await store.get('scan:state');
  const [requests, articles, excludedList] = await Promise.all([store.getList('raw'), readArticles(cfg.spaceId), store.get('excluded')]);
  const result = selectGoldenSet(requests, articles, { excluded: new Set(excludedList || []) });
  const titles = Object.fromEntries(articles.map((a) => [a.pageId, a.title]));
  const withTitles = (p) => ({ ...p, articleTitle: p.link ? titles[p.link.pageId] : null });

  await store.setList('pairs:selected', result.selected.map(withTitles));
  await store.setList('pairs:reserve', result.reserve.map(withTitles));
  await store.set('pairs:rejected', result.rejected);
  await store.set('pairs:duplicates', result.duplicates);
  await store.set('articles:versions', Object.fromEntries(articles.map((a) => [a.pageId, a.version])));
  const summary = { ...result.stats, articles: articles.length, scannedAt: new Date().toISOString() };
  await store.set('result:summary', summary);
  await store.set('scan:state', { phase: 'done', total: st?.keys?.length || requests.length, done: requests.length });
  return summary;
});

resolver.define('getPairs', async () => {
  const [selected, reserve, rejected, duplicates, summary] = await Promise.all([
    store.getList('pairs:selected'),
    store.getList('pairs:reserve'),
    store.get('pairs:rejected'),
    store.get('pairs:duplicates'),
    store.get('result:summary'),
  ]);
  return { selected, reserve, rejected: rejected || [], duplicates: duplicates || [], summary };
});

resolver.define('markNotGolden', async ({ payload }) => {
  const excluded = new Set((await store.get('excluded')) || []);
  if (payload.value) excluded.add(payload.id);
  else excluded.delete(payload.id);
  await store.set('excluded', [...excluded]);
  return [...excluded];
});

resolver.define('exportCsv', async ({ payload }) => {
  const selected = await store.getList('pairs:selected');
  const ids = payload?.ids ? new Set(payload.ids) : null;
  const rows = ids ? selected.filter((p) => ids.has(p.id)) : selected;
  return toCsvChunks(rows);
});

export const handler = resolver.getDefinitions();
