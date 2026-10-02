const { getPollConfig } = require('../utils/pollConfig');

describe('poll runoff configuration', () => {
  test('uses defaults when environment variables are missing', () => {
    expect(getPollConfig({})).toEqual({ runoffHours: 48 });
  });

  test('accepts positive numeric values', () => {
    expect(getPollConfig({ POLL_RUNOFF_HOURS: '6.5' }))
      .toEqual({ runoffHours: 6.5 });
  });

  test('falls back for invalid or non-positive values', () => {
    expect(getPollConfig({ POLL_RUNOFF_HOURS: '0' }))
      .toEqual({ runoffHours: 48 });
    expect(getPollConfig({ POLL_RUNOFF_HOURS: 'invalid' }))
      .toEqual({ runoffHours: 48 });
  });
});
