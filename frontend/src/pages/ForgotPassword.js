import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import '../components/Layout.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await axios.post('/api/auth/forgot-password', { email });
      setMessage(res.data.message || 'If an account exists for that email, a reset link has been sent.');
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🔑 Forgot Password</h1>
        <p>Enter your email and we'll send you a reset link</p>
        {error && <div className="error-msg">{error}</div>}
        {message && (
          <div className="hint-box">
            <p>{message}</p>
          </div>
        )}
        {!submitted && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}
        <p style={{ textAlign: 'center', marginTop: 20 }}>
          <Link to="/login" style={{ fontSize: '0.85rem', color: '#6b7280' }}>← Back to login</Link>
        </p>
      </div>
    </div>
  );
}