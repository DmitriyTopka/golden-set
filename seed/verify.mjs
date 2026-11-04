// Checks the seed file before it is uploaded and prints the numbers the plan relies on.
// Exit code 1 if any check fails.
//
// Usage: node seed/verify.mjs [path/to/northwind.json]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || join(here, 'northwind.json');
const data = JSON.parse(readFileSync(file, 'utf8'));
const { requests, articles } = data;

const closed = requests.filter((r) => r.statusHistory.at(-1)?.toCategory === 'done');
const distinct = requests.filter((r) => r.comments.filter((c) => c.public).every((c) => c.author.id !== r.reporter.id || c.id.endsWith('-c2')));
const reopened = requests.filter((r) => r.statusHistory.some((h) => h.fromCategory === 'done' && h.toCategory !== 'done'));
const byLabel = requests.reduce((m, r) => ({ ...m, [r._label]: (m[r._label] || 0) + 1 }), {});
const answerAuthorIsReporter = requests.filter((r) => r.comments.some((c) => c.public && c.id.endsWith('-c1') && c.author.id === r.reporter.id));

const report = {
  issues: requests.length,
  closed: closed.length,
  pages: articles.length,
  reporters_distinct_from_responder: requests.length - answerAuthorIsReporter.length,
  reopened: reopened.length,
  labels: byLabel,
};
console.log(JSON.stringify(report, null, 2));

const expected = { issues: 80, closed: 80, pages: 6, reporters_distinct_from_responder: 80, reopened: 8 };
const failed = Object.entries(expected).filter(([k, v]) => report[k] !== v);
if (distinct.length !== requests.length) failed.push(['distinct', distinct.length]);
if (failed.length) {
  console.error('FAILED:', failed.map(([k]) => `${k}=${report[k]} expected ${expected[k]}`).join(', '));
  process.exit(1);
}
console.log('OK');
