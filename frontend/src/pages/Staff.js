import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const specializationLabels = {
  water: '🚿 Water (Plumber)',
  electric: '🔌 Electric (Electrician)',
  lift: '🛗 Lift Technician',
  sanitation: '🧹 Sanitation',
  security: '🛡️ Security Guard',
  general: '🧰 General Staff'
};

const roleLabels = { admin: '👑 Admin', staff: '👷 Staff', resident: '🏠 Resident' };
const exportSectionLabels = {
  '': 'No export access',
  dues: 'Dues',
  complaints: 'Complaints',
  residents: 'Residents',
  all: 'All exports'
};

export default function Staff() {
  const [users, setUsers]       = useState([]);
  const [houses, setHouses]     = useState([]);
  const [tab, setTab]           = useState('staff'); // 'staff' | 'resident' | 'admin'
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser]   = useState(null); // user being edited, null = creating new
  const [credentials, setCredentials] = useState(null); // show after creation
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'staff', specialization: 'water', exportSection: 'complaints', houseId: '', relationshipType: 'owner' });
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const fetchUsers = () => axios.get('/api/users').then(r => setUsers(r.data.data || []));
  const fetchHouses = () => axios.get('/api/houses?limit=500').then(r => setHouses(r.data.data || [])).catch(() => {});
  useEffect(() => {
    if (isAdmin) fetchUsers(); else axios.get('/api/users?role=staff').then(r => setUsers(r.data.data || []));
    // Also doubles as the source for the House/Role pickers below, so a
    // resident can be assigned as owner/tenant right from this page.
    if (isAdmin) fetchHouses();
  }, []);

  // Map residentId -> [{ houseId, houseNo, role, relationshipType }] for the
  // "Linked House" column, and to prefill the edit form with their current link.
  const houseLinksByResident = {};
  houses.forEach(h => {
    if (h.owner?._id) {
      (houseLinksByResident[h.owner._id] ||= []).push({ houseId: h._id, houseNo: h.houseNo, role: 'Owner', relationshipType: 'owner' });
    }
    if (h.tenant?._id) {
      (houseLinksByResident[h.tenant._id] ||= []).push({ houseId: h._id, houseNo: h.houseNo, role: 'Tenant', relationshipType: 'tenant' });
    }
  });

  const openCreate = (role) => {
    setEditUser(null);
    setForm({ name: '', email: '', phone: '', role, specialization: 'water', exportSection: role === 'staff' ? 'complaints' : '', houseId: '', relationshipType: 'owner' });
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditUser(u);
    const currentLink = houseLinksByResident[u._id]?.[0];
    setForm({
      name: u.name, email: u.email || '', phone: u.phone || '', role: u.role,
      specialization: u.specialization || 'water', exportSection: u.exportSection || '',
      houseId: currentLink?.houseId || '', relationshipType: currentLink?.relationshipType || 'owner'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isResident = form.role === 'resident';
    const payload = {
      ...form,
      exportSection: form.role === 'staff' ? (form.exportSection || null) : undefined,
      // Only send house fields for residents; omit entirely for staff/admin
      // so we never accidentally touch house links for a non-resident.
      houseId: isResident ? form.houseId : undefined,
      relationshipType: isResident && form.houseId ? form.relationshipType : undefined
    };
    try {
      if (editUser) {
        await axios.put(`/api/users/${editUser._id}`, payload);
        setShowModal(false);
      } else {
        const res = await axios.post('/api/users', payload);
        setShowModal(false);
        setCredentials({
          name: res.data.data.name,
          username: res.data.data.username,
          password: res.data.temporaryPassword,
          role: res.data.data.role,
          house: res.data.data.house
        });
      }
      fetchUsers();
      if (isAdmin) fetchHouses();
    } catch (err) {
      alert(err.response?.data?.message || 'Action failed');
    }
  };

  const handleDeactivateToggle = async (u) => {
    try {
      await axios.put(`/api/users/${u._id}`, { isActive: !u.isActive });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update this user');
    }
  };

  const handleResetPassword = async (u) => {
    if (!window.confirm(`Reset ${u.name}'s password? They must change it on first login.`)) return;
    try {
      const res = await axios.put(`/api/users/${u._id}/reset-password`);
      setCredentials({ name: u.name, username: u.username, password: res.data.temporaryPassword, role: u.role, isReset: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Could not reset password');
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Permanently delete ${u.name}? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/users/${u._id}`);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not delete user');
    }
  };

  const filtered = users.filter(u => u.role === tab);

  // Non-admin (staff) — read-only directory view
  if (!isAdmin) {
    return (
      <div>
        <h1 className="page-title">👷 Staff Directory</h1>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 16 }}>
          Aafno profile edit garna chahanu huncha vane admin lai contact garnu hos.
        </p>
        <div className="card">
          <table>
            <thead><tr><th>Name</th><th>Specialization</th><th>Phone</th></tr></thead>
            <tbody>
              {users.map(s => (
                <tr key={s._id}>
                  <td>{s.name}</td>
                  <td>{specializationLabels[s.specialization] || s.specialization}</td>
                  <td>{s.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">👥 User Management</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['staff', 'resident', 'admin'].map(t => (
          <button key={t} className="btn btn-sm" onClick={() => setTab(t)}
            style={{ background: tab === t ? '#e94560' : '#f3f4f6', color: tab === t ? 'white' : '#374151' }}>
            {roleLabels[t]} ({users.filter(u => u.role === t).length})
          </button>
        ))}
      </div>

      <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => openCreate(tab)}>
        + Add {tab === 'staff' ? 'Staff Member' : tab === 'admin' ? 'Admin' : 'Resident'}
      </button>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Email (Login)</th><th>Username</th>
              {tab === 'staff' && <><th>Specialization</th><th>Export Scope</th></>}
              {tab === 'resident' && <th>Linked House</th>}
              <th>Phone</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s._id}>
                <td><strong>{s.name}</strong></td>
                <td style={{ fontSize: '0.82rem' }}>{s.email}</td>
                <td><code style={{ fontSize: '0.8rem' }}>{s.username}</code></td>
                {tab === 'staff' && <td><span className="status status-inprogress">{specializationLabels[s.specialization] || s.specialization}</span></td>}
                {tab === 'staff' && <td>{exportSectionLabels[s.exportSection || ''] || s.exportSection}</td>}
                {tab === 'resident' && (
                  <td>
                    {houseLinksByResident[s._id]?.length ? (
                      houseLinksByResident[s._id].map((link, i) => (
                        <span key={i} className="status status-paid" style={{ marginRight: 4, marginBottom: 4, display: 'inline-block' }}>
                          🏠 {link.houseNo} ({link.role})
                        </span>
                      ))
                    ) : (
                      <span className="status status-overdue" title="Go to the Houses page to assign this resident as an Owner or Tenant">
                        ⚠️ Not linked
                      </span>
                    )}
                  </td>
                )}
                <td>{s.phone || '—'}</td>
                <td><span className={`status ${s.isActive ? 'status-paid' : 'status-overdue'}`}>{s.isActive ? 'Active' : 'Inactive'}</span></td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" style={{ background: '#dbeafe', color: '#1e40af' }} onClick={() => openEdit(s)}>Edit</button>
                  <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e' }} onClick={() => handleResetPassword(s)}>Reset Pwd</button>
                  <button className="btn btn-sm" style={{ background: s.isActive ? '#fee2e2' : '#d1fae5', color: s.isActive ? '#991b1b' : '#065f46' }} onClick={() => handleDeactivateToggle(s)}>
                    {s.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#991b1b' }} onClick={() => handleDelete(s)}>Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>No {tab}s yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editUser ? `Edit ${editUser.name}` : `Add New ${form.role === 'staff' ? 'Staff' : form.role === 'admin' ? 'Admin' : 'Resident'}`}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Full Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Bishnu Thapa" required /></div>
              <div className="form-group">
                <label>Email {!editUser && '(used for login)'}</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="e.g. bishnu@tole.com" required={!editUser} disabled={!!editUser} style={{ background: editUser ? '#f9fafb' : undefined }} />
                {editUser && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 3 }}>Email cannot be changed after creation</p>}
              </div>
              <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="98xxxxxxxx" /></div>
              {form.role === 'staff' && (
                <div className="form-group">
                  <label>Specialization</label>
                  <select value={form.specialization} onChange={e => setForm({...form, specialization: e.target.value})}>
                    {Object.entries(specializationLabels).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
              {form.role === 'staff' && (
                <div className="form-group">
                  <label>Export Access</label>
                  <select value={form.exportSection} onChange={e => setForm({ ...form, exportSection: e.target.value })}>
                    {Object.entries(exportSectionLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
              {form.role === 'resident' && (
                <>
                  <div className="form-group">
                    <label>House {editUser ? '(change or unlink)' : '(optional — can link later too)'}</label>
                    <select value={form.houseId} onChange={e => setForm({ ...form, houseId: e.target.value })}>
                      <option value="">— Not linked —</option>
                      {houses.map(h => (
                        <option key={h._id} value={h._id}>{h.houseNo} ({h.section})</option>
                      ))}
                    </select>
                  </div>
                  {form.houseId && (
                    <div className="form-group">
                      <label>Role at this house</label>
                      <select value={form.relationshipType} onChange={e => setForm({ ...form, relationshipType: e.target.value })}>
                        <option value="owner">Owner</option>
                        <option value="tenant">Tenant</option>
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editUser ? 'Save Changes' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials reveal — shown exactly once, right after create/reset.
          The plaintext temp password only ever exists in this API response;
          it cannot be retrieved again after this modal is closed. */}
      {credentials && (
        <div className="modal-overlay" onClick={() => setCredentials(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🔑 {credentials.isReset ? 'Password Reset' : `${credentials.name} Created`}</h3>
            <p style={{ fontSize: '0.82rem', color: '#991b1b', fontWeight: 600, marginBottom: 16 }}>
              ⚠️ Save this now — it will not be shown again.
            </p>
            <div style={{ background: 'var(--th-bg)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Username</div>
                <code style={{ fontSize: '0.95rem' }}>{credentials.username}</code>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Temporary Password</div>
                <code style={{ fontSize: '0.95rem', fontWeight: 700 }}>{credentials.password}</code>
              </div>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Deliver this to {credentials.name} through a secure channel (in person, SMS, or a private message — not a shared/public channel). They'll be required to set their own password on first login.
              {credentials.role === 'resident' && (credentials.house
                ? ` Linked to house ${credentials.house.houseNo} as ${credentials.house.relationshipType}.`
                : ' Not linked to a house yet — you can link them from the Houses page, or by editing them here.')}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-cancel"
                onClick={() => { navigator.clipboard?.writeText(`Username: ${credentials.username}\nPassword: ${credentials.password}`); }}
              >
                📋 Copy
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setCredentials(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}