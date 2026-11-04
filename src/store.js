// App storage in Forge KVS. Large lists are split into chunks to stay well below the value size limit.
import { kvs } from './forge.js';

const CHUNK = 40;

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

/**
 * Storage view for one JSM project: every key is prefixed with the project key, so each service
 * project keeps its own golden set and settings.
 */
export function forProject(projectKey) {
  const p = (k) => `p:${projectKey}:${k}`;
  return {
    get: (k) => get(p(k)),
    set: (k, v) => set(p(k), v),
    del: (k) => del(p(k)),
    setList: (k, items) => setList(p(k), items),
    getList: (k) => getList(p(k)),
    appendChunk: (k, i, items) => appendChunk(p(k), i, items),
    clearList: (k) => clearList(p(k)),
  };
}
