import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AdminPrivateRoute = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-900 text-white">Loading...</div>;
  }

  // If not authenticated or role is not admin, redirect to /generic
  if (!isAuthenticated || user?.role !== 'admin') {
    return <Navigate to="/generic" />;
  }

  return children;
};

export default AdminPrivateRoute;
