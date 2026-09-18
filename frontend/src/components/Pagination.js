// Simple Prev/Next pagination bar. Renders nothing if there's only one page.
export default function Pagination({ page, pages, total, onChange }) {
  if (!pages || pages <= 1) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginTop: 16,
        padding: '12px 0'
      }}
    >
      <button
        type="button"
        className="btn btn-cancel btn-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        ← Prev
      </button>
      <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
        Page {page} of {pages}{typeof total === 'number' ? ` · ${total} total` : ''}
      </span>
      <button
        type="button"
        className="btn btn-cancel btn-sm"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next →
      </button>
    </div>
  );
}