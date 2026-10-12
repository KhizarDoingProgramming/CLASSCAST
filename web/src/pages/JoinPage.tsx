import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMedia } from '../hooks/useMedia';
import { WebRTCManager } from '../lib/webrtc';
import { NotificationToast, useNotification } from '../components/Notification';
import ChatPanel from '../components/ChatPanel';
import VideoStream from '../components/VideoStream';
import type { Participant, ChatMessage, SessionConfig, ParticipantId, WebRTCSignal } from '@classcast/shared';

async function handleWebRTCSignal(webrtc: WebRTCManager, from: string, signal: WebRTCSignal): Promise<void> {
  switch (signal.type) {
    case 'offer':
      await webrtc.handleOffer(from, signal.sdp);
      break;
    case 'answer':
      await webrtc.handleAnswer(from, signal.sdp);
      break;
    case 'ice-candidate':
      webrtc.addIceCandidate(from, signal.candidate);
      break;
  }
}

export default function JoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isConnected, connect, send, on } = useWebSocket();
  const media = useMedia();
  const { notification, showNotification } = useNotification();

  const urlSessionId = searchParams.get('session') || '';
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const pendingSignalsRef = useRef<Array<{ from: string; signal: WebRTCSignal }>>([]);

  const [rollNumber, setRollNumber] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'form' | 'waiting' | 'classroom'>('form');
  const [error, setError] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activePresenter, setActivePresenter] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [handRaised, setHandRaised] = useState(false);
  const [showPanel, setShowPanel] = useState<'none' | 'chat' | 'participants'>('none');
  const [presenterStream, setPresenterStream] = useState<MediaStream | null>(null);
  const [sessionInfo, setSessionInfo] = useState<{ roomName: string; participantCount: number } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    if (!participantId) return;

    const webrtc = new WebRTCManager(
      (to, signal) => {
        send({ type: 'WEBRTC_SIGNAL', to, signal });
      },
      (event) => {
        if (event.type === 'stream' && event.stream) {
          setPresenterStream(event.stream);
        }
        if (event.type === 'connection-state-change' && event.state === 'failed') {
          showNotification('error', 'Lost connection to presenter');
        }
      }
    );

    webrtcRef.current = webrtc;

    if (pendingSignalsRef.current.length > 0) {
      console.log(`[WebRTC] Processing ${pendingSignalsRef.current.length} buffered signals`);
      for (const { from, signal } of pendingSignalsRef.current) {
        handleWebRTCSignal(webrtc, from, signal);
      }
      pendingSignalsRef.current = [];
    }

    return () => {
      webrtc.closeAll();
      webrtcRef.current = null;
    };
  }, [participantId, send, showNotification]);

  useEffect(() => {
    const unsubs = [
      on('JOIN_REQUEST_SENT', (msg) => {
        setStep('waiting');
        showNotification('info', msg.message);
      }),
      on('JOIN_ACCEPTED', (msg) => {
        setStep('classroom');
        setParticipantId(msg.participantId);
        setParticipants(msg.participants);
        setConfig(msg.config);
        showNotification('success', 'Welcome to the classroom!');
      }),
      on('JOIN_REJECTED', (msg) => {
        setStep('form');
        setError(msg.reason);
        showNotification('error', msg.reason);
      }),
      on('PARTICIPANT_JOINED', (msg) => {
        setParticipants(prev => [...prev, msg.participant]);
      }),
      on('PARTICIPANT_LEFT', (msg) => {
        setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, isConnected: false } : p));
      }),
      on('PARTICIPANT_LIST', (msg) => setParticipants(msg.participants)),
      on('ACTIVE_PRESENTER', (msg) => {
        setActivePresenter({ id: msg.participantId, name: msg.participantName });
        if (!msg.participantId) {
          setPresenterStream(null);
        }
      }),
      on('SCREEN_SHARE_APPROVED', (msg) => {
        setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, isScreenSharing: true } : p));
      }),
      on('SCREEN_SHARE_STOPPED', (msg) => {
        setParticipants(prev => prev.map(p => p.id === msg.participantId ? { ...p, isScreenSharing: false } : p));
      }),
      on('SCREEN_SHARE_REJECTED', (msg) => {
        showNotification('error', msg.reason);
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
      }),
      on('PERMISSION_CHANGED', (msg) => {
        if (config) setConfig(prev => prev ? { ...prev, [msg.setting]: msg.value } as SessionConfig : prev);
        showNotification('info', `Setting updated: ${msg.setting} = ${msg.value ? 'ON' : 'OFF'}`);
      }),
      on('SESSION_ENDED', (msg) => {
        showNotification('info', msg.reason);
        media.stopAll();
        setTimeout(() => navigate('/'), 2000);
      }),
      on('PARTICIPANT_REMOVED', (msg) => {
        showNotification('info', msg.reason);
        media.stopAll();
        setTimeout(() => navigate('/'), 2000);
      }),
      on('WEBRTC_SIGNAL', async (msg: { from: string; signal: WebRTCSignal }) => {
        const { from, signal } = msg;
        if (!webrtcRef.current) {
          console.log('[WebRTC] Manager not ready, buffering signal:', signal.type);
          pendingSignalsRef.current.push({ from, signal });
          return;
        }
        await handleWebRTCSignal(webrtcRef.current, from, signal);
      }),
      on('ERROR', (msg) => showNotification('error', msg.message)),
    ];

    return () => unsubs.forEach(u => u());
  }, [on, showNotification, navigate, config, media]);

  useEffect(() => {
    if (!urlSessionId || !isConnected) return;
    setSessionLoading(true);
    fetch(`/api/qr/${urlSessionId}`)
      .then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then(data => {
        setSessionInfo({ roomName: 'Classroom', participantCount: 0 });
        setSessionLoading(false);
      })
      .catch(() => {
        setSessionInfo(null);
        setSessionLoading(false);
      });
  }, [urlSessionId, isConnected]);

  const handleJoin = () => {
    if (!rollNumber.trim() || !name.trim()) {
      setError('Please enter both roll number and name');
      return;
    }
    setError(null);

    if (pin.trim()) {
      send({
        type: 'JOIN_WITH_PIN',
        sessionId: urlSessionId,
        pin: pin.trim(),
        rollNumber: rollNumber.trim(),
        name: name.trim(),
      });
    } else {
      send({
        type: 'JOIN_REQUEST',
        sessionId: urlSessionId,
        rollNumber: rollNumber.trim(),
        name: name.trim(),
      });
    }
  };

  const handleToggleScreenShare = async () => {
    if (media.isScreenSharing) {
      media.stopScreenShare();
      send({ type: 'SCREEN_SHARE_STOP' });
      return;
    }

    const stream = await media.startScreenShare();
    if (!stream) return;
    send({ type: 'SCREEN_SHARE_REQUEST' });

    if (webrtcRef.current && activePresenter.id && activePresenter.id !== participantId) {
      try {
        await webrtcRef.current.createOffer(activePresenter.id, stream);
      } catch {}
    }
  };

  const handleToggleMic = async () => {
    const enabled = await media.toggleMic();
    send({ type: 'MIC_TOGGLE', enabled });
  };

  const handleToggleCamera = async () => {
    const enabled = await media.toggleCamera();
    send({ type: 'CAMERA_TOGGLE', enabled });
  };

  const handleToggleHand = () => {
    if (handRaised) {
      send({ type: 'LOWER_HAND' });
    } else {
      send({ type: 'RAISE_HAND' });
    }
    setHandRaised(!handRaised);
  };

  const handleSendChat = (message: string) => {
    send({ type: 'CHAT_MESSAGE', message });
  };

  if (step === 'waiting') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <NotificationToast notification={notification} />
        <div className="card max-w-sm w-full text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 animate-pulse" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-900">Waiting for Approval</h1>
            <p className="text-surface-500 mt-1.5 text-sm">The host will review your request shortly</p>
          </div>
          <div className="p-3 rounded-lg bg-surface-50 text-sm text-surface-600">
            <span className="font-mono">{rollNumber}</span> · {name}
          </div>
          <button onClick={() => { setStep('form'); setError(null); }} className="btn-ghost w-full">Cancel</button>
        </div>
      </div>
    );
  }

  if (step === 'classroom') {
    const connectedCount = participants.filter(p => p.isConnected).length;
    const isPresenter = activePresenter.id === participantId;
    const showPresenterStream = !isPresenter && presenterStream;

    return (
      <div className="min-h-[100dvh] flex flex-col bg-surface-950">
        <NotificationToast notification={notification} />

        {/* Header */}
        <header className="flex-shrink-0 bg-surface-900 border-b border-surface-800 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-primary-600 text-white flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-white truncate">ClassCast</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-400">
                {connectedCount} online
              </span>
              <button
                onClick={() => { if (window.confirm('Leave this class?')) { media.stopAll(); navigate('/'); } }}
                className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded-md hover:bg-surface-800 transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        </header>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Video area */}
          <div className="flex-1 flex items-center justify-center bg-surface-950 p-3 relative min-h-0">
            {showPresenterStream ? (
              <VideoStream stream={presenterStream} className="w-full h-full rounded-xl" label={activePresenter.name || undefined} />
            ) : isPresenter && media.screenStream ? (
              <VideoStream stream={media.screenStream} className="w-full h-full rounded-xl" label="You are presenting" muted />
            ) : activePresenter.id ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary-900/50 text-primary-400 flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 7.41A2.25 2.25 0 012.25 5.496V5.25" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-white">{activePresenter.name}</p>
                <p className="text-sm text-surface-500 mt-1">Connecting to stream...</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-800 text-surface-500 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-surface-300">No Active Presentation</p>
                <p className="text-sm text-surface-600 mt-1">Waiting for presentation to start</p>
              </div>
            )}
          </div>

          {/* Side Panel (slides up on mobile) */}
          {showPanel !== 'none' && (
            <div className="flex-shrink-0 bg-white border-t border-surface-200 max-h-[45dvh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-200">
                <h3 className="text-sm font-semibold text-surface-900">
                  {showPanel === 'chat' ? 'Chat' : `Participants (${connectedCount})`}
                </h3>
                <button onClick={() => setShowPanel('none')} className="p-1 rounded-md hover:bg-surface-100 text-surface-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
              {showPanel === 'chat' ? (
                <ChatPanel messages={chatMessages} onSend={handleSendChat} allowChat={config?.allowChat ?? true} />
              ) : (
                <div className="flex-1 overflow-y-auto p-3">
                  <div className="space-y-1">
                    {participants.filter(p => p.isConnected).map(p => (
                      <div key={p.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-50">
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-surface-900 truncate">{p.name}</div>
                          <div className="text-xs text-surface-500 font-mono">{p.rollNumber}</div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
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
          )}

          {/* Bottom Toolbar */}
          <div className="flex-shrink-0 bg-white border-t border-surface-200 px-3 py-2.5 safe-area-bottom">
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <button onClick={handleToggleMic}
                className={media.isMicEnabled ? 'btn-primary !px-3 !py-2 !text-xs sm:!text-sm' : 'btn-secondary !px-3 !py-2 !text-xs sm:!text-sm'}
                disabled={!config?.allowMicrophone}
                title={!config?.allowMicrophone ? 'Microphone disabled by host' : undefined}>
                <span className="text-base">{media.isMicEnabled ? '🎤' : '🔇'}</span>
                <span className="hidden sm:inline">{media.isMicEnabled ? 'Mic' : 'Muted'}</span>
              </button>
              <button onClick={handleToggleCamera}
                className={media.isCameraEnabled ? 'btn-primary !px-3 !py-2 !text-xs sm:!text-sm' : 'btn-secondary !px-3 !py-2 !text-xs sm:!text-sm'}
                disabled={!config?.allowCamera}
                title={!config?.allowCamera ? 'Camera disabled by host' : undefined}>
                <span className="text-base">{media.isCameraEnabled ? '📷' : '📵'}</span>
                <span className="hidden sm:inline">{media.isCameraEnabled ? 'Camera' : 'Off'}</span>
              </button>
              <button onClick={handleToggleScreenShare}
                disabled={!config?.allowParticipantScreenShare}
                className={media.isScreenSharing ? 'btn-danger !px-3 !py-2 !text-xs sm:!text-sm' : 'btn-primary !px-3 !py-2 !text-xs sm:!text-sm'}
                title={!config?.allowParticipantScreenShare ? 'Screen sharing disabled by host' : undefined}>
                <span className="text-base">🖥️</span>
                <span className="hidden sm:inline">{media.isScreenSharing ? 'Stop' : 'Share'}</span>
              </button>
              <button onClick={handleToggleHand}
                className={`${handRaised ? 'bg-amber-100 text-amber-700 border-amber-300' : ''} btn-secondary !px-3 !py-2 !text-xs sm:!text-sm`}>
                <span className="text-base">✋</span>
                <span className="hidden sm:inline">{handRaised ? 'Lower' : 'Hand'}</span>
              </button>

              <div className="w-px h-6 bg-surface-200 mx-0.5" />

              <button onClick={() => setShowPanel(showPanel === 'chat' ? 'none' : 'chat')}
                className={`btn-secondary !px-3 !py-2 !text-xs sm:!text-sm ${showPanel === 'chat' ? '!bg-primary-50 !text-primary-700 !border-primary-200' : ''}`}>
                <span className="text-base">💬</span>
              </button>
              <button onClick={() => setShowPanel(showPanel === 'participants' ? 'none' : 'participants')}
                className={`btn-secondary !px-3 !py-2 !text-xs sm:!text-sm ${showPanel === 'participants' ? '!bg-primary-50 !text-primary-700 !border-primary-200' : ''}`}>
                <span className="text-base">👥</span>
                <span className="text-[10px] font-bold bg-surface-200 rounded-full px-1.5 py-0.5 -ml-1">{connectedCount}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── No session ID — show helpful message ─────────────────────
  if (!urlSessionId) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <NotificationToast notification={notification} />
        <div className="card max-w-sm w-full space-y-5 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 text-amber-600 mx-auto">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-900">No Session Specified</h1>
            <p className="text-surface-500 mt-1.5 text-sm">
              To join a class, open the link provided by your teacher.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-surface-50 text-left text-sm text-surface-600 space-y-1.5">
            <p className="font-medium text-surface-700 text-xs uppercase tracking-wider">How to join</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Ask your teacher for the class link or QR code</li>
              <li>Scan the QR code with your phone camera</li>
              <li>Or open the link your teacher shared</li>
            </ol>
          </div>
          <button onClick={() => navigate('/')} className="btn-ghost w-full">Back to Home</button>
        </div>
      </div>
    );
  }

  // ─── Join Form View ──────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4">
      <NotificationToast notification={notification} />
      <div className="card max-w-sm w-full space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-600 text-white mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-surface-900">Join Classroom</h1>
          <p className="text-surface-500 mt-1 text-sm">Enter your details to join</p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">Roll Number</label>
            <input type="text" className="input font-mono" placeholder="e.g., 24-Arid-911" value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleJoin()} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">Name</label>
            <input type="text" className="input" placeholder="e.g., Mustafa" value={name}
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleJoin()} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">PIN <span className="text-surface-400 font-normal">(if required)</span></label>
            <input type="text" className="input font-mono" placeholder="6-digit PIN" maxLength={6} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>

        <button onClick={handleJoin}
          disabled={!isConnected || !rollNumber.trim() || !name.trim()}
          className="btn-primary w-full py-3">
          {!isConnected ? 'Connecting...' : 'Request to Join'}
        </button>

        <button onClick={() => navigate('/')} className="btn-ghost w-full">Back</button>
      </div>
    </div>
  );
}
