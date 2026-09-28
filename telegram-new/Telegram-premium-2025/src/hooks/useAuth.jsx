import { useState, useEffect } from "react";
import axios from "axios";

export const useAuthInternal = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Function to verify token validity
  const verifyToken = async (token) => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return response.data;
    } catch (error) {
      return false;
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem("accessToken");
      if (token) {
        const profile = await verifyToken(token);
        if (profile?.success) {
          setUser({
            token,
            ...profile.data // includes email, firstName, lastName, etc.
          });
        } else {
          localStorage.removeItem("accessToken");
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/login`, {
        email,
        password
      });

      if (response.data.success) {
        const token = response.data.data.accessToken;
        localStorage.setItem("accessToken", token);

        // Fetch user profile
        const profile = await verifyToken(token);

        setUser({
          token,
          ...profile.data
        });

        return true;
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
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/auth/signup`, {
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

  const logout = () => {
    localStorage.removeItem("accessToken");
    setUser(null);
  };

  return {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    signup,
    logout,
    verifyToken
  };
};