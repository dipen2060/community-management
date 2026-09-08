import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const emptyPaymentForm = { paymentMethod: 'digital_wallet', paymentReference: '', declaredAmount: '', proof: null };

const formatDate = (value) => value ? new Date(value).toLocaleDateString() : '—';
const effectiveFine = (d) => {
  const storedFine = Number(d.fine || 0);
  if (!['pending', 'overdue'].includes(d.status) || !d.dueDate) return storedFine;
  const dueDate = new Date(d.dueDate);
  const now = new Date();
  if (dueDate >= now) return storedFine;
  const daysLate = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));
  return Math.max(storedFine, daysLate * 10);
};
const totalOf = (d) => Number(d.amount || 0) + effectiveFine(d);
const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;

const statusLabel = (status) => ({
  pending: 'Pending',
  overdue: 'Overdue',
  verification_pending: 'Awaiting Verification',
  paid: 'Paid'
}[status] || status);

const methodLabel = (method) => ({
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  digital_wallet: 'Digital Wallet'
}[method] || method || '—');

export default function Dues() {
  const { user } = useAuth();
  const [dues, setDues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [paymentDue, setPaymentDue] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [submitting, setSubmitting] = useState(false);
  const [reviewDue, setReviewDue] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const isResident = user?.role === 'resident';
  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';
  const isManagement = isAdmin || isStaff;

  const fetchDues = async () => {
    setLoading(true);
    setError('');
    try {
      const params = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await axios.get(`/api/dues${params}`);
      setDues(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load dues.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDues(); }, [filter]);

  const stats = useMemo(() => ({
    outstanding: dues.filter(d => ['pending', 'overdue'].includes(d.status)).reduce((sum, d) => sum + totalOf(d), 0),
    verification: dues.filter(d => d.status === 'verification_pending').length,
    paid: dues.filter(d => d.status === 'paid').length
  }), [dues]);

  const openPaymentModal = (due) => {
    setPaymentDue(due);
    setPaymentForm({ ...emptyPaymentForm, declaredAmount: String(totalOf(due)) });
    setMessage('');
    setError('');
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentForm.proof) {
      setError('Please attach your payment proof.');
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(paymentForm.proof.type)) {
      setError('Only JPG, PNG and PDF files are accepted.');
      return;
    }
    if (paymentForm.proof.size > 5 * 1024 * 1024) {
      setError('Payment proof must be 5 MB or smaller.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('proof', paymentForm.proof);
      formData.append('paymentMethod', paymentForm.paymentMethod);
      formData.append('declaredAmount', paymentForm.declaredAmount);
      if (paymentForm.paymentReference.trim()) formData.append('paymentReference', paymentForm.paymentReference.trim());

      const res = await axios.put(`/api/dues/${paymentDue._id}/submit-payment`, formData);
      setPaymentDue(null);
      setPaymentForm(emptyPaymentForm);
      setMessage(res.data.message || 'Payment proof submitted for verification.');
      await fetchDues();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit payment proof.');
    } finally {
      setSubmitting(false);
    }
  };

  const openReview = (due) => {
    setReviewDue(due);
    setRejectReason('');
    setError('');
  };

  const approve = async () => {
    if (!reviewDue) return;
    if (!window.confirm(`Approve ${money(reviewDue.declaredAmount)} payment for ${reviewDue.house?.houseNo || 'this house'}?`)) return;
    setReviewing(true);
    setError('');
    try {
      const res = await axios.put(`/api/dues/${reviewDue._id}/approve-payment`);
      setReviewDue(null);
      setMessage(res.data.message || 'Payment approved.');
      await fetchDues();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not approve payment.');
    } finally {
      setReviewing(false);
    }
  };

  const reject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      setError('A rejection reason is required.');
      return;
    }
    setReviewing(true);
    setError('');
    try {
      const res = await axios.put(`/api/dues/${reviewDue._id}/reject-payment`, { reason });
      setReviewDue(null);
      setMessage(res.data.message || 'Payment proof rejected.');
      await fetchDues();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reject payment.');
    } finally {
      setReviewing(false);
    }
  };

  const openProof = async (due) => {
    try {
      const response = await axios.get(`/api/dues/${due._id}/proof`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { setError(err.response?.data?.message || 'Could not open payment proof.'); }
  };

  const handleExport = async (type) => {
    try {
      const params = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const response = await axios.get(`/api/exports/dues/${type}${params}`, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: type === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dues-report-${new Date().toISOString().split('T')[0]}.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || `Could not export dues ${type.toUpperCase()}.`);
    }
  };

  const residentName = (d) => {
    const owner = d.house?.owner;
    const tenant = d.house?.tenant;
    if (owner?.name && tenant?.name) return `${owner.name} / ${tenant.name}`;
    return owner?.name || tenant?.name || 'Not linked';
  };

  return (
    <div>
      <div className="dues-heading-row">
        <div>
          <h1 className="page-title">💰 {isResident ? 'My Dues' : 'Dues Management'}</h1>
          <p className="page-subtitle">
            {isResident
              ? 'Only dues for your linked house are shown here. Payment is completed after admin verification.'
              : 'Track every house, resident payment submission, and verification status from one place.'}
          </p>
        </div>
        {isManagement && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={async () => {
              try {
                await axios.post('/api/dues/generate');
                setMessage('Monthly dues checked/generated successfully.');
                await fetchDues();
              } catch (err) {
                setError(err.response?.data?.message || 'Could not generate dues.');
              }
            }}>
              🤖 Generate Monthly Dues
            </button>
            <button type="button" className="btn btn-sm" style={{ background: '#10b981', color: 'white' }} onClick={() => handleExport('excel')}>
              📊 Excel
            </button>
            <button type="button" className="btn btn-sm" style={{ background: '#ef4444', color: 'white' }} onClick={() => handleExport('pdf')}>
              📄 PDF
            </button>
          </div>
        )}
      </div>

      {(message || error) && (
        <div className={error ? 'inline-alert error' : 'inline-alert success'}>
          {error || message}
          <button type="button" onClick={() => { setError(''); setMessage(''); }}>×</button>
        </div>
      )}

      <div className="dues-summary-grid">
        <div className="due-summary-card">
          <span className="summary-label">Outstanding</span>
          <strong>{money(stats.outstanding)}</strong>
          <small>Pending + overdue</small>
        </div>
        <div className="due-summary-card">
          <span className="summary-label">Awaiting Verification</span>
          <strong>{stats.verification}</strong>
          <small>{isAdmin ? 'Payments needing your review' : 'Submitted payment proofs'}</small>
        </div>
        <div className="due-summary-card">
          <span className="summary-label">Paid Records</span>
          <strong>{stats.paid}</strong>
          <small>Verified payments</small>
        </div>
      </div>

      <div className="filter-bar">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="verification_pending">Awaiting Verification</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <div className="card dues-table-card">
        <div className="table-scroll">
          <table className="dues-table">
            <thead>
              <tr>
                <th>House</th>
                {isManagement && <th>Resident</th>}
                <th>Month/Year</th>
                <th>Amount</th>
                <th>Fine</th>
                <th>Total</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isManagement ? 9 : 8} className="table-empty">Loading...</td></tr>
              ) : dues.length === 0 ? (
                <tr><td colSpan={isManagement ? 9 : 8} className="table-empty">No dues found for the selected filter.</td></tr>
              ) : dues.map(d => (
                <tr key={d._id}>
                  <td>
                    <strong>{d.house?.houseNo || 'N/A'}</strong>
                    <small className="cell-subtitle">{d.house?.section || ''}</small>
                  </td>
                  {isManagement && (
                    <td>
                      <strong>{residentName(d)}</strong>
                      <small className="cell-subtitle">
                        {d.house?.owner?.username || d.house?.tenant?.username || 'No linked resident'}
                      </small>
                    </td>
                  )}
                  <td>{d.month}/{d.year}</td>
                  <td>{money(d.amount)}</td>
                  <td className={effectiveFine(d) > 0 ? 'fine-value' : ''}>{money(effectiveFine(d))}</td>
                  <td><strong>{money(totalOf(d))}</strong></td>
                  <td>{formatDate(d.dueDate)}</td>
                  <td>
                    <div className="status-stack">
                      <span className={`status status-${d.status}`}>{statusLabel(d.status)}</span>
                      {d.rejectionReason && d.status !== 'paid' && (
                        <span className="rejection-hint" title={d.rejectionReason}>Rejected: {d.rejectionReason}</span>
                      )}
                    </div>
                  </td>
                  <td className="due-actions-cell">
                    {isResident && ['pending', 'overdue'].includes(d.status) && (
                      <button className="btn btn-success btn-sm" onClick={() => openPaymentModal(d)}>
                        Submit Proof
                      </button>
                    )}
                    {isResident && d.status === 'verification_pending' && (
                      <span className="action-note">Awaiting admin</span>
                    )}
                    {isResident && d.status === 'paid' && (
                      <span className="receipt-label">✅ {d.receiptNo || 'Verified'}</span>
                    )}
                    {isManagement && d.status === 'verification_pending' && (
                      <button className="btn btn-primary btn-sm" onClick={() => openReview(d)}>
                        {isAdmin ? 'Review Proof' : 'View Proof'}
                      </button>
                    )}
                    {isManagement && d.status !== 'verification_pending' && d.status === 'paid' && (
                      <span className="receipt-label">✅ {d.receiptNo || 'Paid'}</span>
                    )}
                    {isManagement && d.status !== 'verification_pending' && d.status !== 'paid' && (
                      <span className="action-note">Resident action required</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isResident && (
          <div className="dues-security-note">
            🔐 You cannot mark a due paid directly. A payment proof is required and an admin verifies it before the receipt is issued.
          </div>
        )}
        {isStaff && (
          <div className="dues-security-note">
            👮 Staff can inspect payment proofs, but only an admin can approve or reject a payment.
          </div>
        )}
      </div>

      {paymentDue && (
        <div className="modal-overlay" onClick={() => !submitting && setPaymentDue(null)}>
          <div className="modal dues-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-top-row">
              <div>
                <h3>Submit Payment Proof</h3>
                <p className="modal-subtitle">{paymentDue.house?.houseNo} · {paymentDue.month}/{paymentDue.year}</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setPaymentDue(null)} disabled={submitting}>×</button>
            </div>

            <div className="payment-detail-box">
              <span>Amount due</span>
              <strong>{money(totalOf(paymentDue))}</strong>
              <small>Includes any applicable fine at the time of submission.</small>
            </div>

            <form onSubmit={handlePaymentSubmit}>
              <div className="form-group">
                <label>Payment Method</label>
                <select value={paymentForm.paymentMethod} onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}>
                  <option value="digital_wallet">Digital Wallet</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount Paid (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentForm.declaredAmount}
                  onChange={e => setPaymentForm({ ...paymentForm, declaredAmount: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Transaction / Receipt Reference <span className="optional-label">(optional)</span></label>
                <input
                  type="text"
                  value={paymentForm.paymentReference}
                  onChange={e => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })}
                  placeholder="e.g. transaction ID or receipt no."
                  maxLength="120"
                />
              </div>
              <div className="form-group">
                <label>Payment Proof <span className="required-label">*</span></label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={e => setPaymentForm({ ...paymentForm, proof: e.target.files?.[0] || null })}
                  required
                />
                <p className="input-help">JPG, PNG or PDF · maximum 5 MB. Upload a clear bank/wallet receipt or cash receipt.</p>
              </div>
              {error && <div className="form-error">{error}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setPaymentDue(null)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit for Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewDue && (
        <div className="modal-overlay" onClick={() => !reviewing && setReviewDue(null)}>
          <div className="modal dues-review-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-top-row">
              <div>
                <h3>Payment Proof Review</h3>
                <p className="modal-subtitle">{reviewDue.house?.houseNo} · {reviewDue.month}/{reviewDue.year}</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setReviewDue(null)} disabled={reviewing}>×</button>
            </div>

            <div className="review-grid">
              <div><span>Resident</span><strong>{residentName(reviewDue)}</strong></div>
              <div><span>Payment Method</span><strong>{methodLabel(reviewDue.paymentMethod)}</strong></div>
              <div><span>Amount Due</span><strong>{money(totalOf(reviewDue))}</strong></div>
              <div><span>Amount Declared</span><strong>{money(reviewDue.declaredAmount)}</strong></div>
              <div><span>Submitted</span><strong>{formatDate(reviewDue.paymentSubmittedAt)}</strong></div>
              <div><span>Reference</span><strong>{reviewDue.paymentReference || '—'}</strong></div>
            </div>

            {reviewDue.paymentProof ? (
              <div className="proof-box">
                <div className="proof-header">
                  <div>
                    <strong>Uploaded Proof</strong>
                    <small>{reviewDue.paymentProof.originalName}</small>
                  </div>
                  <button type="button" className="btn btn-sm proof-open" onClick={() => openProof(reviewDue)}>Open Full Proof ↗</button>
                </div>
                {reviewDue.paymentProof.mimeType?.startsWith('image/') ? (
                  <button type="button" className="btn btn-sm proof-open" onClick={() => openProof(reviewDue)}>🔐 View Uploaded Proof Securely</button>
                ) : (
                  <div className="pdf-placeholder">📄 PDF proof uploaded. Use “Open Full Proof” to view it.</div>
                )}
              </div>
            ) : (
              <div className="form-error">No payment proof file is attached.</div>
            )}

            {isAdmin ? (
              <>
                <div className="form-group review-reason-group">
                  <label>Rejection Reason <span className="optional-label">(required only when rejecting)</span></label>
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows="3" placeholder="e.g. Receipt is unreadable or amount does not match." maxLength="500" />
                </div>
                {error && <div className="form-error">{error}</div>}
                <div className="modal-actions review-actions">
                  <button type="button" className="btn btn-cancel" onClick={() => setReviewDue(null)} disabled={reviewing}>Close</button>
                  <button type="button" className="btn btn-danger" onClick={reject} disabled={reviewing}>Reject Proof</button>
                  <button type="button" className="btn btn-success" onClick={approve} disabled={reviewing}>Approve & Generate Receipt</button>
                </div>
              </>
            ) : (
              <div className="dues-security-note">Staff access is read-only for payment verification. Admin approval is required.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
