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
    avgLateDues: group.residents?.reduce((sum, r) => sum + (r.lateDues || 0), 0) / (group.residents?.length || 1)
  }));

  return (
    <div>
      <h1 className="page-title">🤖 AI Payment Behavior Clusters</h1>
      <div className="card" style={{ background: '#f0f9ff', border: '1px solid #bae6fd', marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>ℹ️ K-Means Clustering Algorithm</h3>
        <p style={{ fontSize: '0.875rem', color: '#0369a1' }}>
          Yo page ma <strong>K-Means Clustering</strong> algorithm use garera residents lai uniharu ko payment behavior anusar
          3 group ma classify gareko cha — Regular Payer, Late Payer, ra Defaulter.
          Yo data use garera admin le targeted reminders pathauна sakcha.
        </p>
      </div>

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
              <h3 style={{ marginBottom: 16 }}>📈 Residents vs Avg Late Dues</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="residents" fill="#3b82f6" name="Residents" />
                  <Bar dataKey="avgLateDues" fill="#ef4444" name="Avg Late Dues" />
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
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 24, background: '#fefce8', border: '1px solid #fde047' }}>
        <h3 style={{ marginBottom: 12 }}>🧠 Content-Based Filtering</h3>
        <p style={{ fontSize: '0.875rem', color: '#713f12' }}>
          Complaint submit garda system le automatically TF-IDF + Cosine Similarity use garera similar past complaints
          suggest garcha — resolution faster huncha!
          <br /><strong>Try it:</strong> Complaints page ma "paani" related complaint submit gara.
        </p>
      </div>
    </div>
  );
}
