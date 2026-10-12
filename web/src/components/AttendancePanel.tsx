import type { AttendanceRecord } from '@classcast/shared';

interface AttendancePanelProps {
  records: AttendanceRecord[];
  sessionId: string | null;
}

export default function AttendancePanel({ records, sessionId }: AttendancePanelProps) {
  const handleExport = () => {
    if (!sessionId) return;
    window.open(`/api/attendance/${sessionId}`, '_blank');
  };

  const connected = records.filter(r => r.isConnected).length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-surface-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-surface-900">Attendance</h3>
          <p className="text-xs text-surface-500">{connected} connected / {records.length} total</p>
        </div>
        <button onClick={handleExport} className="btn-secondary text-xs py-1.5 px-3" disabled={!sessionId || records.length === 0}>
          Export CSV
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {records.length === 0 ? (
          <div className="text-center text-surface-400 text-sm py-8">
            No attendance data yet
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100">
                <th className="text-left py-2 px-4 text-xs font-medium text-surface-500">Roll No</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-surface-500">Name</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-surface-500">Joined</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-surface-500">Left</th>
                <th className="text-left py-2 px-4 text-xs font-medium text-surface-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} className="border-b border-surface-50 hover:bg-surface-50">
                  <td className="py-2 px-4 font-mono text-xs">{r.rollNumber}</td>
                  <td className="py-2 px-4">{r.name}</td>
                  <td className="py-2 px-4 text-xs text-surface-500">
                    {new Date(r.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-2 px-4 text-xs text-surface-500">
                    {r.leftAt ? new Date(r.leftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="py-2 px-4">
                    <span className={r.isConnected ? 'badge-success' : 'badge-warning'}>
                      {r.isConnected ? 'Connected' : 'Left'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
