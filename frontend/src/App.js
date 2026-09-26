import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login      from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import Dashboard  from './pages/Dashboard';
import Houses     from './pages/Houses';
import Dues       from './pages/Dues';
import Complaints from './pages/Complaints';
import Notices    from './pages/Notices';
import Clusters   from './pages/Clusters';
import Staff      from './pages/Staff';
import Polls      from './pages/Polls';
import Profile    from './pages/Profile';
import AdminAuditLogs from './pages/AdminAuditLogs';
import Layout     from './components/Layout';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  // mustChangePassword is now enforced by MustChangePasswordModal in Layout.js
  // (a blocking overlay) rather than a silent redirect to /profile.
  return children;
};

// Role-aware guard. Wrap any route that the backend also restricts by role
// (e.g. authorize('admin') on the matching API route) so unauthorized users
// get redirected to the dashboard instead of seeing a broken/empty page.
const RoleRoute = ({ roles, children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index          element={<Dashboard />} />
            <Route path="houses"     element={<Houses />} />
            <Route path="dues"       element={<Dues />} />
            <Route path="complaints" element={<Complaints />} />
            <Route path="notices"    element={<Notices />} />
            <Route
              path="clusters"
              element={<RoleRoute roles={['admin']}><Clusters /></RoleRoute>}
            />
            <Route path="staff"      element={<Staff />} />
            <Route path="polls"      element={<Polls />} />
            <Route path="profile"    element={<Profile />} />
            <Route path="admin/audit-logs" element={<RoleRoute roles={['admin']}><AdminAuditLogs /></RoleRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}