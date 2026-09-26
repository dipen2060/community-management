import './Skeleton.css';

// A single shimmering placeholder block. Use width/height for custom shapes,
// or reach for one of the composite skeletons below for common layouts.
export function SkeletonBlock({ width = '100%', height = 16, radius = 6, style = {} }) {
  return (
    <div
      className="skeleton-block"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

// Mimics the stat-card row seen at the top of Dashboard/Dues/etc.
export function SkeletonStatsGrid({ count = 4 }) {
  return (
    <div className="stats-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="stat-card" key={i}>
          <SkeletonBlock width="60%" height={12} />
          <SkeletonBlock width="40%" height={28} style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

// Mimics a data table while its rows are still loading.
export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div className="card">
      <table>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c}>
                  <SkeletonBlock width={c === 0 ? '80%' : '55%'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Mimics a generic card of text lines (notices, complaint lists, etc.)
export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} width={i === lines - 1 ? '40%' : '90%'} style={{ marginBottom: 10 }} />
      ))}
    </div>
  );
}