import { createContext, useContext, useEffect, useState } from "react";
import apiClient from "../lib/apiClient";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const verifyToken = async (token) => {
    try {
      const response = await apiClient.get(`${import.meta.env.VITE_API_BASE_URL}/auth/profile`);
      return response.data;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem("accessToken");
      if (token) {
        const profile = await verifyToken(token);
        if (profile?.success) {
          setUser({ token, ...profile.data });
        } else {
          localStorage.removeItem("accessToken");
        }
      }
      setLoading(false);
    };
    initializeAuth();
  }, []);

  const login = async (email, password) => {
    const res = await apiClient.post(`${import.meta.env.VITE_API_BASE_URL}/auth/login`, { email, password });
    if (res.data.success) {
      const data = res.data.data;

      // Check if 2FA is required
      if (data.requires2FA) {
        return {
          requires2FA: true,
          setupRequired: data.setupRequired,
          challengeId: data.challengeId,
          qrCode: data.qrCode || null,
        };
      }

      // Normal login — no 2FA
      const token = data.accessToken;
      localStorage.setItem("accessToken", token);
      const profile = await verifyToken(token);
      setUser({ token, ...profile.data });
      return { requires2FA: false };
    }
  };

  const verify2fa = async (challengeId, code) => {
    const res = await apiClient.post(`${import.meta.env.VITE_API_BASE_URL}/auth/login/verify-2fa`, {
      challengeId,
      code,
    });
    if (res.data.success) {
      const token = res.data.data.accessToken;
      const recoveryCodes = res.data.data.recoveryCodes;
      localStorage.setItem("accessToken", token);
      const profile = await verifyToken(token);
      
      if (recoveryCodes) {
        return { recoveryCodes, token, profile: profile.data };
      }
      
      setUser({ token, ...profile.data });
      return { success: true };
    }
  };

  const completeLogin = (token, profileData) => {
    setUser({ token, ...profileData });
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, verify2fa, completeLogin, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
