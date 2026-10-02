const cron = require('node-cron');
const {
  DEFAULT_SLA_CHECK_CRON,
  getSlaCheckCron,
  getSlaHours
} = require('../utils/slaConfig');

describe('complaint SLA configuration', () => {
  test('uses the documented default thresholds when environment values are missing', () => {
    expect(getSlaHours({})).toEqual({
      urgent: 4,
      high: 12,
      medium: 48,
      low: 72
    });
  });

  test('accepts positive numeric values including decimal hours', () => {
    expect(getSlaHours({
      SLA_URGENT_HOURS: '0.5',
      SLA_HIGH_HOURS: '8',
      SLA_MEDIUM_HOURS: '36.25',
      SLA_LOW_HOURS: '120'
    })).toEqual({
      urgent: 0.5,
      high: 8,
      medium: 36.25,
      low: 120
    });
  });

  test('falls back individually for invalid, non-finite, or non-positive thresholds', () => {
    expect(getSlaHours({
      SLA_URGENT_HOURS: '0',
      SLA_HIGH_HOURS: '-1',
      SLA_MEDIUM_HOURS: 'not-a-number',
      SLA_LOW_HOURS: 'Infinity'
    })).toEqual({
      urgent: 4,
      high: 12,
      medium: 48,
      low: 72
    });
  });

  test('uses the default SLA check schedule for missing or invalid cron expressions', () => {
    expect(getSlaCheckCron({}, cron.validate)).toBe(DEFAULT_SLA_CHECK_CRON);
    expect(getSlaCheckCron({ SLA_CHECK_CRON: 'not a cron' }, cron.validate)).toBe(DEFAULT_SLA_CHECK_CRON);
  });

  test('accepts a valid configured cron expression', () => {
    expect(getSlaCheckCron({ SLA_CHECK_CRON: '*/15 * * * *' }, cron.validate)).toBe('*/15 * * * *');
  });
});
