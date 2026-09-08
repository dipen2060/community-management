import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function Notices() {
  const [notices, setNotices] = useState([]);
  const [sections, setSections] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', type: 'general', targetSections: [] });
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canPost = ['admin', 'staff'].includes(user?.role);

  const fetchNotices = () => axios.get('/api/notices').then(r => setNotices(r.data.data || []));
  const fetchSections = () => axios.get('/api/houses').then(r => {
    const unique = [...new Set((r.data.data || []).map(h => h.section).filter(Boolean))];
    setSections(unique);
  });

  useEffect(() => { fetchNotices(); if (canPost) fetchSections(); }, []);

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
    try {
      const res = await axios.post('/api/notices', form);
      setShowModal(false);
      setForm({ title: '', content: '', type: 'general', targetSections: [] });
      alert(`Notice posted! Notified ${res.data.notifiedCount} resident(s).`);
      fetchNotices();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not post notice');
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

  const typeColors = { general: '#dbeafe', emergency: '#fee2e2', event: '#d1fae5', maintenance: '#fef3c7' };

  return (
    <div>
      <h1 className="page-title">📢 Notices</h1>
      {canPost && <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setShowModal(true)}>+ Post Notice</button>}
      <div style={{ display: 'grid', gap: 16 }}>
        {notices.map(n => (
          <div key={n._id} className="card" style={{ background: typeColors[n.type] || '#fff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ marginBottom: 8 }}>{n.title}</h3>
                <p style={{ color: '#374151', fontSize: '0.875rem' }}>{n.content}</p>
                <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#6b7280' }}>
                  <span className={`status status-paid`}>{n.type}</span>
                  {n.targetSections?.length > 0 ? (
                    <span style={{ marginLeft: 6 }} className="status status-pending">📍 {n.targetSections.join(', ')}</span>
                  ) : (
                    <span style={{ marginLeft: 6 }} className="status status-inprogress">🌐 All Sections</span>
                  )}
                  <br />Posted by {n.createdBy?.name} • {new Date(n.createdAt).toLocaleDateString()}
                </div>
              </div>
              {isAdmin && <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#991b1b' }} onClick={() => handleDelete(n._id)}>Remove</button>}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Post Notice</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Title</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} required /></div>
              <div className="form-group"><label>Content</label><textarea rows="4" value={form.content} onChange={e => setForm({...form, content: e.target.value})} required style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }} /></div>
              <div className="form-group"><label>Type</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="general">General</option><option value="emergency">Emergency</option>
                  <option value="event">Event</option><option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div className="form-group">
                <label>Target Sections (leave empty = send to everyone)</label>
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
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Post Notice</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
