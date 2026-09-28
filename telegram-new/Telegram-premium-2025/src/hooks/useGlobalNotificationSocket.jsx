import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL;

export function useGlobalNotificationSocket({ onNotification }) {
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    socket.on('notification:new', (payload) => {
      onNotificationRef.current?.(payload);

      // Desktop notification — only for message transfers (inbound & outbound)
      if (payload.type === 'new_message') {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(payload.title || 'New Message', {
            body: payload.body || '',
            icon: '/logo.png',
            tag: `notif-${payload._id}`, // prevent duplicate OS notifications
          });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              new Notification(payload.title || 'New Message', {
                body: payload.body || '',
                icon: '/logo.png',
                tag: `notif-${payload._id}`,
              });
            }
          });
        }
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // Single connection for the lifetime of the page
}
