import { cleanExpected, applyEdits, undoEdit, MAX_EXPECTED } from '../core/edits.js';

describe('cleanExpected', () => {
  test('trims and collapses whitespace', () => {
    expect(cleanExpected('  You have 14 days.\n\n  Three weeks is too late.  ')).toEqual({ ok: true, text: 'You have 14 days. Three weeks is too late.' });
  });
  test('rejects empty, non-string and too long text', () => {
    expect(cleanExpected('   ').ok).toBe(false);
    expect(cleanExpected(undefined).ok).toBe(false);
    expect(cleanExpected({ text: 'x' }).ok).toBe(false);
    expect(cleanExpected('a'.repeat(MAX_EXPECTED + 1)).ok).toBe(false);
  });
  test('redacts personal data an admin might paste in', () => {
    expect(cleanExpected('Write to anna.k@example.com or call +48 22 555 0147.').text).toBe('Write to [email] or call [phone].');
  });
});

describe('applyEdits', () => {
  const pairs = [
    { id: 'NS-2', expected: 'You have 30 days from delivery to return it, so you are still in time.' },
    { id: 'NS-3', expected: 'The return window is 30 days from delivery.' },
  ];
  test('replaces the expected answer and keeps where it came from', () => {
    const out = applyEdits(pairs, { 'NS-2': { expected: 'Three weeks is past our 14-day window, so it cannot be returned.', at: '2026-11-04T12:00:00.000Z' } });
    expect(out[0]).toEqual({ id: 'NS-2', expected: 'Three weeks is past our 14-day window, so it cannot be returned.', edited: { from: pairs[0].expected, at: '2026-11-04T12:00:00.000Z' } });
    expect(out[1]).toBe(pairs[1]);
  });
  test('no edits or unknown ids leave pairs untouched', () => {
    expect(applyEdits(pairs, null)).toEqual(pairs);
    expect(applyEdits(pairs, { 'NS-99': { expected: 'x', at: 't' } })).toEqual(pairs);
  });
  test('a pair already edited keeps its first original text', () => {
    const once = applyEdits(pairs, { 'NS-3': { expected: 'The window is 14 days.', at: 't1' } });
    const twice = applyEdits(once, { 'NS-3': { expected: 'The return window is 14 days from delivery.', at: 't2' } });
    expect(twice[1].edited).toEqual({ from: 'The return window is 30 days from delivery.', at: 't2' });
  });
});

describe('undoEdit', () => {
  test('brings back the scanned text and drops the mark', () => {
    const p = { id: 'NS-2', expected: 'New text', edited: { from: 'Scanned text', at: 't' } };
    expect(undoEdit(p)).toEqual({ id: 'NS-2', expected: 'Scanned text' });
  });
  test('a pair that was never edited stays as it is', () => {
    const p = { id: 'NS-3', expected: 'Scanned text' };
    expect(undoEdit(p)).toBe(p);
  });
});
