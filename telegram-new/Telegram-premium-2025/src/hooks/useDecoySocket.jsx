import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL;

export function useDecoySocket({ sessionIds = [], onMessage, onStatus, onUnseenReset, onObjective }) {
  const socketRefs = useRef({});
  // Keep latest callbacks in refs so socket listeners never go stale
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatus);
  const onUnseenResetRef = useRef(onUnseenReset);
  const onObjectiveRef = useRef(onObjective);
  onMessageRef.current = onMessage;
  onStatusRef.current = onStatus;
  onUnseenResetRef.current = onUnseenReset;
  onObjectiveRef.current = onObjective;

  const emit = useCallback((event, data) => {
    // If a specific sessionId is provided in data, use its socket
    const targetSocket = data?.sessionId ? socketRefs.current[data.sessionId] : Object.values(socketRefs.current)[0];
    targetSocket?.emit(event, data);
  }, []);

  useEffect(() => {
    if (!sessionIds || sessionIds.length === 0) return;

    const token = localStorage.getItem('accessToken');
    const newSockets = {};

    sessionIds.forEach(id => {
      // Create a dedicated socket connection per target
      // This is necessary because Socket.io client doesn't expose the room name of incoming broadcasts
      const socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnectionAttempts: 5,
        forceNew: true, // ensure it's a new connection
      });

      socket.on('connect', () => {
        socket.emit('join:session', { sessionId: id });
      });

      socket.on('decoy:message', (msg) => {
        // We know definitively which session this came from!
        onMessageRef.current?.({ ...msg, sessionId: id });
      });

      socket.on('decoy:status', (payload) => {
        onStatusRef.current?.({ ...payload, sessionId: id });
      });

      socket.on('decoy:unseen_reset', (payload) => {
        onUnseenResetRef.current?.({ ...payload, sessionId: id });
      });

      socket.on('decoy:objective', (payload) => {
        onObjectiveRef.current?.({ ...payload, sessionId: id });
      });

      newSockets[id] = socket;
    });

    socketRefs.current = newSockets;

    return () => {
      Object.values(newSockets).forEach(s => s.disconnect());
      socketRefs.current = {};
    };
  }, [JSON.stringify(sessionIds)]);

  return { emit };
}
