import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function Complaints() {
  const [complaints, setComplaints] = useState([]);
  const [showModal,  setShowModal]  = useState(false);
  const [similar,    setSimilar]    = useState([]);
  const [autoInfo,   setAutoInfo]   = useState(null);
  const [form,       setForm]       = useState({ title: '', description: '', priority: 'medium' });
  const [resolveFor, setResolveFor] = useState(null); // complaint being resolved
  const [resolutionText, setResolutionText] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [allSections, setAllSections] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const { user } = useAuth();
  const isAdminOrStaff = ['admin', 'staff'].includes(user?.role);
  const isAdmin = user?.role === 'admin';

  const fetchComplaints = () => {
    const params = sectionFilter ? `?section=${encodeURIComponent(sectionFilter)}` : '';
    axios.get(`/api/complaints${params}`).then(r => setComplaints(r.data.data || []));
  };

  useEffect(() => { fetchComplaints(); }, [sectionFilter]);

  useEffect(() => {
    if (isAdminOrStaff) {
      axios.get('/api/houses').then(r => {
        const unique = [...new Set((r.data.data || []).map(h => h.section).filter(Boolean))];
        setAllSections(unique);
      });
    }
    if (isAdmin) {
      axios.get('/api/users?role=staff').then(r => {
        setStaffList(r.data.data || []);
      }).catch(() => {});
    }
  }, [isAdminOrStaff, isAdmin]);

  const handleExport = async (type) => {
    try {
      const params = sectionFilter ? `?section=${encodeURIComponent(sectionFilter)}` : '';
      const response = await axios.get(`/api/exports/complaints/${type}${params}`, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: type === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `complaints-report-${new Date().toISOString().split('T')[0]}.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || `Could not export complaints ${type.toUpperCase()}.`);
    }
  };

  const handleAssignStaff = async (complaintId, staffId) => {
    try {
      await axios.put(`/api/complaints/${complaintId}`, {
        assignedTo: staffId || null,
        status: staffId ? 'inprogress' : 'pending'
      });
      fetchComplaints();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not assign staff member');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/complaints', form);
      setAutoInfo({ category: res.data.autoDetected?.category, section: res.data.autoDetected?.section, assigned: res.data.autoAssigned });
      if (res.data.similarComplaints?.length) {
        setSimilar(res.data.similarComplaints);
      } else {
        setShowModal(false);
      }
      setForm({ title: '', description: '', priority: 'medium' });
      fetchComplaints();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not submit complaint');
    }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      await axios.put(`/api/complaints/${id}`, { status });
      fetchComplaints();
    } catch (err) {
      alert(err.response?.data?.message || 'Action failed');
    }
  };

  const openResolveModal = (complaint) => {
    setResolveFor(complaint);
    setResolutionText('');
  };

  const submitResolution = async () => {
    if (!resolutionText.trim()) { alert('Resolution description is required!'); return; }
    try {
      await axios.put(`/api/complaints/${resolveFor._id}`, { status: 'resolved', resolution: resolutionText });
      setResolveFor(null);
      fetchComplaints();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not resolve complaint');
    }
  };

  // Can the current user resolve this specific complaint?
  const canResolve = (c) => {
    if (user.role === 'admin') return true;
    if (user.role === 'staff') return c.assignedTo?._id === user.id || c.assignedTo === user.id;
    return false;
  };

  return (
    <div>
      <h1 className="page-title">🔧 Complaints</h1>
      <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => { setShowModal(true); setAutoInfo(null); }}>+ New Complaint</button>
        {isAdminOrStaff && (
          <>
            <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem' }}>
              <option value="">All Sections</option>
              {allSections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="btn btn-sm" style={{ background: '#10b981', color: 'white' }} onClick={() => handleExport('excel')}>
              📊 Excel
            </button>
            <button type="button" className="btn btn-sm" style={{ background: '#ef4444', color: 'white' }} onClick={() => handleExport('pdf')}>
              📄 PDF
            </button>
          </>
        )}
      </div>

      {/* Similar Complaints AI Panel — now with resolver contact info */}
      {similar.length > 0 && (
        <div className="card" style={{ background: '#f0f9ff', borderColor: '#bae6fd', border: '1px solid' }}>
          <h3>🤖 AI Found Similar Past Complaints:</h3>
          {similar.map((s, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #e0f2fe' }}>
              <strong>{s.title}</strong> — {s.matchPercent}% match {s.section && <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>(📍 {s.section})</span>}
              <br /><span style={{ color: '#0369a1', fontSize: '0.85rem' }}>✅ Resolution: {s.resolution}</span>
              {s.resolvedBy && (
                <><br /><span style={{ color: '#0369a1', fontSize: '0.85rem' }}>
                  🔧 Resolved by: {s.resolvedBy.name} ({s.resolvedBy.specialization}) — 📞 {s.resolvedBy.phone || 'N/A'}
                </span></>
              )}
            </div>
          ))}
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setSimilar([])}>OK, Got it!</button>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th>Title</th><th>Section</th><th>Category</th><th>Priority</th><th>Submitted By</th><th>Assigned To</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {complaints.map(c => (
              <tr key={c._id}>
                <td><strong>{c.title}</strong><br /><span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{c.description?.slice(0, 60)}...</span></td>
                <td><span className="status status-pending">📍 {c.section}</span></td>
                <td><span className="status status-inprogress">{c.category}</span></td>
                <td><span className={`status status-${c.priority === 'urgent' ? 'overdue' : 'pending'}`}>{c.priority}</span></td>
                <td>{c.submittedBy?.name || 'N/A'}</td>
                <td>
                  {c.assignedTo ? (
                    <>
                      <strong>{c.assignedTo.name}</strong>
                      <br /><span style={{ fontSize: '0.75rem', color: '#6b7280' }}>📞 {c.assignedTo.phone || 'N/A'}</span>
                    </>
                  ) : <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>Not assigned</span>}
                  {isAdmin && staffList.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <select
                        style={{ fontSize: '0.75rem', padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: '4px', maxWidth: '140px' }}
                        value={c.assignedTo?._id || ''}
                        onChange={(e) => handleAssignStaff(c._id, e.target.value)}
                      >
                        <option value="">-- {c.assignedTo ? 'Reassign' : 'Assign Staff'} --</option>
                        {staffList.map(s => (
                          <option key={s._id} value={s._id}>{s.name} ({s.specialization})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </td>
                <td><span className={`status status-${c.status}`}>{c.status}</span></td>
                <td>
                  {c.status === 'closed' && (
                    <span style={{ fontSize: '0.78rem', color: '#991b1b' }}>🔒 Locked (resolved 2x)</span>
                  )}
                  {c.status === 'pending' && isAdminOrStaff && canResolve(c) && (
                    <button className="btn btn-sm" style={{ background: '#dbeafe', color: '#1e40af' }}
                      onClick={() => handleStatusUpdate(c._id, 'inprogress')}>Start Work</button>
                  )}
                  {c.status === 'inprogress' && canResolve(c) && (
                    <button className="btn btn-success btn-sm" onClick={() => openResolveModal(c)}>Resolve</button>
                  )}
                  {c.status === 'inprogress' && !canResolve(c) && (
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Only {c.assignedTo?.name || 'assigned staff'} can resolve</span>
                  )}
                  {c.status === 'resolved' && (
                    <>
                      <span style={{ fontSize: '0.78rem', color: '#059669' }}>✅ {c.resolution?.slice(0,40)}</span>
                      {(canResolve(c) || c.submittedBy?._id === user?.id || c.submittedBy === user?.id) && (
                        <div style={{ marginTop: 4 }}>
                          <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#991b1b' }}
                            onClick={() => handleStatusUpdate(c._id, 'pending')}>Reopen</button>
                        </div>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Complaint Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>New Complaint</h3>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 14 }}>
              🤖 Category automatically detect huncha title/description bata, ani section/area timro linked house bata automatic feel huncha — relevant specialist staff lai auto-assign garincha!
            </p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Title</label>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Paani aaudaina" required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea rows="3" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Detail ma problem describe gara..." required style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }} />
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Complaint</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auto-assignment result toast/modal */}
      {autoInfo && !showModal && similar.length === 0 && (
        <div className="modal-overlay" onClick={() => setAutoInfo(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>✅ Complaint Submitted!</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: 8 }}>🤖 Auto-detected category: <strong>{autoInfo.category}</strong></p>
            <p style={{ fontSize: '0.9rem', marginBottom: 8 }}>📍 Section/Area: <strong>{autoInfo.section}</strong> (from your linked house)</p>
            {autoInfo.assigned ? (
              <p style={{ fontSize: '0.9rem' }}>
                🔧 Auto-assigned to: <strong>{autoInfo.assigned.name}</strong> ({autoInfo.assigned.specialization})
                <br />📞 Contact: {autoInfo.assigned.phone || 'N/A'}
              </p>
            ) : (
              <p style={{ fontSize: '0.9rem', color: '#92400e' }}>⚠️ No specialist available right now — admin will assign manually.</p>
            )}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setAutoInfo(null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal — resolution text required */}
      {resolveFor && (
        <div className="modal-overlay" onClick={() => setResolveFor(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Resolve: {resolveFor.title}</h3>
            <div className="form-group">
              <label>What was the problem and how was it fixed? (required)</label>
              <textarea rows="4" value={resolutionText} onChange={e => setResolutionText(e.target.value)}
                placeholder="e.g. Main pump motor fail bhayeko thiyo, naya motor lagayera fix gariyo."
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px' }} required />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-cancel" onClick={() => setResolveFor(null)}>Cancel</button>
              <button className="btn btn-success" onClick={submitResolution}>Mark Resolved</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
