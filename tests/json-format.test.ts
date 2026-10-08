import { describe, expect, it } from 'vitest';
import { formatJsonData } from '../src/JsonCodeBlock';

describe('formatted JSON display data', () => {
  it('keeps short primitive arrays inline', () => {
    expect(formatJsonData([4, 9, 2, 7])).toBe('[4, 9, 2, 7]');
  });

  it('indents nested objects while keeping short arrays compact', () => {
    expect(formatJsonData({ user: { id: 3 }, scores: [4, 9, 2, 7] })).toBe(
      '{\n  "user": {\n    "id": 3\n  },\n  "scores": [4, 9, 2, 7]\n}',
    );
  });
});
