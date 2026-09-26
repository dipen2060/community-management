import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

// Rendered from Layout.js whenever user.mustChangePassword is true (set on
// every admin-created account). Blocks the rest of the app with an overlay
// until the temporary password is replaced — the old behavior just silently
// redirected to /profile with no explanation, which looked like a bug.
export default function MustChangePasswordModal() {
  const { setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.put('/api/users/me/profile', { currentPassword, newPassword });
      setUser(res.data.data); // clears mustChangePassword app-wide, modal closes itself
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password. Check your temporary password and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2000 }}>
      <div className="modal">
        <h3>🔒 Set a New Password</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Your account was created with a temporary password. For security, you must set your own password before continuing.
        </p>
        {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Temporary Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="The password you were given"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
            />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Set Password & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}