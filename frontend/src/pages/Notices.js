import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../utils/dateTime';

export default function Notices() {
  const [notices, setNotices] = useState([]);
  const [sections, setSections] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', type: 'general', targetSections: [], expiresAt: '' });
  const [showExpired, setShowExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [expiringNoticeId, setExpiringNoticeId] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canPost = ['admin', 'staff'].includes(user?.role);

  const fetchNotices = () => {
    setLoading(true);
    return axios.get(`/api/notices?includeExpired=${canPost && showExpired}`)
      .then(r => setNotices(r.data.data || []))
      .finally(() => setLoading(false));
  };
  const fetchSections = () => axios.get('/api/houses').then(r => {
    const unique = [...new Set((r.data.data || []).map(h => h.section).filter(Boolean))];
    setSections(unique);
  });

  useEffect(() => { fetchNotices(); }, [showExpired, isAdmin]);
  useEffect(() => { if (canPost) fetchSections(); }, [canPost]);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const toggleSection = (section) => {
    setForm(prev => ({
      ...prev,
      targetSections: prev.targetSections.includes(section)
        ? prev.targetSections.filter(s => s !== section)
        : [...prev.targetSections, section]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await axios.post('/api/notices', form);
      setShowModal(false);
      setForm({ title: '', content: '', type: 'general', targetSections: [], expiresAt: '' });
      alert(res.data.warning
        ? `Notice posted, but notifications could not be delivered. Notified ${res.data.notifiedCount} resident(s).`
        : `Notice posted! Notified ${res.data.notifiedCount} resident(s).`);
      fetchNotices();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not post notice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Remove this notice?')) {
      try {
        await axios.delete(`/api/notices/${id}`);
        fetchNotices();
      } catch (err) {
        alert(err.response?.data?.message || 'Could not remove notice');
      }
    }
  };

  const handleExpire = async (id) => {
    setExpiringNoticeId(id);
    try {
      const response = await axios.put(`/api/notices/${id}/expire`);
      setToast(response.data.message || 'Notice expired successfully');
      await fetchNotices();
      setNow(Date.now());
    } catch (err) {
      setToast(err.response?.data?.message || 'Could not expire notice');
    } finally {
      setExpiringNoticeId(null);
    }
  };

  const typeColors = { general: '#dbeafe', emergency: '#fee2e2', event: '#d1fae5', maintenance: '#fef3c7' };
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minimumExpiryDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const visibleNotices = notices.filter(notice =>
    (canPost && showExpired) || !notice.expiresAt || new Date(notice.expiresAt).getTime() > now
  );

  return (
    <div className="min-w-0 w-full">
      <h1 className="page-title">📢 Notices</h1>
      {toast && <div role="status" className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">{toast}</div>}
      {canPost && <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setShowModal(true)}>+ Post Notice</button>}
      {canPost && (
        <label className="mb-4 flex w-fit items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={showExpired} onChange={event => setShowExpired(event.target.checked)} />
          Show expired
        </label>
      )}
      <div className="grid min-w-0 gap-4 sm:gap-5">
        {loading ? (
          <p className="text-sm text-slate-500">Loading notices...</p>
        ) : visibleNotices.length === 0 ? (
          <p className="text-sm text-slate-500">{showExpired ? 'No notices found.' : 'No active notices found.'}</p>
        ) : visibleNotices.map(n => {
          const expired = Boolean(n.expiresAt && new Date(n.expiresAt).getTime() <= now);
          return (
            <div key={n._id} className="card" style={{ background: typeColors[n.type] || '#fff', border: '1px solid #e2e8f0', ...(expired ? { opacity: 0.55, filter: 'grayscale(1)' } : {}) }}>
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 break-words">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 style={{ marginBottom: 8 }}>{n.title}</h3>
                  </div>
                  <p style={{ color: '#374151', fontSize: '0.875rem' }}>{n.content}</p>
                <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#6b7280' }}>
                  <span className={`status status-paid`}>{n.type}</span>
                  {n.targetSections?.length > 0 ? (
                    <span style={{ marginLeft: 6 }} className="status status-pending">📍 {n.targetSections.join(', ')}</span>
                  ) : (
                    <span style={{ marginLeft: 6 }} className="status status-inprogress">🌐 All Sections</span>
                  )}
                  <br />Posted: {formatDateTime(n.createdAt)}
                  {' | Expires: '}{n.expiresAt ? formatDateTime(n.expiresAt) : 'Never'}
                  {n.createdBy?.name ? ` • by ${n.createdBy.name}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-start">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  expired
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {expired ? 'Expired' : 'Active'}
                </span>
                {canPost && !expired && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#fef3c7', color: '#92400e' }}
                    disabled={expiringNoticeId === n._id}
                    onClick={() => handleExpire(n._id)}
                  >
                    {expiringNoticeId === n._id ? 'Expiring…' : 'Expire Now'}
                  </button>
                )}
                {isAdmin && <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#991b1b' }} onClick={() => handleDelete(n._id)}>Remove</button>}
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal !max-h-[calc(100vh_-_2rem)] !w-[calc(100%_-_2rem)] !overflow-y-auto sm:!w-[480px]" onClick={e => e.stopPropagation()}>
            <h3>Post Notice</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Title</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} required /></div>
              <div className="form-group"><label>Content</label><textarea rows="4" value={form.content} onChange={e => setForm({...form, content: e.target.value})} required style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }} /></div>
              <div className="form-group">
                <label htmlFor="notice-expires-at">Expires on <span className="optional-label">(optional; defaults to 7 days after posting)</span></label>
                <input
                  id="notice-expires-at"
                  type="date"
                  min={minimumExpiryDate}
                  value={form.expiresAt}
                  onChange={event => setForm({ ...form, expiresAt: event.target.value })}
                />
              </div>
              <div className="form-group"><label>Type</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="general">General</option><option value="emergency">Emergency</option>
                  <option value="event">Event</option><option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div className="form-group">
                <label>Target Sections</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  {sections.length === 0 && <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No sections found</span>}
                  {sections.map(s => (
                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', background: form.targetSections.includes(s) ? '#fee2e2' : '#f3f4f6', padding: '5px 10px', borderRadius: '20px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.targetSections.includes(s)} onChange={() => toggleSection(s)} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions !flex-col sm:!flex-row">
                <button type="button" className="btn btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Posting...' : 'Post Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}