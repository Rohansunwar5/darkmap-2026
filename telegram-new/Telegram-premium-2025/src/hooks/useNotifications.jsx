import { useCallback } from 'react';
import apiClient from '../lib/apiClient';

const BASE = `${import.meta.env.VITE_API_BASE_URL}/notifications`;

/**
 * Hook wrapping the notification REST endpoints.
 */
export function useNotifications() {
  const fetchNotifications = useCallback(async (limit = 20, skip = 0, unreadOnly = false) => {
    const res = await apiClient.get(BASE, {
      params: { limit, skip, unreadOnly },
    });
    return {
      notifications: res.data.data?.notifications ?? [],
      unreadCount: res.data.data?.unreadCount ?? 0,
    };
  }, []);

  const markAsRead = useCallback(async (id) => {
    await apiClient.patch(`${BASE}/${id}/read`, {});
  }, []);

  const markAllAsRead = useCallback(async () => {
    await apiClient.patch(`${BASE}/read-all`, {});
  }, []);

  return { fetchNotifications, markAsRead, markAllAsRead };
}
