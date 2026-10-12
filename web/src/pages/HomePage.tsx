import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface ActiveSession {
  id: string;
  roomName: string;
  participantCount: number;
  maxParticipants: number;
  requireJoinApproval: boolean;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [serverAddress, setServerAddress] = useState('');
  const [serverInfo, setServerInfo] = useState<{ ip: string; port: number } | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [fetchingSessions, setFetchingSessions] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/network')
      .then((r) => r.json())
      .then((data) => {
        setServerInfo(data);
        setServerAddress(`${data.ip}:${data.port}`);
        return fetch('/api/sessions');
      })
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions))
      .catch(() => {});
  }, []);

  const handleFetchSessions = async () => {
    if (!serverAddress.trim()) return;
    setFetchingSessions(true);
    setFetchError(null);
    try {
      const url = serverAddress.includes('://') ? serverAddress : `http://${serverAddress}`;
      const res = await fetch(`${url}/api/sessions`);
      if (!res.ok) throw new Error('Server not reachable');
      const data = await res.json();
      setSessions(data.sessions);
      const netRes = await fetch(`${url}/api/network`);
      const netData = await netRes.json();
      setServerInfo(netData);
    } catch {
      setFetchError('Cannot reach server. Make sure the ClassCast server is running on that address.');
      setSessions(null);
    }
    setFetchingSessions(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-40 h-40 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-10 right-10 w-60 h-60 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="relative px-6 pt-12 pb-10 sm:pt-16 sm:pb-14">
          <div className="max-w-lg mx-auto text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-sm mb-5">
              <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
              </svg>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">ClassCast</h1>
            <p className="text-primary-200 mt-2 text-base sm:text-lg">Your classroom. Connected offline.</p>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 48" fill="none" className="w-full h-6 sm:h-8">
            <path d="M0 48h1440V24c-120-16-240-24-360-24S840 8 720 24 480 40 360 24 120 8 0 24v24z" fill="var(--tw-bg-base, #f8fafc)" />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 sm:px-6 -mt-1">
        <div className="max-w-lg mx-auto space-y-5 pb-8">
          {/* Host Button */}
          <button
            onClick={() => navigate('/host')}
            className="w-full group relative bg-white rounded-xl border border-surface-200 p-5 text-left shadow-sm hover:shadow-md hover:border-primary-300 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary-600 text-white flex items-center justify-center group-hover:bg-primary-700 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold text-surface-900">Start Class</div>
                <div className="text-sm text-surface-500 mt-0.5">Host a session and share your screen</div>
              </div>
              <svg className="w-5 h-5 text-surface-400 group-hover:text-primary-600 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-surface-200" />
            <span className="text-xs font-medium text-surface-400 uppercase tracking-wider">or join</span>
            <div className="flex-1 h-px bg-surface-200" />
          </div>

          {/* Server Input */}
          <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Server Address</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., 192.168.1.17:3000"
                value={serverAddress}
                onChange={(e) => setServerAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchSessions()}
                className="input flex-1"
              />
              <button
                onClick={handleFetchSessions}
                disabled={!serverAddress.trim() || fetchingSessions}
                className="btn-primary px-5"
              >
                {fetchingSessions ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : 'Find'}
              </button>
            </div>
          </div>

          {/* Error */}
          {fetchError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {fetchError}
            </div>
          )}

          {/* No sessions */}
          {sessions && sessions.length === 0 && (
            <div className="p-6 rounded-xl bg-surface-50 border border-dashed border-surface-300 text-center">
              <div className="w-12 h-12 rounded-full bg-surface-200 text-surface-400 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-surface-600">No active classes</p>
              <p className="text-xs text-surface-400 mt-1">Ask your teacher to start one</p>
            </div>
          )}

          {/* Active Sessions */}
          {sessions && sessions.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-1">Active Classes</p>
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/join?session=${session.id}`)}
                  className="w-full text-left bg-white rounded-xl border border-surface-200 p-4 hover:border-primary-300 hover:shadow-sm transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-surface-900">{session.roomName}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-surface-500">
                        <span>{session.participantCount}/{session.maxParticipants} joined</span>
                        {session.requireJoinApproval && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-surface-300" />
                            <span>Approval required</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-primary-600 text-sm font-medium opacity-60 group-hover:opacity-100 transition-opacity">
                      Join
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          {serverInfo && (
            <p className="text-center text-xs text-surface-400 pt-2">
              {serverInfo.ip}:{serverInfo.port} · Works offline on local networks
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
