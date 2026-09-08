import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export function Houses() {
  const [houses, setHouses] = useState([]);
  const [residents, setResidents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ houseNo: '', section: 'Section 1', floor: 0, type: 'apartment', monthlyDue: 500, owner: '' });
  const { user } = useAuth();
  const isAdmin = ['admin', 'staff'].includes(user?.role);

  const fetchHouses = () => axios.get('/api/houses').then(r => setHouses(r.data.data || []));
  useEffect(() => {
    fetchHouses();
    if (isAdmin) axios.get('/api/users?role=resident').then(r => setResidents(r.data.data || []));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, owner: form.owner || undefined };
      await axios.post('/api/houses', payload);
      setShowModal(false);
      setForm({ houseNo: '', section: 'Section 1', floor: 0, type: 'apartment', monthlyDue: 500, owner: '' });
      fetchHouses();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not add house');
    }
  };

  return (
    <div>
      <h1 className="page-title">🏠 Houses</h1>
      {isAdmin && <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setShowModal(true)}>+ Add House</button>}
      <div className="card">
        <table>
          <thead><tr><th>House No</th><th>Section</th><th>Floor</th><th>Type</th><th>Owner</th><th>Monthly Due</th></tr></thead>
          <tbody>
            {houses.map(h => (
              <tr key={h._id}>
                <td><strong>{h.houseNo}</strong></td>
                <td><span className="status status-inprogress">{h.section}</span></td>
                <td>Floor {h.floor}</td>
                <td>{h.type}</td>
                <td>{h.owner?.name || <span style={{ color: '#9ca3af' }}>Not linked</span>}</td>
                <td>Rs. {h.monthlyDue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Add House</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>House No</label><input value={form.houseNo} onChange={e => setForm({...form, houseNo: e.target.value})} required /></div>
              <div className="form-group"><label>Section</label>
                <select value={form.section} onChange={e => setForm({...form, section: e.target.value})}>
                  <option value="Section 1">Section 1</option>
                  <option value="Section 2">Section 2</option>
                  <option value="Section 3">Section 3</option>
                  <option value="Section 4">Section 4</option>
                </select>
              </div>
              <div className="form-group"><label>Floor</label><input type="number" value={form.floor} onChange={e => setForm({...form, floor: e.target.value})} /></div>
              <div className="form-group"><label>Type</label><select value={form.type} onChange={e => setForm({...form, type: e.target.value})}><option value="apartment">Apartment</option><option value="house">House</option><option value="shop">Shop</option></select></div>
              <div className="form-group"><label>Monthly Due (Rs.)</label><input type="number" value={form.monthlyDue} onChange={e => setForm({...form, monthlyDue: e.target.value})} /></div>
              <div className="form-group">
                <label>Owner (resident) — links them to this house & section</label>
                <select value={form.owner} onChange={e => setForm({...form, owner: e.target.value})}>
                  <option value="">— Not linked yet —</option>
                  {residents.map(r => <option key={r._id} value={r._id}>{r.name} ({r.username})</option>)}
                </select>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
                  Resident pahile "Staff/User Management" page bata create gara, ani yaha link gara.
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add House</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default Houses;
