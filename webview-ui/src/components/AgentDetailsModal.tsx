import { useEffect, useState } from 'react';

import { agentManager } from '../agents/AgentManager.js';
import type { AgentMessage, AgentState } from '../agents/types.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface AgentDetailsModalProps {
  agent: AgentState | null;
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
  const [recentTeamMessages, setRecentTeamMessages] = useState<AgentMessage[]>([]);

  useEffect(() => {
    if (agent) {
      setMessages([
        {
          sender: 'agent',
          text: `Hello! I am ${agent.name}, ${agent.role} in INDRA AI OFFICE. Standing by for instructions or task queries.`,
        },
      ]);
      // Fetch recent messages involving this agent
      const allMsgs = agentManager.getMessages();
      const agentMsgs = allMsgs.filter((m) => m.fromAgentId === agent.id || m.toAgentId === agent.id);
      setRecentTeamMessages(agentMsgs.slice(-4));
    }
  }, [agent]);

  if (!isOpen || !agent) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const userText = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setIsSending(true);

    try {
      const res = await fetch('/api/agents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userText,
          systemInstruction: `${agent.systemPrompt}\nYou are currently conversing live with the user in INDRA AI OFFICE. Be concise, brilliant, and stay in character.`,
        }),
      });
      const data = (await res.json()) as { text?: string };
      const reply = data.text || 'I have analyzed your input and am ready for next instructions.';
      setMessages((prev) => [...prev, { sender: 'agent', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: 'agent', text: 'I am currently processing background tasks. Ready for instructions!' },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const getStatusColor = (status: AgentState['status']) => {
    switch (status) {
      case 'working':
      case 'writing':
      case 'reading':
        return 'text-status-active border-status-active bg-status-active/10';
      case 'thinking':
      case 'waiting':
        return 'text-status-permission border-status-permission bg-status-permission/10';
      case 'completed':
        return 'text-status-success border-status-success bg-status-success/10';
      case 'error':
        return 'text-status-error border-status-error bg-status-error/10';
      default:
        return 'text-text-muted border-border bg-bg-dark';
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
              <span className={`font-bold uppercase text-[11px] px-2 py-0.5 border ${getStatusColor(agent.status)}`}>
                {agent.status}
              </span>
            </div>

            {/* Current Task */}
            <div className="text-xs bg-bg p-2 border border-border flex flex-col gap-0.5">
              <span className="text-text-muted font-bold text-[11px] uppercase">Current Task</span>
              <span className="text-accent-bright font-bold truncate">
                {agent.currentTaskTitle || agent.currentTask || 'Idle (Standing by for objectives)'}
              </span>
              {agent.currentStepDescription && (
                <p className="text-[11px] text-text/80 mt-0.5 leading-snug">{agent.currentStepDescription}</p>
              )}
            </div>

            {/* Current Output (if available) */}
            {agent.latestOutput && (
              <div className="text-xs bg-bg p-2.5 border-2 border-accent/60 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-accent-bright font-bold text-[11px] uppercase">📄 Latest Output</span>
                  <span className="text-[10px] text-text-muted">Structured</span>
                </div>
                <p className="text-text/90 italic text-[11px]">{agent.latestOutput.summary}</p>

                {agent.latestOutput.findings.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-text uppercase">Key Findings:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-text/80 mt-0.5">
                      {agent.latestOutput.findings.slice(0, 3).map((f, i) => (
                        <li key={i} className="truncate">
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {agent.latestOutput.risks.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-warning uppercase">Risk Vectors:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-text/80 mt-0.5">
                      {agent.latestOutput.risks.slice(0, 2).map((r, i) => (
                        <li key={i} className="truncate">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

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

            {/* Movement Controls (Desk / Meeting / Office) */}
            <div className="pt-2 border-t border-border flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-bold text-text-muted">Direct Agent Movement</span>
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

        {/* Right: Recent Team Messages & Interactive Live Chat */}
        <div className="w-full md:w-7/12 flex flex-col justify-between gap-3 h-80 md:h-[60vh]">
          {/* Messages Container */}
          <div className="flex-1 bg-bg-dark border-2 border-border p-3 overflow-y-auto flex flex-col gap-2.5 pixel-scrollbar">
            {/* Recent Team Messages */}
            {recentTeamMessages.length > 0 && (
              <div className="mb-2 pb-2 border-b border-border/80 flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-text-muted">Recent Team Communications</span>
                {recentTeamMessages.map((m) => (
                  <div key={m.id} className="p-1.5 bg-bg border border-border/70 text-[11px] flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[10px] text-text-muted">
                      <span className="font-bold text-accent-bright">{m.fromAgentName}</span>
                      <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-text/90 line-clamp-2">{m.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Live Chat Messages */}
            <span className="text-[10px] uppercase font-bold text-text-muted">Live Agent Dialog</span>
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
