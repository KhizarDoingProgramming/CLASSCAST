import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '@classcast/shared';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  allowChat: boolean;
}

export default function ChatPanel({ messages, onSend, allowChat }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-surface-400 text-sm py-8">
            No messages yet
          </div>
        ) : (
          messages.map((msg) => (
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
        <div ref={endRef} />
      </div>

      {allowChat && (
        <div className="p-3 border-t border-surface-200">
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button onClick={handleSend} className="btn-primary" disabled={!input.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
