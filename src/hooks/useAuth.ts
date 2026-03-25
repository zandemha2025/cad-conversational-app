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
      const email = payload.email ?? '';
      const name = payload.name ?? payload.full_name ?? payload.user_metadata?.full_name ?? email.split('@')[0] ?? '';
      return { email, name };
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string, nameHint?: string) => {
    if (IS_DEMO) return true;
    setLoading(true);
    setError(null);
    try {
      const res = await apiLogin(email, password);
      if (!res) {
        setError('Invalid credentials');
        return false;
      }
      setAuthToken(res.access_token);
      // Try to extract name from JWT payload; fall back to hint or email prefix
      let name = nameHint ?? email.split('@')[0];
      try {
        const payload = JSON.parse(atob(res.access_token.split('.')[1]));
        name = payload.name ?? payload.full_name ?? nameHint ?? email.split('@')[0];
      } catch { /* ignore decode errors */ }
      setUser({ email, name });
      return true;
    } catch {
      setError('Login failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    if (IS_DEMO) return true;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRegister(email, password, fullName);
      if (!res) {
        setError('Registration failed');
        return false;
      }
      // Auto-login after register, passing fullName as hint so name displays immediately
      return await login(email, password, fullName);
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
