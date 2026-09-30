import { useEffect, useState } from 'react';

import type { ApplicationAgent } from '../../../core/src/index.js';
import { aiAgentClient } from '../services/aiAgentClient.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface AgentDetailsModalProps {
  agent: ApplicationAgent | null;
  isOpen: boolean;
  onClose: () => void;
  onSendToDesk?: (charId: number) => void;
  onSendToMeeting?: (charId: number) => void;
  onSendToOffice?: (charId: number) => void;
}

export function AgentDetailsModal({
  agent,
  isOpen,
  onClose,
  onSendToDesk,
  onSendToMeeting,
  onSendToOffice,
}: AgentDetailsModalProps) {
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'agent'; text: string }>>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (agent) {
      setMessages([
        {
          sender: 'agent',
          text: `Hello! I am ${agent.name}, ${agent.role} in INDRA AI OFFICE. Standing by for instructions or task queries.`,
        },
      ]);
    }
  }, [agent]);

  if (!isOpen || !agent) return null;

  const activeTask = aiAgentClient.getActiveTaskForAgent(agent.id);
  const recentCompletedTask = aiAgentClient.getTasks().find((t) => t.assignedAgentId === agent.id && t.status === 'completed');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const userText = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setIsSending(true);

    try {
      const reply = await aiAgentClient.chat(agent.id, userText);
      setMessages((prev) => [...prev, { sender: 'agent', text: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error communicating with agent.';
      setMessages((prev) => [
        ...prev,
        { sender: 'agent', text: `[Error: ${msg}]` },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal title={`${agent.avatar} ${agent.name}`} isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col md:flex-row gap-4 max-h-[75vh] overflow-hidden text-sm">
        {/* Left: Persona, Current Task, Status & Output */}
        <div className="w-full md:w-5/12 flex flex-col gap-3 border-b md:border-b-0 md:border-r border-border pb-3 md:pb-0 md:pr-3 overflow-y-auto pixel-scrollbar">
          <div className="bg-bg-dark border-2 border-border p-3 flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-3xl p-1 bg-bg border-2 border-border">{agent.avatar}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-accent-bright leading-tight truncate">{agent.name}</h3>
                <p className="text-xs text-text-muted">{agent.role}</p>
              </div>
            </div>

            {/* Current Status */}
            <div className="text-xs bg-bg p-2 border border-border flex items-center justify-between">
              <span className="text-text-muted font-bold">Status:</span>
              <span
                className={`font-bold uppercase text-[11px] px-2 py-0.5 border ${
                  activeTask
                    ? 'text-status-active border-accent bg-accent/20 pixel-pulse'
                    : 'text-status-success border-status-success/50 bg-status-success/10'
                }`}
              >
                {activeTask ? activeTask.status.toUpperCase() : 'IDLE'}
              </span>
            </div>

            {/* Current Task */}
            <div className="text-xs bg-bg p-2 border border-border flex flex-col gap-0.5">
              <span className="text-text-muted font-bold text-[11px] uppercase">Current Task</span>
              <span className="text-accent-bright font-bold truncate">
                {activeTask?.title || 'Standing by for objectives'}
              </span>
              {activeTask?.currentStep && (
                <p className="text-[11px] text-text/80 mt-0.5 leading-snug">{activeTask.currentStep}</p>
              )}
            </div>

            {/* Recent Output (if completed recently) */}
            {recentCompletedTask && (
              <div className="text-xs bg-bg p-2.5 border-2 border-accent/60 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-accent-bright font-bold text-[11px] uppercase">📄 Latest Deliverable</span>
                  <span className="text-[10px] text-status-success font-bold">SUCCESS</span>
                </div>
                <p className="text-text/90 italic text-[11px] line-clamp-3">
                  {recentCompletedTask.summary || recentCompletedTask.result}
                </p>
              </div>
            )}

            {/* Work Location */}
            <div className="text-[11px] px-2 py-1 bg-bg border border-border flex items-center gap-1.5 text-text/80">
              <span>📍</span>
              <span className="font-bold text-accent-bright truncate">{agent.defaultWorkLocation}</span>
            </div>

            {/* Core Capabilities */}
            <div className="mt-0.5">
              <span className="text-[10px] uppercase font-bold text-text-muted">Capabilities</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {agent.capabilities.map((c) => (
                  <span key={c} className="text-[10px] px-1.5 py-0.5 bg-bg border border-border text-text/80">
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Movement Controls */}
            <div className="pt-2 border-t border-border flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-bold text-text-muted">Office Interaction</span>
              <div className="grid grid-cols-3 gap-1.5">
                {onSendToDesk && (
                  <button
                    type="button"
                    onClick={() => {
                      onSendToDesk(agent.characterId);
                      onClose();
                    }}
                    className="min-h-[44px] p-1 bg-bg hover:bg-btn-hover border border-border text-[11px] font-bold text-text flex flex-col items-center justify-center transition-colors"
                  >
                    <span>🪑</span>
                    <span>Desk</span>
                  </button>
                )}
                {onSendToMeeting && (
                  <button
                    type="button"
                    onClick={() => {
                      onSendToMeeting(agent.characterId);
                      onClose();
                    }}
                    className="min-h-[44px] p-1 bg-bg hover:bg-btn-hover border border-border text-[11px] font-bold text-text flex flex-col items-center justify-center transition-colors"
                  >
                    <span>🛋️</span>
                    <span>Meeting</span>
                  </button>
                )}
                {onSendToOffice && (
                  <button
                    type="button"
                    onClick={() => {
                      onSendToOffice(agent.characterId);
                      onClose();
                    }}
                    className="min-h-[44px] p-1 bg-bg hover:bg-btn-hover border border-border text-[11px] font-bold text-text flex flex-col items-center justify-center transition-colors"
                  >
                    <span>☕</span>
                    <span>Break</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Agent Dialog (via server-side Gemini) */}
        <div className="w-full md:w-7/12 flex flex-col justify-between gap-3 h-80 md:h-[60vh]">
          {/* Messages Container */}
          <div className="flex-1 bg-bg-dark border-2 border-border p-3 overflow-y-auto flex flex-col gap-2.5 pixel-scrollbar">
            <span className="text-[10px] uppercase font-bold text-text-muted">Live Conversation with {agent.name}</span>
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-2 rounded-none text-xs max-w-[88%] ${
                  m.sender === 'user'
                    ? 'self-end bg-accent text-white'
                    : 'self-start bg-bg border border-border text-text'
                }`}
              >
                <span className="font-bold block text-[10px] opacity-75 mb-0.5">
                  {m.sender === 'user' ? 'You' : agent.name}
                </span>
                <p className="whitespace-pre-wrap leading-relaxed select-text text-xs">{m.text}</p>
              </div>
            ))}
            {isSending && (
              <div className="self-start bg-bg border border-border p-2 text-xs text-text-muted pixel-pulse">
                {agent.name} is typing...
              </div>
            )}
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSend} className="flex gap-2 items-center">
            <input
              type="text"
              placeholder={`Message ${agent.name}...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-bg-dark border-2 border-border p-2.5 text-text text-xs focus:border-accent outline-none min-h-[44px]"
            />
            <Button
              type="submit"
              variant="accent"
              disabled={!input.trim() || isSending}
              className="text-xs px-4 min-h-[44px] min-w-[64px]"
            >
              Send
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}
