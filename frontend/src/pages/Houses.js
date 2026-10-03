import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import { SkeletonTable } from '../components/Skeleton';
import ResponsiveDataTable from '../components/ResponsiveDataTable';
import ResponsiveForm from '../components/ResponsiveForm';
import {
  MAX_MONTHLY_DUE,
  normalizeHouseNo,
  normalizeSection,
  validateHouseForm
} from '../utils/validation';

export function Houses() {
  const [houses, setHouses] = useState([]);
  const [residents, setResidents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editHouse, setEditHouse] = useState(null); // house being edited, null = creating new
  const [form, setForm] = useState({ houseNo: '', section: 'Section 1', floor: 0, type: 'apartment', monthlyDue: '', owner: '', tenant: '' });
  const [touchedFields, setTouchedFields] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
    setForm({ houseNo: '', section: 'Section 1', floor: 0, type: 'apartment', monthlyDue: '', owner: '', tenant: '' });
    setTouchedFields({});
    setSubmitAttempted(false);
    setShowModal(true);
  };

  const openEdit = (h) => {
    setEditHouse(h);
    setForm({
      houseNo: h.houseNo, section: h.section, floor: h.floor, type: h.type,
      monthlyDue: h.monthlyDue, owner: h.owner?._id || '', tenant: h.tenant?._id || ''
    });
    setTouchedFields({});
    setSubmitAttempted(false);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    const errors = validateHouseForm(form, houses, editHouse?._id);
    if (Object.values(errors).some(Boolean)) return;

    const payload = {
      ...form,
      houseNo: normalizeHouseNo(form.houseNo),
      section: normalizeSection(form.section),
      floor: form.floor === '' ? undefined : Number(form.floor),
      monthlyDue: Number(form.monthlyDue)
    };
    setSubmitting(true);
    try {
      if (editHouse) {
        // '' clears the link (unassign), a real id (re)assigns it — updateHouse
        // handles both and keeps the resident_houses table in sync either way.
        await axios.put(`/api/houses/${editHouse._id}`, { ...payload, owner: form.owner ?? '', tenant: form.tenant ?? '' });
      } else {
        await axios.post('/api/houses', { ...payload, owner: form.owner || undefined });
      }
      setShowModal(false);
      setEditHouse(null);
      setForm({ houseNo: '', section: 'Section 1', floor: 0, type: 'apartment', monthlyDue: '', owner: '', tenant: '' });
      setTouchedFields({});
      setSubmitAttempted(false);
      fetchHouses(page);
    } catch (err) {
      alert(err.response?.data?.message || `Could not ${editHouse ? 'update' : 'add'} house`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">🏠 Houses</h1>
      {isAdmin && <button className="btn btn-primary w-full md:w-auto" style={{ marginBottom: 20 }} onClick={openCreate}>+ Add House</button>}
      {loading ? (
        <SkeletonTable rows={6} columns={7} />
      ) : (
      <div className="card">
        <ResponsiveDataTable>
          <thead><tr><th>House No</th><th>Section</th><th>Floor</th><th>Type</th><th>Owner</th><th>Tenant</th><th>Monthly Due</th>{isAdmin && <th>Action</th>}</tr></thead>
          <tbody>
            {!houses.length && (
              <tr><td colSpan={isAdmin ? 8 : 7} className="table-empty">No houses have been added yet.</td></tr>
            )}
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
        </ResponsiveDataTable>
      </div>
      )}
      {!loading && <Pagination page={page} pages={pages} total={total} onChange={setPage} />}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditHouse(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editHouse ? `Edit House ${editHouse.houseNo}` : 'Add House'}</h3>
            <ResponsiveForm onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label>House No</label>
                <input
                  type="text"
                  maxLength={20}
                  value={form.houseNo}
                  onChange={e => setForm({ ...form, houseNo: normalizeHouseNo(e.target.value) })}
                  onBlur={() => setTouchedFields({ ...touchedFields, houseNo: true })}
                  required
                />
                {(touchedFields.houseNo || submitAttempted || form.houseNo) && validateHouseForm(form, houses, editHouse?._id).houseNo && (
                  <p role="alert" className="mt-1 text-sm text-red-600">{validateHouseForm(form, houses, editHouse?._id).houseNo}</p>
                )}
              </div>
              <div className="form-group"><label>Section</label>
                <select required value={form.section} onChange={e => setForm({ ...form, section: normalizeSection(e.target.value) })} onBlur={() => setTouchedFields({ ...touchedFields, section: true })}>
                  <option value="Section 1">Section 1</option>
                  <option value="Section 2">Section 2</option>
                  <option value="Section 3">Section 3</option>
                  <option value="Section 4">Section 4</option>
                </select>
                {(touchedFields.section || submitAttempted || form.section) && validateHouseForm(form, houses, editHouse?._id).section && (
                  <p role="alert" className="mt-1 text-sm text-red-600">{validateHouseForm(form, houses, editHouse?._id).section}</p>
                )}
              </div>
              <div className="form-group">
                <label>Floor</label>
                <input type="number" min={0} max={30} step={1} required value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} onBlur={() => setTouchedFields({ ...touchedFields, floor: true })} />
                {(touchedFields.floor || submitAttempted || form.floor !== '') && validateHouseForm(form, houses, editHouse?._id).floor && (
                  <p role="alert" className="mt-1 text-sm text-red-600">{validateHouseForm(form, houses, editHouse?._id).floor}</p>
                )}
              </div>
              <div className="form-group"><label>Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="apartment">Apartment</option><option value="house">House</option><option value="shop">Shop</option></select></div>
              <div className="form-group">
                <label>Monthly Due (Rs.)</label>
                <input type="number" min="0.01" max={MAX_MONTHLY_DUE} step="0.01" required value={form.monthlyDue} onChange={e => setForm({ ...form, monthlyDue: e.target.value })} onBlur={() => setTouchedFields({ ...touchedFields, monthlyDue: true })} />
                {(touchedFields.monthlyDue || submitAttempted || form.monthlyDue !== '') && validateHouseForm(form, houses, editHouse?._id).monthlyDue && (
                  <p role="alert" className="mt-1 text-sm text-red-600">{validateHouseForm(form, houses, editHouse?._id).monthlyDue}</p>
                )}
              </div>
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
              <div className="modal-actions col-span-full">
                <button type="button" className="btn btn-cancel" onClick={() => { setShowModal(false); setEditHouse(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editHouse ? 'Save Changes' : 'Add House'}
                </button>
              </div>
            </ResponsiveForm>
          </div>
        </div>
      )}
    </div>
  );
}
export default Houses;