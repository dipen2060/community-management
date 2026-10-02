import { formatDateTime } from './dateTime';

describe('formatDateTime', () => {
  test('formats local date and 12-hour time', () => {
    const value = new Date(2026, 9, 1, 17, 30);
    expect(formatDateTime(value)).toBe('01 Oct 2026, 5:30 PM');
  });

  test('returns an em dash for empty or invalid values', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('')).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
  });
});
