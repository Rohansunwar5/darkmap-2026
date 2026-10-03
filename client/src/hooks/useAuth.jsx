import { useState, useEffect } from "react";
import axios from "axios";

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const verifyToken = async (token) => {
    try {
      const response = await axios.get('https://api.darkmap.org/auth/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.data.success;
    } catch (error) {
      return false;
    }
  };

  const verifyAdminToken = async (token) => {
    try {
      const response = await axios.get('https://api.darkmap.org/admin/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.data.success;
    } catch (error) {
      return false;
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem("accessToken");
      const role = localStorage.getItem("role");
      if (token) {
        let isValid = false;
        if (role === 'admin') {
           isValid = await verifyAdminToken(token);
        } else {
           isValid = await verifyToken(token);
        }
        
        if (isValid) {
          setUser({ token, role });
        } else {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("role");
        }
      }
      setLoading(false);
    };
    
    initializeAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await axios.post('https://api.darkmap.org/auth/login', {
        email,
        password
      });

      if (response.data.success) {
        localStorage.setItem("accessToken", response.data.data.accessToken);
        if (response.data.data.role) {
           localStorage.setItem("role", response.data.data.role);
        }
        setUser({ token: response.data.data.accessToken, role: response.data.data.role });
        return response.data.data.role || true;
      } else {
        throw new Error(response.data.message);
      }
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const signup = async (firstName, lastName, email, password) => {
    try {
      const response = await axios.post('https://api.darkmap.org/auth/signup', {
        firstName,
        lastName,
        email,
        password
      });

      if (response.data.success) {
        return true;
      } else {
        throw new Error(response.data.message);
      }
    } catch (error) {
      console.error("Signup failed:", error);
      throw error;
    }
  };

  const getAllUsers = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const response = await axios.get('https://api.darkmap.org/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.data.success) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error("Failed to fetch users:", error);
      return [];
    }
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("role");
    setUser(null);
  };

  return { 
    user, 
    loading, 
    isAuthenticated: !!user,
    login, 
    signup, 
    logout,
    verifyToken,
    verifyAdminToken,
    getAllUsers
  };
};