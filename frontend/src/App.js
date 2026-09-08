import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login      from './pages/Login';
import Dashboard  from './pages/Dashboard';
import Houses     from './pages/Houses';
import Dues       from './pages/Dues';
import Complaints from './pages/Complaints';
import Notices    from './pages/Notices';
import Clusters   from './pages/Clusters';
import Staff      from './pages/Staff';
import Polls      from './pages/Polls';
import Profile    from './pages/Profile';
import Layout     from './components/Layout';

const PrivateRoute = ({ children }) => {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index          element={<Dashboard />} />
            <Route path="houses"     element={<Houses />} />
            <Route path="dues"       element={<Dues />} />
            <Route path="complaints" element={<Complaints />} />
            <Route path="notices"    element={<Notices />} />
            <Route path="clusters"   element={<Clusters />} />
            <Route path="staff"      element={<Staff />} />
            <Route path="polls"      element={<Polls />} />
            <Route path="profile"    element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
