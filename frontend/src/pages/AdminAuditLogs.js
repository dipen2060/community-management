import { useEffect, useState } from 'react';
import axios from 'axios';
import Pagination from '../components/Pagination';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [actors, setActors] = useState([]);
  const [filters, setFilters] = useState({ actor: '', action: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLogs = async (selectedPage = page) => {
    const params = new URLSearchParams({ page: selectedPage, limit: 20 });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const response = await axios.get(`/api/audit-logs?${params.toString()}`);
    setLogs(response.data.data || []);
    setPages(response.data.pages || 1);
    setTotal(response.data.total || 0);
  };

  useEffect(() => {
    axios.get('/api/users').then(response => {
      setActors(response.data.data || []);
    });
  }, []);

  useEffect(() => {
    fetchLogs(page).catch(() => setLogs([]));
  }, [page, filters]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters(previous => ({ ...previous, [key]: value }));
  };

  return (
    <div className="min-w-0 w-full">
      <h1 className="page-title">🧾 Audit Logs</h1>
      <div className="card mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <select className="w-full min-w-0 sm:w-auto" value={filters.actor} onChange={event => updateFilter('actor', event.target.value)}>
          <option value="">All actors</option>
          {actors.map(actor => <option key={actor._id} value={actor._id}>{actor.name} ({actor.role})</option>)}
        </select>
        <input className="w-full min-w-0 sm:w-auto" placeholder="Action type" value={filters.action} onChange={event => updateFilter('action', event.target.value)} />
        <label className="flex items-center gap-2">From <input className="min-w-0 flex-1 sm:flex-none" type="date" value={filters.from} onChange={event => updateFilter('from', event.target.value)} /></label>
        <label className="flex items-center gap-2">To <input className="min-w-0 flex-1 sm:flex-none" type="date" value={filters.to} onChange={event => updateFilter('to', event.target.value)} /></label>
      </div>

      <div className="card">
        <div className="w-full overflow-x-auto">
          <table className="min-w-[720px]">
            <thead>
              <tr><th>Date</th><th>Actor</th><th>Role</th><th>Action</th><th>Target</th><th>Details</th></tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log._id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.actor_id?.name || log.actor_id?.username || log.actor_id}</td>
                  <td>{log.actor_role}</td>
                  <td>{log.action}</td>
                  <td>{log.target_type} / {log.target_id}</td>
                  <td><code>{JSON.stringify(log.details)}</code></td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan="6">No audit logs found.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pages} total={total} onChange={setPage} />
      </div>
    </div>
  );
}
