import { redactPII, containsPII } from '../core/pii.js';

describe('redactPII', () => {
  test('removes emails', () => {
    expect(redactPII('write to jordan.blake@example.com please')).toBe('write to [email] please');
  });

  test('removes phones in several national formats', () => {
    for (const phone of ['+44 20 7946 0958', '+1 415 555 0132', '+48 22 555 0147', '+33 1 55 50 01 23', '(415) 555-0132']) {
      expect(redactPII(`call ${phone} today`)).toBe('call [phone] today');
    }
  });

  test('keeps short numbers that are facts, not phones', () => {
    const text = 'Returns within 30 days, fee $5, 15% restocking, 2026 model.';
    expect(redactPII(text)).toBe(text);
  });

  test('removes order numbers in common shapes', () => {
    expect(redactPII('My order is #NW-48291.')).toBe('My order is [order].');
    expect(redactPII('order no. 1029384 is late')).toBe('order [order] is late');
    expect(redactPII('Invoice: 55512 attached')).toBe('Invoice [order] attached');
  });

  test('removes card numbers', () => {
    expect(redactPII('card 4111 1111 1111 1111 was charged')).toBe('card [card] was charged');
  });

  test('removes known names, full and partial, longest first', () => {
    const out = redactPII('Hi Priya, Priya Nair here. Sam Rivera answered.', { names: ['Priya Nair', 'Sam Rivera'] });
    expect(out).toBe('Hi [name], [name] here. [name] answered.');
  });

  test('ignores empty input and empty names', () => {
    expect(redactPII('')).toBe('');
    expect(redactPII(null)).toBe('');
    expect(redactPII('Hello Al', { names: ['', 'A', null] })).toBe('Hello Al');
  });

  test('containsPII detects leftovers', () => {
    expect(containsPII('reach me at a.b@example.org')).toBe(true);
    expect(containsPII('card 4111111111111111')).toBe(true);
    expect(containsPII('reach me at [email]')).toBe(false);
  });
});
