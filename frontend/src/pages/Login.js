import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../components/Layout.css';

export default function Login() {
  const [email,    setEmail]    = useState('admin@tole.com');
  const [password, setPassword] = useState('admin@123');
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
    } catch {
      setError('Invalid email or password');
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
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <div className="hint-box">
          <strong>Test Accounts (email / password):</strong>
          <p>Admin:  admin@tole.com / admin@123</p>
          <p>Plumber: plumber@tole.com / krishna@123</p>
          <p>Electrician: electrician@tole.com / bishnu@123</p>
          <p>Resident: ram@tole.com / ram@123</p>
        </div>
      </div>
    </div>
  );
}
