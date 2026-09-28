import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function SuperAdminRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" />;
    }

    if (user.isSuperAdmin !== true) {
        return <Navigate to="/" />;
    }

    return children;
}
