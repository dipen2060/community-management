export default function DashboardStats({ items }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ label, value, color }) => (
        <div className={`stat-card ${color}`} key={label}>
          <h3>{label}</h3>
          <div className="value">{value}</div>
        </div>
      ))}
    </div>
  );
}
