import { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { SkeletonStatsGrid, SkeletonCard, SkeletonTable } from '../components/Skeleton';

export default function Dashboard() {
  const [stats,      setStats]      = useState(null);
  const [notices,    setNotices]    = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [houses,     setHouses]     = useState([]);
  const [selectedHouseId, setSelectedHouseId] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role !== 'resident') return;
    axios.get('/api/houses').then(r => {
      const linkedHouses = r.data.data || [];
      setHouses(linkedHouses);
      setSelectedHouseId(current => current || (linkedHouses.length === 1 ? String(linkedHouses[0]._id) : ''));
    }).catch(err => {
      console.error('Failed to fetch houses:', err);
      setHouses([]);
    });
  }, [user?.role]);

  useEffect(() => {
    const houseParam = selectedHouseId ? `?houseId=${encodeURIComponent(selectedHouseId)}` : '';
    axios.get(`/api/dues/stats${houseParam}`).then(r => setStats(r.data.data)).catch(err => console.error('Failed to fetch due stats:', err)).finally(() => setLoading(false));
    axios.get('/api/notices').then(r => setNotices(r.data.data?.slice(0, 3) || [])).catch(err => console.error('Failed to fetch notices:', err));
    axios.get(`/api/complaints${houseParam}`).then(r => setComplaints(r.data.data?.slice(0, 5) || [])).catch(err => console.error('Failed to fetch complaints:', err));
  }, [selectedHouseId]);

  const pieData = stats ? [
    { name: 'Paid',    value: stats.paidDues    },
    { name: 'Pending', value: stats.pendingDues },
  ] : [];
  const COLORS = ['#10b981', '#f59e0b'];

  return (
    <div>
      <h1 className="page-title">📊 Dashboard</h1>
      {user?.role === 'resident' && houses.length > 1 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <label htmlFor="dashboard-house">View house</label>
          <select
            id="dashboard-house"
            value={selectedHouseId}
            onChange={event => setSelectedHouseId(event.target.value)}
            style={{ marginLeft: 10, padding: 8 }}
          >
            <option value="">All linked houses (combined)</option>
            {houses.map(house => {
              const relation = String(house.owner?._id) === String(user.id) ? 'Owner'
                : String(house.tenant?._id) === String(user.id) ? 'Tenant' : '';
              return (
                <option key={house._id} value={house._id}>
                  {house.houseNo} · {house.section}{relation ? ` (${relation})` : ''}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {!selectedHouseId && stats?.perHouse?.length > 1 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>🏠 Breakdown by House</h3></div>
          <table>
            <thead><tr><th>House</th><th>Total Dues</th><th>Paid</th><th>Pending</th></tr></thead>
            <tbody>
              {stats.perHouse.map(h => (
                <tr key={h.houseId}>
                  <td>{h.houseNo} · {h.section}</td>
                  <td>{h.totalDues}</td>
                  <td>{h.paidDues}</td>
                  <td>{h.pendingDues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      <div className="stats-grid">
        {loading ? (
          <SkeletonStatsGrid count={5} />
        ) : (
          <>
        <div className="stat-card blue">
          <h3>Total Dues</h3>
          <div className="value">{stats?.totalDues ?? '—'}</div>
        </div>
        <div className="stat-card green">
          <h3>Paid</h3>
          <div className="value">{stats?.paidDues ?? '—'}</div>
        </div>
        <div className="stat-card orange">
          <h3>Pending</h3>
          <div className="value">{stats?.pendingDues ?? '—'}</div>
        </div>
        <div className="stat-card red">
          <h3>Collection Rate</h3>
          <div className="value">{stats?.collectionRate ?? '—'}%</div>
        </div>
        <div className="stat-card green">
          <h3>Total Collected</h3>
          <div className="value">Rs. {stats?.totalCollected ?? '—'}</div>
        </div>
        </>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div className="card">
          <div className="card-header"><h3>Due Status</h3></div>
          {pieData.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <div className="card-header"><h3>📢 Latest Notices</h3></div>
          {notices.map(n => (
            <div key={n._id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{n.title}</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>{n.type} • {new Date(n.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>
      )}

      {loading ? (
        <SkeletonTable rows={4} columns={4} />
      ) : (
      <div className="card">
        <div className="card-header"><h3>🔧 Recent Complaints</h3></div>
        <table>
          <thead><tr><th>Title</th><th>Category</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>
            {complaints.map(c => (
              <tr key={c._id}>
                <td>{c.title}</td>
                <td>{c.category}</td>
                <td><span className={`status status-${c.priority === 'urgent' ? 'overdue' : c.priority === 'high' ? 'pending' : 'paid'}`}>{c.priority}</span></td>
                <td><span className={`status status-${c.status}`}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}