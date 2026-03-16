import React from 'react';
import { Navigate } from 'react-router-dom';
import { IS_DEMO } from '../../lib/api';
import { getAuthToken } from '../../lib/storage';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  // In demo mode, always allow access
  if (IS_DEMO) return <>{children}</>;

  const token = getAuthToken();
  if (!token) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
