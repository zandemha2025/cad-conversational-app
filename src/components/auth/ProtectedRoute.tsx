import React from 'react';
import { Navigate } from 'react-router-dom';
import { getAuthToken } from '../../lib/storage';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const token = getAuthToken();
  if (!token) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
