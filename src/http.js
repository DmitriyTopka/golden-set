// Thin wrapper over Forge product fetch: JSON in, JSON out, readable errors, small retry on 429/5xx.
import { api } from './forge.js';

const RETRY = new Set([429, 500, 502, 503, 504]);

function client(as, product) {
  const base = as === 'user' ? api.asUser() : api.asApp();
  return product === 'confluence' ? base.requestConfluence : base.requestJira;
}

/**
 * @param {'app'|'user'} as
 * @param {'jira'|'confluence'} product
 * @param {import('@forge/api').Route} url
 * @param {{ method?: string, body?: object, allow404?: boolean, headers?: object }} [opts]
 */
export async function call(as, product, url, opts = {}) {
  const request = client(as, product);
  const init = {
    method: opts.method || 'GET',
    headers: { Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  };
  for (let attempt = 0; ; attempt += 1) {
    const res = await request(url, init);
    if (res.ok) return res.status === 204 ? null : res.json().catch(() => null);
    if (res.status === 404 && opts.allow404) return null;
    if (RETRY.has(res.status) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    const text = await res.text().catch(() => '');
    // The usual first-run failure: the app was installed in Jira only.
    if (as === 'app' && product === 'confluence' && (res.status === 401 || res.status === 403)) {
      throw new Error(`Golden Set cannot read Confluence (${res.status}). Install the app in Confluence on this site as well; the same install link covers Jira and Confluence.`);
    }
    throw new Error(`${init.method} ${product} ${res.status}: ${text.slice(0, 300)}`);
  }
}

/** Runs async work over items with limited parallelism, keeping input order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
