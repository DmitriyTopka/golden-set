import { normalizeAnswer } from '../core/normalize.js';

describe('normalizeAnswer', () => {
  test('drops greeting, filler and sign-off, keeps the fact', () => {
    const reply = 'Hi [name], thanks for reaching out.\nYou have 30 days from delivery to return it.\nHope this helps!\nBest regards,\n[name]';
    expect(normalizeAnswer(reply)).toBe('You have 30 days from delivery to return it.');
  });

  test('prefers sentences with facts over chatter', () => {
    const reply = 'Hello [name],\nGood question. Standard delivery takes 4 business days. Express arrives in 1 business day.\nCheers,\n[name]';
    expect(normalizeAnswer(reply)).toBe('Standard delivery takes 4 business days. Express arrives in 1 business day.');
  });

  test('keeps plain sentences when no fact is present', () => {
    const reply = 'Hi [name],\nShipped orders cannot be cancelled. Please return the item instead.\nThanks,\n[name]';
    expect(normalizeAnswer(reply)).toBe('Shipped orders cannot be cancelled. Please return the item instead.');
  });

  test('limits the length to two sentences by default', () => {
    const reply = 'It costs $5. It takes 2 hours. It ships in 4 business days.';
    expect(normalizeAnswer(reply)).toBe('It costs $5. It takes 2 hours.');
    expect(normalizeAnswer(reply, { maxSentences: 3 })).toBe(reply);
  });

  test('adds final punctuation and capitalises', () => {
    expect(normalizeAnswer('within 24 hours')).toBe('Within 24 hours.');
  });

  test('drops a dangling "More details:" left after the link is stripped', () => {
    expect(normalizeAnswer('Hi [name],\nOpened earbuds cannot be returned. More details:\nBest regards,\n[name]')).toBe('Opened earbuds cannot be returned.');
  });

  test('returns empty string for pure pleasantries', () => {
    expect(normalizeAnswer('Hi [name],\nHope this helps!\nKind regards,\n[name]')).toBe('');
    expect(normalizeAnswer('')).toBe('');
  });
});
