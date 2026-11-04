// Per-user access checks, shared by the Golden Set page (resolvers) and the Rovo agent actions.
// Everything runs as the asking user, so the app never shows more than that user could open in Jira
// and Confluence themselves.
import { route } from './forge.js';
import { call } from './http.js';
import { forProject } from './store.js';

export async function permissions(projectKey) {
  const res = await call('user', 'jira', route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=BROWSE_PROJECTS,ADMINISTER_PROJECTS`).catch(() => null);
  return {
    browse: Boolean(res?.permissions?.BROWSE_PROJECTS?.havePermission),
    admin: Boolean(res?.permissions?.ADMINISTER_PROJECTS?.havePermission),
  };
}

export async function canSeeSpace(spaceId) {
  const res = await call('user', 'confluence', route`/wiki/api/v2/spaces/${spaceId}`, { allow404: true }).catch(() => null);
  return Boolean(res?.id);
}

/** Pages inside a space can carry their own restrictions. */
export async function canReadPage(pageId) {
  const res = await call('user', 'confluence', route`/wiki/api/v2/pages/${pageId}`, { allow404: true }).catch(() => null);
  return Boolean(res?.id);
}

/** Keeps only the impact records on pages the user can read. */
export async function readableImpacts(impacts) {
  const ok = await Promise.all(impacts.map((r) => canReadPage(r.pageId)));
  return impacts.filter((_, i) => ok[i]);
}

/** Keys of the given requests that the calling user can open (issue security can hide single requests). */
export async function visibleKeys(keys) {
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

/**
 * Reader gate for one project: browse permission in Jira and access to the knowledge base space the
 * pairs were built from. Returns the project storage, or null when the user may not read it.
 */
export async function readerAccess(projectKey) {
  const perms = await permissions(projectKey);
  if (!perms.browse) return null;
  const db = forProject(projectKey);
  const [summary, cfg] = await Promise.all([db.get('result:summary'), db.get('config')]);
  const spaceId = summary?.spaceId || cfg?.spaceId;
  if (spaceId && !(await canSeeSpace(spaceId))) return null;
  return { db, perms };
}

/** Pairs whose help article the user can read. Pairs without an article stay. */
export async function onReadablePages(pairs) {
  const pages = [...new Set(pairs.map((p) => p.link?.pageId).filter(Boolean))];
  const ok = new Set();
  for (const id of pages) if (await canReadPage(id)) ok.add(id);
  return pairs.filter((p) => !p.link?.pageId || ok.has(p.link.pageId));
}
