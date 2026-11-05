// App storage in Forge KVS. Large lists are split into chunks to stay well below the value size limit.
import { kvs, WhereConditions } from './forge.js';

const CHUNK = 40;

/** Per-project key: page id -> article version the scheduled check last processed in full. */
export const CHECKED = 'checked';
const INPUTS = ['pairs', 'snap', 'config', 'edits', 'excluded'];

export const get = (key) => kvs.get(key);
export const set = (key, value) => kvs.set(key, value);
export const del = (key) => kvs.delete(key);

export async function setList(prefix, items) {
  const oldCount = (await kvs.get(`${prefix}:count`)) || 0;
  const chunks = Math.ceil(items.length / CHUNK);
  for (let i = 0; i < chunks; i += 1) await kvs.set(`${prefix}:${i}`, items.slice(i * CHUNK, (i + 1) * CHUNK));
  for (let i = chunks; i < oldCount; i += 1) await kvs.delete(`${prefix}:${i}`);
  await kvs.set(`${prefix}:count`, chunks);
}

export async function getList(prefix) {
  const count = (await kvs.get(`${prefix}:count`)) || 0;
  const parts = await Promise.all(Array.from({ length: count }, (_, i) => kvs.get(`${prefix}:${i}`)));
  return parts.flat().filter(Boolean);
}

export async function appendChunk(prefix, index, items) {
  await kvs.set(`${prefix}:${index}`, items);
  const count = (await kvs.get(`${prefix}:count`)) || 0;
  if (index + 1 > count) await kvs.set(`${prefix}:count`, index + 1);
}

export async function clearList(prefix) {
  const count = (await kvs.get(`${prefix}:count`)) || 0;
  for (let i = 0; i < count; i += 1) await kvs.delete(`${prefix}:${i}`);
  await kvs.delete(`${prefix}:count`);
}

/** Every value whose key starts with the prefix. No shared index key, so parallel writers cannot lose entries. */
export async function valuesByPrefix(prefix) {
  const out = [];
  let cursor;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany();
    out.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

/**
 * Storage view for one JSM project: every key is prefixed with the project key, so each service
 * project keeps its own golden set and settings.
 */
export function forProject(projectKey) {
  const p = (k) => `p:${projectKey}:${k}`;
  // The scheduled check skips pages it already processed at their current version. Anything that can
  // change its result (pairs, baselines, settings, rewritten answers) drops that memory first.
  const touch = async (k) => {
    if (k !== CHECKED && INPUTS.some((x) => k === x || k.startsWith(`${x}:`))) await del(p(CHECKED));
  };
  return {
    get: (k) => get(p(k)),
    set: async (k, v) => { await touch(k); return set(p(k), v); },
    del: async (k) => { await touch(k); return del(p(k)); },
    setList: async (k, items) => { await touch(k); return setList(p(k), items); },
    getList: (k) => getList(p(k)),
    appendChunk: async (k, i, items) => { await touch(k); return appendChunk(p(k), i, items); },
    clearList: async (k) => { await touch(k); return clearList(p(k)); },
    valuesByPrefix: (k) => valuesByPrefix(p(k)),
  };
}
