import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMedia } from '../hooks/useMedia';
import { WebRTCManager } from '../lib/webrtc';
import { NotificationToast, useNotification } from '../components/Notification';
import ChatPanel from '../components/ChatPanel';
import AttendancePanel from '../components/AttendancePanel';
import VideoStream from '../components/VideoStream';
import type {
  Participant,
  ParticipantId,
  SessionConfig,
  ChatMessage,
  AttendanceRecord,
  WebRTCSignal,
} from '@classcast/shared';

export default function HostPage() {
  const navigate = useNavigate();
  const { isConnected, connect, send, on, setReconnectInfo } = useWebSocket();
  const media = useMedia();
  const { notification, showNotification } = useNotification();

  const webrtcRef = useRef<WebRTCManager | null>(null);
  const mediaStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const screenStreamRef = useRef<MediaStream | null>(null);

  const [sessionCreated, setSessionCreated] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState('');
  const [localIp, setLocalIp] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [pin, setPin] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Participant[]>([]);
  const [activePresenter, setActivePresenter] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [activeTab, setActiveTab] = useState<'participants' | 'chat' | 'attendance'>('participants');
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    if (!sessionId || !hostId) return;

    const webrtc = new WebRTCManager(
      (to, signal) => {
        send({ type: 'WEBRTC_SIGNAL', to, signal });
      },
      (event) => {
        if (event.type === 'stream' && event.stream) {
          const stream = event.stream;
          setRemoteStreams(prev => {
            const next = new Map(prev);
            next.set(event.participantId, stream);
            return next;
          });
        }
        if (event.type === 'connection-state-change') {
          if (event.state === 'failed') {
            showNotification('error', 'Connection lost to a participant');
          }
        }
      }
    );

    webrtcRef.current = webrtc;

    return () => {
      webrtc.closeAll();
      webrtcRef.current = null;
    };
  }, [sessionId, hostId, send, showNotification]);

  useEffect(() => {
    const unsubs = [
      on('SESSION_CREATED', (msg) => {
        setSessionCreated(true);
        setSessionId(msg.sessionId);
        setHostId(msg.hostId);
        setLocalUrl(msg.localUrl);
        setLocalIp(msg.localIp);
        setReconnectInfo({ type: 'host', sessionId: msg.sessionId, hostId: msg.hostId });
        showNotification('success', 'Classroom created successfully!');
        fetch(`/api/qr/${msg.sessionId}`)
          .then((r) => r.json())
          .then((data) => setQrCode(data.qr))
          .catch(() => {});
      }),
      on('PARTICIPANT_JOINED', (msg) => {
        setParticipants(prev => [...prev, msg.participant]);
        showNotification('info', `${msg.participant.name} joined`);
        if (screenStreamRef.current) {
          const pid = msg.participant.id;
          const attemptSend = (retries: number) => {
            if (retries <= 0 || !screenStreamRef.current || !webrtcRef.current) return;
            webrtcRef.current!.createOffer(pid, screenStreamRef.current!).then(() => {
              console.log(`[ScreenShare] Sent offer to late joiner ${msg.participant.name}`);
            }).catch(() => {
              setTimeout(() => attemptSend(retries - 1), 1000);
            });
          };
          setTimeout(() => attemptSend(3), 1500);
        }
      }),
      on('PARTICIPANT_LEFT', (msg) => {
        setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, isConnected: false } : p));
        if (webrtcRef.current) webrtcRef.current.closePeer(msg.participantId);
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(msg.participantId);
          return next;
        });
      }),
      on('PARTICIPANT_REMOVED', (msg) => {
        setParticipants(prev => prev.filter(p => p.id !== msg.participantId));
        showNotification('info', 'Participant removed');
        if (webrtcRef.current) webrtcRef.current.closePeer(msg.participantId);
      }),
      on('PARTICIPANT_LIST', (msg) => setParticipants(msg.participants)),
      on('PENDING_REQUESTS', (msg) => setPendingRequests(msg.requests)),
      on('SCREEN_SHARE_APPROVED', (msg) => {
        setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, isScreenSharing: true } : p));
      }),
      on('SCREEN_SHARE_STOPPED', (msg) => {
        setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, isScreenSharing: false } : p));
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(msg.participantId);
          return next;
        });
      }),
      on('ACTIVE_PRESENTER', (msg) => {
        setActivePresenter({ id: msg.participantId, name: msg.participantName });
      }),
      on('MIC_STATE_CHANGED', (msg) => {
        setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, isMicEnabled: msg.enabled } : p));
      }),
      on('CAMERA_STATE_CHANGED', (msg) => {
        setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, isCameraEnabled: msg.enabled } : p));
      }),
      on('CHAT_BROADCAST', (msg) => {
        setChatMessages(prev => {
          const next = [...prev, msg.message];
          return next.length > 100 ? next.slice(-100) : next;
        });
      }),
      on('HAND_STATE_CHANGED', (msg) => {
        setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, hasHandRaised: msg.raised } : p));
        if (msg.raised) {
          const p = participants.find(p => p.id === msg.participantId);
          if (p) showNotification('info', `${p.name} raised their hand`);
        }
      }),
      on('PERMISSION_CHANGED', (msg) => {
        if (config) setConfig(prev => prev ? { ...prev, [msg.setting]: msg.value } as SessionConfig : prev);
        showNotification('info', `${msg.setting} = ${msg.value ? 'ON' : 'OFF'}`);
      }),
      on('SCREEN_SHARE_REQUESTED', (msg) => {
        showNotification('info', `${msg.participantName} (${msg.rollNumber}) wants to share screen`);
      }),
      on('JOIN_REQUESTED', (msg) => {
        showNotification('info', `${msg.participantName} (${msg.rollNumber}) wants to join`);
      }),
      on('WEBRTC_SIGNAL', async (msg: { from: string; signal: WebRTCSignal }) => {
        if (!webrtcRef.current) return;
        const { from, signal } = msg;
        switch (signal.type) {
          case 'offer':
            await webrtcRef.current.handleOffer(from, signal.sdp);
            break;
          case 'answer':
            await webrtcRef.current.handleAnswer(from, signal.sdp);
            break;
          case 'ice-candidate':
            webrtcRef.current.addIceCandidate(from, signal.candidate);
            break;
        }
      }),
      on('HOST_RECONNECTED', (msg) => {
        showNotification('success', 'Reconnected to your session!');
      }),
      on('SESSION_ENDED', () => {
        showNotification('info', 'Session ended');
        media.stopAll();
        setTimeout(() => navigate('/'), 2000);
      }),
      on('ERROR', (msg) => showNotification('error', msg.message)),
    ];

    return () => unsubs.forEach(u => u());
  }, [on, showNotification, navigate, config, participants, media]);

  const handleCreateSession = () => {
    if (!roomName.trim()) {
      showNotification('error', 'Please enter a room name');
      return;
    }
    send({
      type: 'CREATE_SESSION',
      roomName: roomName.trim(),
      pin: pin.trim() || '',
      port: 3000,
    });
  };

  const handleAcceptParticipant = (id: ParticipantId) => send({ type: 'ACCEPT_PARTICIPANT', participantId: id });
  const handleRejectParticipant = (id: ParticipantId) => send({ type: 'REJECT_PARTICIPANT', participantId: id });
  const handleRemoveParticipant = (id: ParticipantId) => send({ type: 'REMOVE_PARTICIPANT', participantId: id });

  const handleEndSession = () => {
    if (window.confirm('End this classroom session?')) {
      media.stopAll();
      if (webrtcRef.current) webrtcRef.current.closeAll();
      send({ type: 'END_SESSION' });
    }
  };

  const handlePermissionChange = (setting: string, value: boolean) => {
    send({ type: 'PERMISSION_CHANGE', setting, value });
    if (config) setConfig(prev => prev ? { ...prev, [setting]: value } as SessionConfig : prev);
  };

  const handleToggleScreenShare = async () => {
    if (media.isScreenSharing) {
      media.stopScreenShare();
      screenStreamRef.current = null;
      send({ type: 'SCREEN_SHARE_STOP' });
      if (webrtcRef.current) {
        const connectedParticipants = participants.filter(p => p.isConnected && !p.isHost);
        for (const p of connectedParticipants) {
          webrtcRef.current.closePeer(p.id);
        }
      }
      return;
    }

    console.log('[ScreenShare] Starting screen share...');
    const stream = await media.startScreenShare();
    if (!stream) {
      console.error('[ScreenShare] Failed to get display media stream');
      showNotification('error', media.screenError || 'Failed to start screen sharing');
      return;
    }

    console.log('[ScreenShare] Got stream, tracks:', stream.getTracks().length);
    screenStreamRef.current = stream;

    stream.getVideoTracks()[0].onended = () => {
      console.log('[ScreenShare] User stopped sharing via browser UI');
      screenStreamRef.current = null;
      send({ type: 'SCREEN_SHARE_STOP' });
      if (webrtcRef.current) {
        for (const p of participants.filter(p => p.isConnected && !p.isHost)) {
          webrtcRef.current.closePeer(p.id);
        }
      }
    };

    send({ type: 'SCREEN_SHARE_REQUEST' });
    console.log('[ScreenShare] Sent SCREEN_SHARE_REQUEST');

    await new Promise(resolve => setTimeout(resolve, 300));

    const connectedParticipants = participants.filter(p => p.isConnected && !p.isHost);
    console.log(`[ScreenShare] Creating offers for ${connectedParticipants.length} participants`);

    if (webrtcRef.current) {
      for (const p of connectedParticipants) {
        try {
          await webrtcRef.current.createOffer(p.id, stream);
          console.log(`[ScreenShare] Offer sent to ${p.name}`);
        } catch (err) {
          console.error(`[ScreenShare] Failed to create offer for ${p.name}:`, err);
        }
      }
    } else {
      console.error('[ScreenShare] webrtcRef.current is null!');
    }
  };

  const handleToggleMic = async () => {
    const enabled = await media.toggleMic();
    send({ type: 'MIC_TOGGLE', enabled });

    if (enabled && media.micStream && webrtcRef.current) {
      for (const p of participants.filter(p => p.isConnected && !p.isHost)) {
        webrtcRef.current.addLocalStream(media.micStream);
        break;
      }
    }
  };

  const handleToggleCamera = async () => {
    const enabled = await media.toggleCamera();
    send({ type: 'CAMERA_TOGGLE', enabled });

    if (enabled && media.cameraStream && webrtcRef.current) {
      const connectedParticipants = participants.filter(p => p.isConnected && !p.isHost);
      for (const p of connectedParticipants) {
        try {
          await webrtcRef.current.createOffer(p.id, media.cameraStream);
        } catch {}
        break;
      }
    }
  };

  const handleSendChat = (message: string) => {
    send({ type: 'CHAT_MESSAGE', message });
  };

  if (!sessionCreated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <NotificationToast notification={notification} />
        <div className="card max-w-md w-full space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Create a Classroom</h1>
            <p className="text-surface-500 mt-1">Set up your offline classroom session</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Room Name</label>
              <input type="text" className="input" placeholder="e.g., CS-5A" value={roomName}
                onChange={(e) => setRoomName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateSession()} />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                PIN <span className="text-surface-400">(optional)</span>
              </label>
              <input type="text" className="input font-mono" placeholder="6-digit PIN" maxLength={6} value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </div>
          </div>
          <button onClick={handleCreateSession} disabled={!isConnected || !roomName.trim()} className="btn-primary w-full py-3">
            {isConnected ? 'Create Classroom' : 'Connecting...'}
          </button>
          <button onClick={() => navigate('/')} className="btn-ghost w-full">Back</button>
        </div>
      </div>
    );
  }

  const connectedCount = participants.filter(p => p.isConnected).length;
  const viewingStream = activePresenter.id && activePresenter.id !== hostId
    ? remoteStreams.get(activePresenter.id)
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <NotificationToast notification={notification} />

      <header className="border-b border-surface-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                </svg>
              </div>
              <span className="font-bold text-surface-900">ClassCast</span>
            </div>
            <div className="h-6 w-px bg-surface-200" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-surface-900">{roomName}</span>
                <span className="badge-info font-mono">PIN: {pin || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-surface-500 mt-0.5">
                <span>{localUrl}</span>
                <span className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-surface-900">{connectedCount} participant{connectedCount !== 1 ? 's' : ''}</div>
              <div className="text-xs text-surface-500">{pendingRequests.length} pending</div>
            </div>
            <button onClick={handleEndSession} className="btn-danger">End Class</button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-56 border-r border-surface-200 bg-white p-4 space-y-1">
          {[
            { id: 'participants' as const, label: 'Participants', icon: '👥' },
            { id: 'chat' as const, label: 'Chat', icon: '💬' },
            { id: 'attendance' as const, label: 'Attendance', icon: '📋' },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-primary-50 text-primary-700' : 'text-surface-600 hover:bg-surface-50'
              }`}>
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <div className="pt-4 mt-4 border-t border-surface-200">
            <button onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-surface-600 hover:bg-surface-50">
              <span>⚙️</span> Settings
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center bg-surface-100 m-4 rounded-xl relative">
            {viewingStream ? (
              <VideoStream stream={viewingStream} className="w-full h-full" label={activePresenter.name || undefined} />
            ) : media.isScreenSharing && media.screenStream ? (
              <VideoStream stream={media.screenStream} className="w-full h-full" label="Your screen (presenting)" muted />
            ) : activePresenter.id && activePresenter.id === hostId ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 7.41A2.25 2.25 0 012.25 5.496V5.25" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-surface-900">You are presenting</p>
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
                <p className="text-sm text-surface-400 mt-1">Share your screen or wait for a participant</p>
              </div>
            )}
          </div>

          <div className="border-t border-surface-200 bg-white px-6 py-3">
            <div className="flex items-center justify-center gap-3">
              <button onClick={handleToggleMic}
                className={media.isMicEnabled ? 'btn-primary' : 'btn-secondary'}
                disabled={!config?.allowMicrophone}
                title={!config?.allowMicrophone ? 'Microphone disabled by host' : undefined}>
                <span>{media.isMicEnabled ? '🎤' : '🔇'}</span> {media.isMicEnabled ? 'Mic On' : 'Mic Off'}
              </button>
              <button onClick={handleToggleCamera}
                className={media.isCameraEnabled ? 'btn-primary' : 'btn-secondary'}
                disabled={!config?.allowCamera}
                title={!config?.allowCamera ? 'Camera disabled by host' : undefined}>
                <span>{media.isCameraEnabled ? '📷' : '📵'}</span> {media.isCameraEnabled ? 'Camera On' : 'Camera Off'}
              </button>
              <button onClick={handleToggleScreenShare}
                className={media.isScreenSharing ? 'btn-danger' : 'btn-primary'}>
                <span>🖥️</span> {media.isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
              </button>
              <button onClick={() => setActiveTab('chat')} className="btn-secondary">
                <span>💬</span> Chat
              </button>
              <button onClick={() => setActiveTab('participants')} className="btn-secondary">
                <span>👥</span> Participants
              </button>
              <button onClick={() => setShowSettings(true)} className="btn-ghost">
                <span>⚙️</span>
              </button>
            </div>
          </div>
        </main>

        <aside className="w-72 border-l border-surface-200 bg-white flex flex-col">
          {activeTab === 'chat' ? (
            <ChatPanel messages={chatMessages} onSend={handleSendChat} allowChat={config?.allowChat ?? true} />
          ) : activeTab === 'attendance' ? (
            <AttendancePanel records={attendanceRecords} sessionId={sessionId} />
          ) : (
            <>
              {pendingRequests.length > 0 && (
                <div className="p-4 border-b border-surface-200">
                  <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">
                    Join Requests ({pendingRequests.length})
                  </h3>
                  <div className="space-y-2">
                    {pendingRequests.map((req) => (
                      <div key={req.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <div>
                          <div className="text-sm font-medium text-surface-900">{req.name}</div>
                          <div className="text-xs text-surface-500 font-mono">{req.rollNumber}</div>
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => handleAcceptParticipant(req.id)} className="btn-success text-xs py-1 px-2">Accept</button>
                          <button onClick={() => handleRejectParticipant(req.id)} className="btn-danger text-xs py-1 px-2">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">
                  Participants ({connectedCount})
                </h3>
                <div className="space-y-1">
                  {participants.filter(p => p.isConnected).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-50 group">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-surface-900">{p.name}</div>
                          <div className="text-xs text-surface-500 font-mono">{p.rollNumber}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {p.hasHandRaised && <span className="text-sm">✋</span>}
                        {p.isScreenSharing && <span className="text-sm">🖥️</span>}
                        {p.isMicEnabled && <span className="text-xs">🎤</span>}
                        {p.isCameraEnabled && <span className="text-xs">📷</span>}
                        {!p.isHost && (
                          <button onClick={() => handleRemoveParticipant(p.id)}
                            className="opacity-0 group-hover:opacity-100 btn-ghost text-xs py-1 px-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Remove">✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {qrCode && (
                <div className="p-4 border-t border-surface-200">
                  <div className="text-center">
                    <img src={qrCode} alt="QR Code" className="w-32 h-32 mx-auto rounded-lg" />
                    <p className="text-xs text-surface-500 mt-2">Scan to join</p>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card max-w-md w-full mx-4 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-surface-900">Session Settings</h2>
              <button onClick={() => setShowSettings(false)} className="btn-ghost text-xs">✕</button>
            </div>
            <div className="space-y-4">
              {[
                { key: 'requireJoinApproval', label: 'Require Join Approval', desc: 'Participants must be approved by host' },
                { key: 'allowParticipantScreenShare', label: 'Participant Screen Sharing', desc: 'Allow participants to share their screen' },
                { key: 'requireScreenShareApproval', label: 'Require Screen Share Approval', desc: 'Host must approve screen share requests' },
                { key: 'allowMicrophone', label: 'Microphones', desc: 'Allow participants to use microphone' },
                { key: 'allowCamera', label: 'Cameras', desc: 'Allow participants to use camera' },
                { key: 'allowChat', label: 'Chat', desc: 'Allow chat messages' },
              ].map((setting) => {
                const currentValue = config ? (config as any)[setting.key] !== false : true;
                return (
                  <div key={setting.key} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-surface-900">{setting.label}</div>
                      <div className="text-xs text-surface-500">{setting.desc}</div>
                    </div>
                    <button onClick={() => handlePermissionChange(setting.key, !currentValue)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${currentValue ? 'bg-primary-600' : 'bg-surface-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${currentValue ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
