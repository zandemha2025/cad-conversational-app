import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import TopBar from './components/layout/TopBar';
import Home from './pages/Home';
import Workspace from './pages/Workspace';
import SharedView from './pages/SharedView';
import Settings from './pages/Settings';
import Login from './pages/Login';
import OrgSettings from './pages/OrgSettings';
import AuditLog from './pages/AuditLog';
import Analytics from './pages/Analytics';
import ProtectedRoute from './components/auth/ProtectedRoute';

const FULL_SCREEN_ROUTES = ['/settings', '/login', '/org-settings', '/audit-log', '/analytics'];

function AppInner() {
  const location = useLocation();
  const isWorkspace = location.pathname.startsWith('/workspace');
  const isShared = location.pathname.startsWith('/shared');
  const isFullScreen = FULL_SCREEN_ROUTES.includes(location.pathname);

  // SharedView is fully self-contained — no TopBar, no auth required
  if (isShared) {
    return (
      <Routes>
        <Route path="/shared/:token" element={<SharedView />} />
      </Routes>
    );
  }

  if (isFullScreen) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/org-settings" element={<ProtectedRoute><OrgSettings /></ProtectedRoute>} />
        <Route path="/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      </Routes>
    );
  }

  return (
    <div className="flex flex-col h-full bg-cadsurface-950">
      {!isWorkspace && <TopBar />}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/workspace/new" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
          <Route path="/workspace/:id" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/login" element={<Login />} />
          <Route path="/org-settings" element={<ProtectedRoute><OrgSettings /></ProtectedRoute>} />
          <Route path="/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
