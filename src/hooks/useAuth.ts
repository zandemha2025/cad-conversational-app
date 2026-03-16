import { useState, useCallback } from 'react';
import { login as apiLogin, register as apiRegister, IS_DEMO } from '../lib/api';
import { getAuthToken, setAuthToken, clearAuthToken } from '../lib/storage';

export interface AuthUser {
  email: string;
  name: string;
}

const DEMO_USER: AuthUser = { email: 'demo@scalecad.io', name: 'Demo Engineer' };

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (IS_DEMO) return DEMO_USER;
    const token = getAuthToken();
    if (!token) return null;
    // Decode name/email from JWT payload (no verification needed client-side)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return { email: payload.email ?? '', name: payload.name ?? payload.email ?? '' };
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiLogin(email, password);
      if (!res) {
        setError('Invalid credentials');
        return false;
      }
      setAuthToken(res.access_token);
      setUser({ email, name: email.split('@')[0] });
      return true;
    } catch {
      setError('Login failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRegister(email, password, fullName);
      if (!res) {
        setError('Registration failed');
        return false;
      }
      // Auto-login after register
      return await login(email, password);
    } catch {
      setError('Registration failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [login]);

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
  }, []);

  return { user, loading, error, login, register, logout };
}
