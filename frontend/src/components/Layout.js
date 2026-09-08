import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';
  const isAdminOrStaff = isAdmin || isStaff;

  const fetchNotifications = async () => {
    try {
      const res = await axios.get('/api/notifications');
      setNotifications(res.data.data || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      // Silently ignore if not logged in or network error
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await axios.put('/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark notifications as read', err);
    }
  };

  const handleNotifClick = async (notif) => {
    try {
      if (!notif.isRead) {
        await axios.put(`/api/notifications/${notif._id}/read`);
        setNotifications(prev =>
          prev.map(n => (n._id === notif._id ? { ...n, isRead: true } : n))
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to mark notification read', err);
    }
    setShowNotifs(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'due': return '💰';
      case 'overdue': return '⚠️';
      case 'complaint': return '🔧';
      case 'notice': return '📢';
      default: return '🔔';
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMin = Math.floor((now - date) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return date.toLocaleDateString();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>🏘️ Tole</h2>
          <p>Community Management</p>
        </div>

        <nav>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            📊 Dashboard
          </NavLink>
          <NavLink
            to="/houses"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            🏠 Houses
          </NavLink>
          <NavLink
            to="/dues"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            💰 Dues
          </NavLink>
          <NavLink
            to="/complaints"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            🔧 Complaints
          </NavLink>
          <NavLink
            to="/notices"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            📢 Notices
          </NavLink>
          {isAdminOrStaff && (
            <NavLink
              to="/clusters"
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              🤖 AI Clusters
            </NavLink>
          )}
          <NavLink
            to="/staff"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            {isAdmin ? '👥 User Management' : '👷 Staff Directory'}
          </NavLink>
          <NavLink
            to="/polls"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            🗳️ Community Polls
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            👤 My Profile
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-name">{user?.name || 'User'}</div>
          {user?.role && (
            <span className={`badge badge-${user.role}`}>{user.role}</span>
          )}
          <button type="button" className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Topbar with Notification Bell */}
        <div className="topbar">
          <div className="notif-wrapper" ref={notifRef}>
            <button
              type="button"
              className="notif-bell"
              onClick={() => setShowNotifs(!showNotifs)}
              aria-label="Notifications"
            >
              🔔
              {unreadCount > 0 && (
                <span className="notif-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="notif-dropdown">
                <div className="notif-header">
                  <h4>Notifications</h4>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="notif-mark-all"
                      onClick={handleMarkAllRead}
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="notif-list">
                  {notifications.length === 0 ? (
                    <div className="notif-empty">No notifications yet</div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n._id}
                        className={`notif-item${n.isRead ? '' : ' unread'}`}
                        onClick={() => handleNotifClick(n)}
                      >
                        <span className="notif-icon">{getNotifIcon(n.type)}</span>
                        <div className="notif-content">
                          <div className="notif-title">{n.title}</div>
                          <div className="notif-message">{n.message}</div>
                          <div className="notif-time">{formatTime(n.createdAt)}</div>
                        </div>
                        {!n.isRead && <span className="notif-dot" />}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Child Route Content */}
        <Outlet />
      </main>
    </div>
  );
}
