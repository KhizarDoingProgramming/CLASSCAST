import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@classcast/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MessageHandler = (msg: any) => void;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 8;
  const intentionalClose = useRef(false);
  const reconnectInfoRef = useRef<{ type: 'host'; sessionId: string; hostId: string } | { type: 'participant'; sessionId: string; participantId: string; rollNumber: string; name: string } | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setReconnectInfo = useCallback((info: typeof reconnectInfoRef.current) => {
    reconnectInfoRef.current = info;
  }, []);

  const connect = useCallback((url?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    intentionalClose.current = false;

    let wsUrl: string;
    if (url) {
      wsUrl = url;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }

    console.log('[WS] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;

        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'PING' }));
          }
        }, 10000);

        if (reconnectInfoRef.current) {
          const info = reconnectInfoRef.current;
          if (info.type === 'host') {
            console.log('[WS] Reconnecting as host:', info.sessionId);
            ws.send(JSON.stringify({ type: 'RECONNECT_HOST', sessionId: info.sessionId, hostId: info.hostId }));
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          const handlers = handlersRef.current.get(msg.type);
          if (handlers) {
            handlers.forEach((h) => h(msg));
          }
          const allHandlers = handlersRef.current.get('*');
          if (allHandlers) {
            allHandlers.forEach((h) => h(msg));
          }
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('[WS] Disconnected, code:', event.code, 'reason:', event.reason);
        setIsConnected(false);
        wsRef.current = null;

        if (intentionalClose.current) return;

        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 15000);
          reconnectAttempts.current++;
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          setError(`Connection lost. Reconnecting... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect(url);
          }, delay);
        } else {
          setError('Connection lost. Please refresh the page.');
        }
      };

      ws.onerror = (event) => {
        console.error('[WS] Error:', event);
        setError('Connection error. Check that the server is running.');
      };
    } catch (err) {
      console.error('[WS] Failed to create connection:', err);
      setError('Failed to connect to server.');
    }
  }, []);

  const disconnect = useCallback(() => {
    intentionalClose.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const on = useCallback((type: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);

    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      disconnect();
    };
  }, [disconnect]);

  return { isConnected, error, connect, disconnect, send, on, setReconnectInfo };
}
