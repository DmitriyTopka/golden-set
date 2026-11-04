import { toCsv, toCsvChunks, parseCsv, validateCsv, escapeCell, chunk } from '../core/csv.js';

const pairs = [
  { question: 'Plain question', expected: 'Plain answer.' },
  { question: 'Has, a comma', expected: 'Has "quotes"' },
  { question: 'Two\nlines', expected: 'ok' },
];

describe('csv', () => {
  test('escapes per RFC 4180', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('x\ny')).toBe('"x\ny"');
    expect(escapeCell(null)).toBe('');
  });

  test('round trip through our own parser', () => {
    const rows = parseCsv(toCsv(pairs));
    expect(rows[0]).toEqual(['prompt', 'expected_response']);
    expect(rows.slice(1)).toEqual(pairs.map((p) => [p.question, p.expected]));
  });

  test('prompt-only export for Manual testing', () => {
    expect(parseCsv(toCsv(pairs, { withExpected: false, header: false }))).toEqual(pairs.map((p) => [p.question]));
  });

  test('chunks at 50 rows', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ question: `q${i}`, expected: 'a' }));
    const files = toCsvChunks(many);
    expect(files).toHaveLength(3);
    expect(parseCsv(files[2])).toHaveLength(21);
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  test('validate accepts good files and rejects bad ones', () => {
    expect(validateCsv(toCsv(pairs))).toEqual({ ok: true, errors: [], rows: 3 });
    expect(validateCsv('prompt\n').errors).toContain('no prompts');
    expect(validateCsv('prompt,expected_response\n,x\n').errors[0]).toMatch(/empty prompt/);
    expect(validateCsv('a,b,c\n').errors[0]).toMatch(/1-2 columns/);
    expect(validateCsv('"unterminated\n').ok).toBe(false);
    expect(validateCsv('q@example.com,x\n').errors[0]).toMatch(/personal data/);
  });

  test('row limit is configurable for the 100-prompt limit', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ question: `q${i}`, expected: 'a' }));
    const csv = toCsv(many);
    expect(validateCsv(csv).ok).toBe(false);
    expect(validateCsv(csv, { maxRows: 100 }).ok).toBe(true);
  });

  test('parser handles BOM and missing trailing newline', () => {
    expect(parseCsv('\uFEFFa,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});
