// Finds Confluence pages referenced in an agent reply.
// Handles the URL shapes Confluence Cloud produces:
//   https://site.atlassian.net/wiki/spaces/HELP/pages/123456/Returns+policy
//   https://site.atlassian.net/wiki/pages/viewpage.action?pageId=123456
//   <ac:link><ri:page ri:content-title="Returns policy" /></ac:link>  (by title)

const PAGE_PATH = /\/wiki\/spaces\/[^/\s]+\/pages\/(\d+)/g;
const PAGE_QUERY = /[?&]pageId=(\d+)/g;
const PAGE_TITLE = /ri:content-title="([^"]+)"/g;

/**
 * @param {string} text
 * @returns {{ pageIds: string[], titles: string[] }}
 */
export function findPageRefs(text) {
  const t = String(text || '');
  const ids = new Set();
  for (const m of t.matchAll(PAGE_PATH)) ids.add(m[1]);
  for (const m of t.matchAll(PAGE_QUERY)) ids.add(m[1]);
  const titles = new Set();
  for (const m of t.matchAll(PAGE_TITLE)) titles.add(m[1]);
  return { pageIds: [...ids], titles: [...titles] };
}

export function stripLinks(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, '')
    // Relative or broken page links such as "/wiki/spaces/HELP/pages/123" or "undefined/wiki/...".
    .replace(/\S*\/wiki\/\S+/g, '')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
