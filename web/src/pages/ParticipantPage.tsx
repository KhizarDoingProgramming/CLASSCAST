import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import type { ServerMessage, Participant, ChatMessage, SessionConfig } from '@classcast/shared';

export default function ParticipantPage() {
  const navigate = useNavigate();
  const { isConnected, connect, send, on } = useWebSocket();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // State
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activePresenter, setActivePresenter] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const [handRaised, setHandRaised] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // Connect
  useEffect(() => {
    connect();
  }, [connect]);

  // Handle messages
  useEffect(() => {
    const unsubs = [
      on('JOIN_ACCEPTED', (msg) => {
        setParticipantId(msg.participantId);
        setSessionId(msg.sessionId);
        setParticipants(msg.participants);
        setConfig(msg.config);
      }),
      on('PARTICIPANT_JOINED', (msg) => {
        setParticipants((prev) => [...prev, msg.participant]);
      }),
      on('PARTICIPANT_LEFT', (msg) => {
        setParticipants((prev) =>
          prev.map((p) => (p.id === msg.participantId ? { ...p, isConnected: false } : p))
        );
      }),
      on('PARTICIPANT_LIST', (msg) => {
        setParticipants(msg.participants);
      }),
      on('ACTIVE_PRESENTER', (msg) => {
        setActivePresenter({ id: msg.participantId, name: msg.participantName });
      }),
      on('SCREEN_SHARE_APPROVED', (msg) => {
        setParticipants((prev) =>
          prev.map((p) => (p.id === msg.participantId ? { ...p, isScreenSharing: true } : p))
        );
      }),
      on('SCREEN_SHARE_STOPPED', (msg) => {
        setParticipants((prev) =>
          prev.map((p) => (p.id === msg.participantId ? { ...p, isScreenSharing: false } : p))
        );
      }),
      on('CHAT_BROADCAST', (msg) => {
        setChatMessages((prev) => {
          const next = [...prev, msg.message];
          return next.length > 100 ? next.slice(-100) : next;
        });
      }),
      on('HAND_STATE_CHANGED', (msg) => {
        setParticipants((prev) =>
          prev.map((p) => (p.id === msg.participantId ? { ...p, hasHandRaised: msg.raised } : p))
        );
      }),
      on('PERMISSION_CHANGED', (msg) => {
        showNotification('info', `Settings updated: ${msg.setting}`);
      }),
      on('SESSION_ENDED', (msg) => {
        showNotification('info', msg.reason);
        setTimeout(() => navigate('/'), 2000);
      }),
      on('PARTICIPANT_REMOVED', (msg) => {
        showNotification('info', msg.reason);
        setTimeout(() => navigate('/'), 2000);
      }),
      on('ERROR', (msg) => {
        showNotification('error', msg.message);
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [on, showNotification, navigate]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    send({ type: 'CHAT_MESSAGE', message: chatInput.trim() });
    setChatInput('');
  };

  const handleToggleHand = () => {
    if (handRaised) {
      send({ type: 'LOWER_HAND' });
    } else {
      send({ type: 'RAISE_HAND' });
    }
    setHandRaised(!handRaised);
  };

  const connectedCount = participants.filter((p) => p.isConnected).length;

  if (!participantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-surface-500 mt-3 text-sm">Connecting to classroom...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white'
              : notification.type === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-primary-600 text-white'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-surface-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-600 text-white flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
              </svg>
            </div>
            <span className="font-semibold text-surface-900">ClassCast</span>
          </div>
          <div className="text-sm text-surface-500">
            {connectedCount} participant{connectedCount !== 1 ? 's' : ''}
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Presentation Area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center bg-surface-100 m-4 rounded-xl">
            {activePresenter.id ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 7.41A2.25 2.25 0 012.25 5.496V5.25" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-surface-900">{activePresenter.name} is presenting</p>
                <p className="text-sm text-surface-500 mt-1">Screen sharing active</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-200 text-surface-400 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-surface-600">No Active Presentation</p>
                <p className="text-sm text-surface-400 mt-1">Waiting for presentation to start</p>
              </div>
            )}
          </div>

          {/* Bottom Controls */}
          <div className="border-t border-surface-200 bg-white px-6 py-3">
            <div className="flex items-center justify-center gap-3">
              <button
                disabled={!config?.allowMicrophone}
                className="btn-secondary disabled:opacity-40"
                title={!config?.allowMicrophone ? 'Microphone disabled by host' : undefined}
              >
                <span>🎤</span> Mic
              </button>
              <button
                disabled={!config?.allowCamera}
                className="btn-secondary disabled:opacity-40"
                title={!config?.allowCamera ? 'Camera disabled by host' : undefined}
              >
                <span>📷</span> Camera
              </button>
              <button
                disabled={!config?.allowParticipantScreenShare}
                className="btn-primary disabled:opacity-40"
                title={!config?.allowParticipantScreenShare ? 'Screen sharing disabled by host' : undefined}
              >
                <span>🖥️</span> Share Screen
              </button>
              <button
                onClick={handleToggleHand}
                className={handRaised ? 'btn-secondary bg-amber-100 text-amber-700' : 'btn-secondary'}
              >
                <span>✋</span> {handRaised ? 'Lower Hand' : 'Raise Hand'}
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Leave this class?')) {
                    navigate('/');
                  }
                }}
                className="btn-ghost text-red-600 hover:text-red-700"
              >
                Leave
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Chat / Participants */}
        <div className="w-80 border-l border-surface-200 bg-white flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-surface-200">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2.5 text-sm font-medium ${
                activeTab === 'chat'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex-1 py-2.5 text-sm font-medium ${
                activeTab === 'participants'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              Participants ({connectedCount})
            </button>
          </div>

          {/* Chat */}
          {activeTab === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-surface-400 text-sm py-8">
                    No messages yet
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className="space-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-surface-700">{msg.name}</span>
                        <span className="text-xs text-surface-400 font-mono">{msg.rollNumber}</span>
                        <span className="text-xs text-surface-300">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-surface-600">{msg.message}</p>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {config?.allowChat && (
                <div className="p-3 border-t border-surface-200">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input flex-1"
                      placeholder="Type a message..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    />
                    <button onClick={handleSendChat} className="btn-primary" disabled={!chatInput.trim()}>
                      Send
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Participants */}
          {activeTab === 'participants' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-1">
                {participants
                  .filter((p) => p.isConnected)
                  .map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-surface-50">
                      <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-surface-900 truncate">{p.name}</div>
                        <div className="text-xs text-surface-500 font-mono">{p.rollNumber}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        {p.hasHandRaised && <span className="text-sm">✋</span>}
                        {p.isScreenSharing && <span className="text-sm">🖥️</span>}
                        {p.isHost && <span className="badge-info text-[10px]">Host</span>}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
