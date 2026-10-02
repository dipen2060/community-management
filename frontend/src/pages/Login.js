import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../components/Layout.css';

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { login }   = useAuth();
  const navigate    = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      const status = err.response?.status;
      const responseError = err.response?.data?.message || err.response?.data?.error;

      if (status === 429) {
        setError(responseError || 'Too many login attempts. Please try again later.');
      } else if (status === 403) {
        setError('Your account is deactivated. Please contact the admin.');
      } else if (status === 401) {
        setError('Invalid email or password.');
      } else if (status === 400 && Array.isArray(err.response.data?.errors)) {
        setError(err.response.data.errors[0]?.message || responseError || 'Please check your input.');
      } else {
        setError(responseError || 'An unexpected error occurred. Please try again.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🏘️ Tole Management</h1>
        <p>Community Management System</p>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 12, fontSize: '0.8rem', color: '#6b7280' }}>
            Password resets are handled by your neighborhood admin.
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}