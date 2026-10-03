export default function ResponsiveDataTable({ children, className = '' }) {
  return (
    <div className="responsive-table overflow-x-auto">
      <table className={`min-w-[600px] ${className}`.trim()}>
        {children}
      </table>
    </div>
  );
}
