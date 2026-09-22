import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();
const USER_STORAGE_KEY = 'authUser';

export const useAuth = () => useContext(AuthContext);

const readCachedUser = () => {
  const cachedUser = localStorage.getItem(USER_STORAGE_KEY);
  if (!cachedUser) return null;

  try {
    return JSON.parse(cachedUser);
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readCachedUser);
  const [loading, setLoading] = useState(
    () => !localStorage.getItem('token') || !localStorage.getItem(USER_STORAGE_KEY)
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      localStorage.removeItem(USER_STORAGE_KEY);
      setUser(null);
      setLoading(false);
      return undefined;
    }

    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    let cancelled = false;

    // A cached user makes reloads instant while the token is still verified.
    axios.get('/api/auth/me')
      .then(res => {
        if (!cancelled) {
          setUser(res.data.user);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.data.user));
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem('token');
          localStorage.removeItem(USER_STORAGE_KEY);
          delete axios.defaults.headers.common.Authorization;
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email, password) => {
    const res = await axios.post('/api/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.data.user));
    axios.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem(USER_STORAGE_KEY);
    delete axios.defaults.headers.common.Authorization;
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
