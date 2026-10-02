export function formatDateTime(value) {
  if (value === null || value === undefined || value === '') return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value;
  const hour = part('hour');

  return `${part('day')} ${part('month')} ${part('year')}, ${hour === '0' ? '12' : hour}:${part('minute')} ${part('dayPeriod').toUpperCase()}`;
}
