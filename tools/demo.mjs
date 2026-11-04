// Runs the whole core on the Northwind seed and prints what the app screens will show.
// Writes the golden set CSV and the re-test CSV for the demo edit into ./out/.
//
// Usage: node tools/demo.mjs

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { selectGoldenSet, pairsByPage, diffArticle, computeImpact, toCsvChunks } from '../core/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(readFileSync(join(root, 'seed/northwind.json'), 'utf8'));

const result = selectGoldenSet(seed.requests, seed.articles);
console.log('Selection:', JSON.stringify(result.stats));

const page = seed.articles.find((a) => a.pageId === seed.demoEdit.pageId);
const ids = new Set(pairsByPage(result.selected).get(page.pageId) || []);
const pairs = result.selected.filter((p) => ids.has(p.id));
const diff = diffArticle(page.body, seed.demoEdit.body);
const impact = computeImpact(pairs, diff);

console.log(`\nEdit of "${page.title}": ${diff.outdatedFacts.map((f) => `${f.raw} -> ${f.replacedBy}`).join(', ')}`);
console.log(`${impact.counts.affected} golden answers depend on this page, ${impact.counts.outdated} likely outdated`);
for (const a of impact.affected) console.log(`  ${a.id}  ${a.status.padEnd(16)} ${a.reasons.join('; ')}`);

const out = join(root, 'out');
mkdirSync(out, { recursive: true });
toCsvChunks(result.selected).forEach((csv, i) => writeFileSync(join(out, `golden-set-${i + 1}.csv`), csv));
const retest = result.selected.filter((p) => impact.affected.some((a) => a.id === p.id));
writeFileSync(join(out, 'retest-returns-policy.csv'), toCsvChunks(retest)[0]);
console.log(`\nCSV written to out/: golden-set-*.csv, retest-returns-policy.csv`);
