import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('adminToken');

            if (token) {
                try {
                    // Verify token or get profile if endpoint exists
                    const response = await api.get('/admin/profile');
                    setUser(response.data);
                } catch (error) {
                    console.error('Auth check failed', error);
                    localStorage.removeItem('adminToken');
                }
            }
            setLoading(false);
        };

        checkAuth();
    }, []);

    const login = async (email, password) => {
        try {
            const response = await api.post('/admin/login', { email, password });

            // Extract token based on nested structure: { data: { accessToken: "..." } }
            const token = response.data?.data?.accessToken ||
                response.data?.accessToken ||
                response.data?.token ||
                response.data?.adminToken ||
                response.data?.access_token;

            if (!token) {
                console.warn('Token not found. Response:', response.data);
                throw new Error("Token not found in response");
            }

            localStorage.setItem('adminToken', token);

            // If the login response doesn't include user data, might need to fetch profile
            // But assuming response.data has user details based on typical patterns
            // If not, we fetch profile:
            try {
                const profileRes = await api.get('/admin/profile');
                setUser(profileRes.data);
            } catch (e) {
                // Fallback if profile fetch fails but login succeeded (rare)
                setUser({ email });
            }

            toast.success('Access Granted. Welcome, Admin.');
            return true;
        } catch (error) {
            console.error('Login error', error);
            const message = error.message === "Token not found in response"
                ? "Login failed: System verification error (Token Missing)"
                : (error.response?.data?.message || 'Access Denied: Invalid Credentials');
            toast.error(message);
            return false;
        }
    };

    const signup = async (data) => {
        try {
            await api.post('/admin/signup', data);
            toast.success('Registration Successful. Please Login.');
            return true;
        } catch (error) {
            console.error('Signup error', error);
            toast.error(error.response?.data?.message || 'Registration Failed');
            return false;
        }
    };

    const logout = () => {
        localStorage.removeItem('adminToken');
        setUser(null);
        toast.success('Session Terminated.');
    };

    return (
        <AuthContext.Provider value={{ user, login, signup, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
