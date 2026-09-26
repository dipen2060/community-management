import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import { SkeletonTable } from '../components/Skeleton';

export function Houses() {
  const [houses, setHouses] = useState([]);
  const [residents, setResidents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editHouse, setEditHouse] = useState(null); // house being edited, null = creating new
  const [form, setForm] = useState({ houseNo: '', section: 'Section 1', floor: 0, type: 'apartment', monthlyDue: 500, owner: '', tenant: '' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const isAdmin = ['admin', 'staff'].includes(user?.role);

  const fetchHouses = (p = page) =>
    axios.get(`/api/houses?page=${p}&limit=20`).then(r => {
      setHouses(r.data.data || []);
      setPages(r.data.pages || 1);
      setTotal(r.data.total ?? (r.data.data || []).length);
    }).finally(() => setLoading(false));

  useEffect(() => {
    fetchHouses(page);
    if (isAdmin) axios.get('/api/users?role=resident').then(r => setResidents(r.data.data || []));
  }, [page]);

  const openCreate = () => {
    setEditHouse(null);
    setForm({ houseNo: '', section: 'Section 1', floor: 0, type: 'apartment', monthlyDue: 500, owner: '', tenant: '' });
    setShowModal(true);
  };

  const openEdit = (h) => {
    setEditHouse(h);
    setForm({
      houseNo: h.houseNo, section: h.section, floor: h.floor, type: h.type,
      monthlyDue: h.monthlyDue, owner: h.owner?._id || '', tenant: h.tenant?._id || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editHouse) {
        // '' clears the link (unassign), a real id (re)assigns it — updateHouse
        // handles both and keeps the resident_houses table in sync either way.
        await axios.put(`/api/houses/${editHouse._id}`, { ...form, owner: form.owner ?? '', tenant: form.tenant ?? '' });
      } else {
        const payload = { ...form, owner: form.owner || undefined };
        await axios.post('/api/houses', payload);
      }
      setShowModal(false);
      setEditHouse(null);
      setForm({ houseNo: '', section: 'Section 1', floor: 0, type: 'apartment', monthlyDue: 500, owner: '', tenant: '' });
      fetchHouses(page);
    } catch (err) {
      alert(err.response?.data?.message || `Could not ${editHouse ? 'update' : 'add'} house`);
    }
  };

  return (
    <div>
      <h1 className="page-title">🏠 Houses</h1>
      {isAdmin && <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={openCreate}>+ Add House</button>}
      {loading ? (
        <SkeletonTable rows={6} columns={7} />
      ) : (
      <div className="card">
        <table>
          <thead><tr><th>House No</th><th>Section</th><th>Floor</th><th>Type</th><th>Owner</th><th>Tenant</th><th>Monthly Due</th>{isAdmin && <th>Action</th>}</tr></thead>
          <tbody>
            {houses.map(h => (
              <tr key={h._id}>
                <td><strong>{h.houseNo}</strong></td>
                <td><span className="status status-inprogress">{h.section}</span></td>
                <td>Floor {h.floor}</td>
                <td>{h.type}</td>
                <td>{h.owner?.name || <span style={{ color: '#9ca3af' }}>Not linked</span>}</td>
                <td>{h.tenant?.name || <span style={{ color: '#9ca3af' }}>Not linked</span>}</td>
                <td>Rs. {h.monthlyDue}</td>
                {isAdmin && (
                  <td>
                    <button className="btn btn-sm" style={{ background: '#dbeafe', color: '#1e40af' }} onClick={() => openEdit(h)}>Edit</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {!loading && <Pagination page={page} pages={pages} total={total} onChange={setPage} />}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditHouse(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editHouse ? `Edit House ${editHouse.houseNo}` : 'Add House'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>House No</label><input value={form.houseNo} onChange={e => setForm({ ...form, houseNo: e.target.value })} required /></div>
              <div className="form-group"><label>Section</label>
                <select value={form.section} onChange={e => setForm({ ...form, section: e.target.value })}>
                  <option value="Section 1">Section 1</option>
                  <option value="Section 2">Section 2</option>
                  <option value="Section 3">Section 3</option>
                  <option value="Section 4">Section 4</option>
                </select>
              </div>
              <div className="form-group"><label>Floor</label><input type="number" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} /></div>
              <div className="form-group"><label>Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="apartment">Apartment</option><option value="house">House</option><option value="shop">Shop</option></select></div>
              <div className="form-group"><label>Monthly Due (Rs.)</label><input type="number" value={form.monthlyDue} onChange={e => setForm({ ...form, monthlyDue: e.target.value })} /></div>
              <div className="form-group">
                <label>Owner (resident) — links them to this house & section</label>
                <select value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}>
                  <option value="">— Not linked yet —</option>
                  {residents.map(r => <option key={r._id} value={r._id}>{r.name} ({r.username})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tenant (resident)</label>
                <select value={form.tenant} onChange={e => setForm({ ...form, tenant: e.target.value })}>
                  <option value="">— Not linked yet —</option>
                  {residents.map(r => <option key={r._id} value={r._id}>{r.name} ({r.username})</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => { setShowModal(false); setEditHouse(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editHouse ? 'Save Changes' : 'Add House'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default Houses;