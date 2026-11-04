// Reads help articles from one Confluence space (Confluence REST v2).
import { route } from './forge.js';
import { call } from './http.js';

export async function listSpaces() {
  const res = await call('app', 'confluence', route`/wiki/api/v2/spaces?limit=100&type=global`);
  return (res?.results || []).map((s) => ({ id: String(s.id), key: s.key, name: s.name }));
}

export async function spaceByKey(key) {
  const res = await call('app', 'confluence', route`/wiki/api/v2/spaces?keys=${key}`);
  const s = res?.results?.[0];
  return s ? { id: String(s.id), key: s.key, name: s.name } : null;
}

/** All current pages of a space with storage-format bodies. */
export async function readArticles(spaceId, max = 200) {
  const out = [];
  let cursor;
  do {
    const url = cursor
      ? route`/wiki/api/v2/spaces/${spaceId}/pages?body-format=storage&status=current&limit=50&cursor=${cursor}`
      : route`/wiki/api/v2/spaces/${spaceId}/pages?body-format=storage&status=current&limit=50`;
    const res = await call('app', 'confluence', url);
    for (const p of res?.results || []) {
      out.push({ pageId: String(p.id), title: p.title, version: p.version?.number || 1, body: p.body?.storage?.value || '' });
    }
    const next = res?._links?.next;
    cursor = next ? new URL(next, 'https://x').searchParams.get('cursor') : null;
  } while (cursor && out.length < max);
  return out;
}
