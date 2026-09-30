import { useState } from 'react';

import { type AgentTask,APPLICATION_AGENTS } from '../../../core/src/index.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface ReportsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: AgentTask[];
  onOpenCreate: () => void;
}

export function ReportsDrawer({ isOpen, onClose, tasks, onOpenCreate }: ReportsDrawerProps) {
  const completedTasks = tasks.filter((t) => t.status === 'completed' && !!t.result);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentTask = completedTasks.find((r) => r.id === selectedReportId) || completedTasks[0];
  const agent = currentTask ? APPLICATION_AGENTS[currentTask.assignedAgentId as keyof typeof APPLICATION_AGENTS] : undefined;

  const handleCopy = () => {
    if (currentTask?.result) {
      void navigator.clipboard.writeText(currentTask.result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal title="Executive Reports & Deliverables" isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col md:flex-row gap-4 max-h-[75vh] overflow-hidden text-sm">
        {/* Left: Reports Roster */}
        <div className="w-full md:w-1/3 flex flex-col gap-2 border-b md:border-b-0 md:border-r border-border pb-3 md:pb-0 md:pr-3 overflow-y-auto max-h-48 md:max-h-[60vh] pixel-scrollbar">
          <Button variant="accent" onClick={onOpenCreate} className="w-full justify-center text-xs mb-1 min-h-[44px]">
            + New Task
          </Button>

          {completedTasks.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-xs border border-dashed border-border p-3">
              No completed task reports yet.
              <br />
              Deploy a task to an office agent to produce structured deliverables!
            </div>
          ) : (
            completedTasks.map((r) => {
              const a = APPLICATION_AGENTS[r.assignedAgentId as keyof typeof APPLICATION_AGENTS];
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedReportId(r.id)}
                  className={`text-left p-2.5 border-2 transition-colors flex flex-col gap-1 min-h-[44px] ${
                    currentTask?.id === r.id
                      ? 'bg-accent/20 border-accent'
                      : 'bg-bg-dark border-border hover:bg-btn-hover'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold truncate text-xs text-accent-bright">{r.title}</span>
                    <span className="text-[10px] text-status-success font-bold">READY</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span className="truncate flex items-center gap-1">
                      <span>{a?.avatar}</span>
                      <span>{a?.name}</span>
                    </span>
                    <span className="text-[10px]">
                      {r.completedAt
                        ? new Date(r.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                        : ''}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right: Master Report Body */}
        <div className="w-full md:w-2/3 flex flex-col gap-3 overflow-y-auto max-h-[60vh] pixel-scrollbar pr-1">
          {currentTask?.result ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-border flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-accent-bright">{currentTask.title}</h3>
                  <span className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
                    <span>Delivered by</span>
                    <span className="font-bold text-text">{agent?.name}</span>
                    <span>({agent?.role})</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="min-h-[44px] px-3 py-1.5 bg-bg-dark hover:bg-btn-hover border-2 border-border text-xs font-bold text-text transition-colors flex items-center gap-1.5"
                >
                  <span>{copied ? '✅' : '📋'}</span>
                  <span>{copied ? 'Copied!' : 'Copy Result'}</span>
                </button>
              </div>

              {currentTask.summary && (
                <div className="bg-bg-dark p-3 border-2 border-border text-xs text-text italic">
                  <span className="font-bold text-accent-bright">Summary: </span>
                  {currentTask.summary}
                </div>
              )}

              <div className="p-3 bg-bg-dark border-2 border-accent text-xs whitespace-pre-wrap leading-relaxed font-sans text-text overflow-x-auto select-text">
                {currentTask.result}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-text-muted text-xs">Select a completed report to view</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
