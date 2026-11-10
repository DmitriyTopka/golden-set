import { commentUpdate } from '../src/seed.js';

describe('commentUpdate', () => {
  test('keeps line breaks and marks the reply public', () => {
    const u = commentUpdate('Hi Priya,\nThe window is 30 days.\n\nBest regards,\nAlex');
    const add = u.comment[0].add;
    expect(add.properties).toEqual([{ key: 'sd.public.comment', value: { internal: false } }]);
    const para = add.body.content[0].content;
    expect(para.filter((x) => x.type === 'hardBreak')).toHaveLength(4);
    expect(para.filter((x) => x.type === 'text').map((x) => x.text)).toEqual(['Hi Priya,', 'The window is 30 days.', 'Best regards,', 'Alex']);
  });
});
