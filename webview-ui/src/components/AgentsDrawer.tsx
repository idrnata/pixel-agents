import type { ApplicationAgent } from '../../../core/src/index.js';
import { aiAgentClient } from '../services/aiAgentClient.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface AgentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  agents: ApplicationAgent[];
  onSelectAgent: (agent: ApplicationAgent) => void;
  onFocusCharacter: (characterId: number) => void;
}

export function AgentsDrawer({ isOpen, onClose, agents, onSelectAgent, onFocusCharacter }: AgentsDrawerProps) {
  if (!isOpen) return null;

  return (
    <Modal title="INDRA AI Office Agents" isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-3.5 text-sm max-h-[70vh] overflow-y-auto pixel-scrollbar">
        <p className="text-xs text-text-muted">
          Active AI specialists residing in the pixel-art office. Click an agent to inspect details, review outputs, or converse live.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {agents.map((ag) => {
            const activeTask = aiAgentClient.getActiveTaskForAgent(ag.id);
            return (
              <div
                key={ag.id}
                className="bg-bg-dark border-2 border-border p-3.5 flex flex-col justify-between gap-3 hover:border-accent transition-colors"
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-3xl p-1 bg-bg border-2 border-border">{ag.avatar}</span>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-accent-bright leading-tight truncate">{ag.name}</h4>
                      <span className="text-[11px] text-text-muted block truncate">{ag.role}</span>
                    </div>
                  </div>

                  {/* Desk Location Badge */}
                  <div className="text-[11px] px-2 py-1 bg-bg border border-border flex items-center gap-1.5 text-text/80">
                    <span>📍</span>
                    <span className="font-bold text-accent-bright truncate">{ag.defaultWorkLocation}</span>
                  </div>

                  {/* Status */}
                  <div className="text-xs bg-bg p-2 border border-border flex items-center justify-between">
                    <span className="text-text-muted font-bold text-[11px]">STATUS:</span>
                    <span
                      className={`font-bold uppercase text-[10px] px-2 py-0.5 border ${
                        activeTask
                          ? 'text-status-active border-accent bg-accent/20 pixel-pulse'
                          : 'text-status-success border-status-success/50 bg-status-success/10'
                      }`}
                    >
                      {activeTask ? activeTask.status.toUpperCase() : 'IDLE'}
                    </span>
                  </div>

                  {activeTask?.currentStep && (
                    <p className="text-[11px] text-text/80 bg-bg p-1.5 border border-border/60 leading-snug">
                      {activeTask.currentStep}
                    </p>
                  )}

                  <p className="text-[11px] text-text-muted italic leading-relaxed">{ag.description}</p>

                  <div className="flex flex-wrap gap-1 mt-1">
                    {ag.capabilities.map((cap) => (
                      <span key={cap} className="text-[10px] px-1.5 py-0.5 bg-bg border border-border/80 text-text/80">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button
                    variant="accent"
                    onClick={() => {
                      onSelectAgent(ag);
                      onClose();
                    }}
                    className="flex-1 justify-center text-xs min-h-[44px]"
                  >
                    💬 Inspect / Chat
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      onFocusCharacter(ag.characterId);
                      onClose();
                    }}
                    className="min-h-[44px] min-w-[44px] px-2.5 bg-bg hover:bg-btn-hover border-2 border-border text-xs font-bold text-text flex items-center justify-center transition-colors"
                    title="Focus camera on agent"
                  >
                    📍 Focus
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
