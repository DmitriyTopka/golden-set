// Reads closed JSM requests and maps them to the core request shape (see core/pairs.js).
import { route } from './forge.js';
import { call, mapLimit } from './http.js';

export async function listServiceDesks() {
  const res = await call('app', 'jira', route`/rest/servicedeskapi/servicedesk?limit=50`);
  return (res?.values || []).map((d) => ({ id: String(d.id), projectKey: d.projectKey, name: d.projectName }));
}

/** Status id -> category key ('new' | 'indeterminate' | 'done'), needed to read the changelog. */
export async function statusCategories() {
  const statuses = await call('app', 'jira', route`/rest/api/3/status`);
  const map = new Map();
  for (const s of statuses || []) map.set(String(s.id), s.statusCategory?.key || 'indeterminate');
  return map;
}

/** Keys of resolved requests in a project, newest first. */
export async function closedRequestKeys(projectKey, max = 500) {
  const keys = [];
  let nextPageToken;
  const jql = `project = "${projectKey}" AND statusCategory = Done ORDER BY resolutiondate DESC`;
  do {
    const res = await call('app', 'jira', route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: { jql, fields: ['summary'], maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) },
    });
    for (const i of res?.issues || []) keys.push(i.key);
    nextPageToken = res?.nextPageToken;
  } while (nextPageToken && keys.length < max);
  return keys.slice(0, max);
}

async function allComments(key) {
  const out = [];
  for (let start = 0; ; start += 100) {
    const res = await call('app', 'jira', route`/rest/servicedeskapi/request/${key}/comment?public=true&internal=false&start=${start}&limit=100`);
    out.push(...(res?.values || []));
    if (!res || res.isLastPage !== false) break;
  }
  return out;
}

async function statusHistory(key, categories) {
  const out = [];
  for (let startAt = 0; ; startAt += 100) {
    const res = await call('app', 'jira', route`/rest/api/3/issue/${key}/changelog?startAt=${startAt}&maxResults=100`);
    for (const h of res?.values || []) {
      for (const item of h.items || []) {
        if (item.field !== 'status') continue;
        out.push({
          fromCategory: categories.get(String(item.from)) || 'indeterminate',
          toCategory: categories.get(String(item.to)) || 'indeterminate',
          at: h.created,
        });
      }
    }
    if (!res || res.isLast !== false) break;
  }
  return out;
}

const fieldText = (request, id) => {
  const f = (request.requestFieldValues || []).find((v) => v.fieldId === id);
  if (!f) return '';
  return typeof f.value === 'string' ? f.value : f.renderedValue?.html || '';
};

/** One closed request in the core shape. */
export async function readRequest(key, categories) {
  const [request, comments, history, feedback, issue] = await Promise.all([
    call('app', 'jira', route`/rest/servicedeskapi/request/${key}`),
    allComments(key),
    statusHistory(key, categories),
    call('app', 'jira', route`/rest/servicedeskapi/request/${key}/feedback`, { allow404: true }).catch(() => null),
    call('app', 'jira', route`/rest/api/3/issue/${key}?fields=resolutiondate`),
  ]);
  return {
    key,
    reporter: { id: request.reporter?.accountId, name: request.reporter?.displayName },
    summary: fieldText(request, 'summary'),
    description: fieldText(request, 'description'),
    statusHistory: history,
    resolvedAt: issue?.fields?.resolutiondate || null,
    csat: feedback?.rating ?? null,
    comments: comments.map((c) => ({
      id: String(c.id),
      author: { id: c.author?.accountId, name: c.author?.displayName },
      public: c.public !== false,
      body: c.body || '',
      created: c.created?.iso8601 || c.created,
    })),
  };
}

export async function readRequests(keys, categories) {
  return mapLimit(keys, 8, (k) => readRequest(k, categories));
}
