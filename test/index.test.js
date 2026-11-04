import * as core from '../core/index.js';

test('public surface exports every module the Forge app will use', () => {
  for (const name of ['redactPII', 'normalizeAnswer', 'extractFacts', 'findPageRefs', 'buildCandidate', 'linkPair', 'selectGoldenSet', 'diffArticle', 'computeImpact', 'toCsvChunks', 'validateCsv']) {
    expect(typeof core[name]).toBe('function');
  }
  expect(core.DEFAULT_LIMIT).toBe(50);
  expect(core.CHUNK_SIZE).toBe(100);
});
