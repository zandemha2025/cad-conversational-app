import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { IS_DEMO } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const { login, register, loading, error } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let ok: boolean;
    if (mode === 'register') {
      ok = await register(email, password, fullName);
    } else {
      ok = await login(email, password);
    }
    if (ok) navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="text-white font-semibold text-xl">ScaleCAD</span>
          </div>
          <p className="text-gray-400 text-sm">AI-powered fixture design for manufacturing</p>
        </div>

        {IS_DEMO && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6 text-center">
            <p className="text-amber-400 text-xs font-medium">Demo Mode — No backend connected</p>
            <p className="text-amber-300/70 text-xs mt-1">Sign in with any credentials to continue</p>
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          {/* Tab switcher */}
          <div className="flex bg-gray-800 rounded-lg p-1 mb-6">
            <button
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'login' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('login')}
            >
              Sign In
            </button>
            <button
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'register' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('register')}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="engineer@company.com"
                required={!IS_DEMO}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required={!IS_DEMO}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium py-2 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Please wait…' : IS_DEMO ? 'Continue to Demo' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          ScaleCAD — ITAR-Aware Manufacturing Design Platform
        </p>
      </div>
    </div>
  );
}
