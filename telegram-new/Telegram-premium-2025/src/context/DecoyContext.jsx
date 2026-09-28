import { createContext, useContext, useState, useCallback } from 'react';
import apiClient from '../lib/apiClient';

const BASE = `${import.meta.env.VITE_API_BASE_URL}/ai-chatbot`;

const DecoyContext = createContext();

export function DecoyProvider({ children }) {
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState(null);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const res = await apiClient.get(BASE);
      const fetchedSessions = res.data.data?.sessions ?? [];
      setSessions(fetchedSessions);
      return fetchedSessions;
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const createSession = useCallback(async ({ targetIdentifier, targetContext, targetName, decoyAccountId }) => {
    const res = await apiClient.post(BASE, { targetIdentifier, targetContext, targetName, decoyAccountId });
    setSessions((prev) => [res.data.data.session, ...prev]);
    return res.data.data.session;
  }, []);

  const fetchAccounts = useCallback(async () => {
    const res = await apiClient.get(`${BASE}/accounts`);
    return res.data.data?.accounts ?? [];
  }, []);

  const fetchMessages = useCallback(async (sessionId) => {
    const res = await apiClient.get(`${BASE}/${sessionId}/messages`);
    return res.data.data?.messages ?? [];
  }, []);

  const pauseSession = useCallback(async (sessionId) => {
    await apiClient.post(`${BASE}/${sessionId}/stop`, {});
    setSessions((prev) =>
      prev.map((s) => (s._id === sessionId ? { ...s, status: 'paused' } : s))
    );
  }, []);

  const resumeSession = useCallback(async (sessionId) => {
    await apiClient.post(`${BASE}/${sessionId}/resume`, {});
    setSessions((prev) =>
      prev.map((s) => (s._id === sessionId ? { ...s, status: 'active' } : s))
    );
  }, []);

  const manualSend = useCallback(async (sessionId, message) => {
    const res = await apiClient.post(
      `${BASE}/${sessionId}/send`,
      { message }
    );
    return res.data.data?.message;
  }, []);

  const setObjective = useCallback(async (sessionId, objective) => {
    const res = await apiClient.put(
      `${BASE}/${sessionId}/objective`,
      { objective }
    );
    return res.data.data?.objective ?? objective;
  }, []);

  const clearObjective = useCallback(async (sessionId) => {
    await apiClient.delete(`${BASE}/${sessionId}/objective`);
  }, []);

  const sendNudge = useCallback(async (sessionId, nudge) => {
    const res = await apiClient.post(
      `${BASE}/${sessionId}/nudge`,
      { nudge }
    );
    return res.data.data?.nudge ?? nudge;
  }, []);

  const markSessionRead = useCallback(async (sessionId) => {
    try {
      await apiClient.post(`${BASE}/${sessionId}/unseemsg`, {});
    } catch (err) {
      console.error('Failed to mark session as read', err);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId) => {
    await apiClient.delete(`${BASE}/${sessionId}`);
    setSessions((prev) => prev.filter((s) => s._id !== sessionId));
  }, []);

  return (
    <DecoyContext.Provider value={{
      sessions,
      loadingSessions,
      error,
      fetchSessions,
      createSession,
      fetchAccounts,
      fetchMessages,
      pauseSession,
      resumeSession,
      manualSend,
      setObjective,
      clearObjective,
      sendNudge,
      markSessionRead,
      deleteSession,
    }}>
      {children}
    </DecoyContext.Provider>
  );
}

export const useDecoy = () => {
  const ctx = useContext(DecoyContext);
  if (!ctx) throw new Error('useDecoy must be used within DecoyProvider');
  return ctx;
};
