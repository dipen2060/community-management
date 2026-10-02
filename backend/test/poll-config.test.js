const { getPollConfig } = require('../utils/pollConfig');

describe('poll runoff configuration', () => {
  test('uses defaults when environment variables are missing', () => {
    expect(getPollConfig({})).toEqual({ runoffHours: 24, maxRounds: 2 });
  });

  test('accepts positive numeric values', () => {
    expect(getPollConfig({ POLL_RUNOFF_HOURS: '6.5', POLL_MAX_ROUNDS: '3' }))
      .toEqual({ runoffHours: 6.5, maxRounds: 3 });
  });

  test('falls back for invalid or non-positive values', () => {
    expect(getPollConfig({ POLL_RUNOFF_HOURS: '0', POLL_MAX_ROUNDS: '2.5' }))
      .toEqual({ runoffHours: 24, maxRounds: 2 });
    expect(getPollConfig({ POLL_RUNOFF_HOURS: 'invalid', POLL_MAX_ROUNDS: '-1' }))
      .toEqual({ runoffHours: 24, maxRounds: 2 });
  });
});
