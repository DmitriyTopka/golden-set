import { findPageRefs, stripLinks } from '../core/links.js';

describe('findPageRefs', () => {
  test('modern page path', () => {
    const r = findPageRefs('See https://x.atlassian.net/wiki/spaces/HELP/pages/100001/Returns+policy for details');
    expect(r.pageIds).toEqual(['100001']);
  });

  test('legacy viewpage and storage-format title links', () => {
    const r = findPageRefs('old: /wiki/pages/viewpage.action?pageId=42 and <ri:page ri:content-title="Warranty" />');
    expect(r.pageIds).toEqual(['42']);
    expect(r.titles).toEqual(['Warranty']);
  });

  test('no links', () => {
    expect(findPageRefs('plain text')).toEqual({ pageIds: [], titles: [] });
    expect(findPageRefs(undefined)).toEqual({ pageIds: [], titles: [] });
  });
});

describe('stripLinks', () => {
  test('removes urls and tidies punctuation', () => {
    expect(stripLinks('More details: https://a.b/c .')).toBe('More details:.');
    expect(stripLinks('')).toBe('');
    expect(stripLinks('More details: undefined/wiki/spaces/NHC/pages/3371713.')).toBe('More details:');
    expect(stripLinks('see /wiki/spaces/HELP/pages/1 now')).toBe('see now');
  });
});
