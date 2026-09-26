import { useState, useEffect } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function Clusters() {
  const [clusters, setClusters] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    axios.get('/api/dues/clusters')
      .then(r => { setClusters(r.data.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const clusterClasses = ['cluster-regular', 'cluster-late', 'cluster-defaulter'];

  // Prepare data for charts
  const pieData = clusters.map((group, i) => ({
    name: group.label,
    value: group.residents?.length || 0,
    color: ['#22c55e', '#eab308', '#ef4444'][i] // green, yellow, red
  }));

  const barData = clusters.map((group, i) => ({
    name: group.label,
    residents: group.residents?.length || 0,
    avgLateDues: group.residents?.reduce((sum, r) => sum + (r.lateDues || 0), 0) / (group.residents?.length || 1),
    avgComplaints: group.residents?.reduce((sum, r) => sum + (r.complaintCount || 0), 0) / (group.residents?.length || 1)
  }));

  return (
    <div>
      <h1 className="page-title">🤖 AI Payment Behavior Clusters</h1>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Running AI algorithm...</div>
      ) : clusters.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          No data yet. Add houses and dues first, then check clusters.
        </div>
      ) : (
        <>
          {/* Visual Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 24 }}>
            {/* Pie Chart */}
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>📊 Cluster Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Bar Chart */}
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>📈 Residents, Late Dues &amp; Complaints</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="residents" fill="#3b82f6" name="Residents" />
                  <Bar dataKey="avgLateDues" fill="#ef4444" name="Avg Late Dues" />
                  <Bar dataKey="avgComplaints" fill="#a855f7" name="Avg Complaints" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Cluster Cards */}
          <h3 style={{ marginBottom: 16 }}>📋 Detailed Cluster Information</h3>
          <div style={{ display: 'grid', gap: 16 }}>
            {clusters.map((group, i) => (
              <div key={i} className={`cluster-card ${clusterClasses[i] || ''}`}>
                <h4>{group.label} — {group.residents?.length || 0} residents</h4>
                <div>
                  {group.residents?.map((r, j) => (
                    <span key={j} className="resident-pill">
                      🏠 {r.houseNo} — {r.owner}
                      {r.lateDues > 0 && <span style={{ color: '#ef4444' }}> ({r.lateDues} late)</span>}
                      {r.complaintCount > 0 && <span style={{ color: '#a855f7' }}> ({r.complaintCount} complaints)</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}