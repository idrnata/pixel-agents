import { useState } from 'react';

import type { AgentTask } from '../agents/types.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface ReportsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: AgentTask[];
  onOpenCreate: () => void;
}

export function ReportsDrawer({ isOpen, onClose, tasks, onOpenCreate }: ReportsDrawerProps) {
  const reports = tasks.filter((t) => !!t.finalReport);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentReport = reports.find((r) => r.id === selectedReportId) || reports[0];

  const handleCopy = () => {
    if (currentReport?.finalReport) {
      void navigator.clipboard.writeText(currentReport.finalReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal title="Executive Master Reports" isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col md:flex-row gap-4 max-h-[75vh] overflow-hidden text-sm">
        {/* Left: Reports Roster */}
        <div className="w-full md:w-1/3 flex flex-col gap-2 border-b md:border-b-0 md:border-r border-border pb-3 md:pb-0 md:pr-3 overflow-y-auto max-h-48 md:max-h-[60vh] pixel-scrollbar">
          <Button variant="accent" onClick={onOpenCreate} className="w-full justify-center text-xs mb-1 min-h-[44px]">
            + New Objective
          </Button>

          {reports.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-xs border border-dashed border-border p-3">
              No completed master reports yet.
              <br />
              Launch a task to trigger multi-agent research and synthesis!
            </div>
          ) : (
            reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedReportId(r.id)}
                className={`text-left p-2.5 border-2 transition-colors flex flex-col gap-1 min-h-[44px] ${
                  currentReport?.id === r.id
                    ? 'bg-accent/20 border-accent'
                    : 'bg-bg-dark border-border hover:bg-btn-hover'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold truncate text-xs text-accent-bright">{r.title}</span>
                  <span className="text-[10px] text-status-success font-bold">READY</span>
                </div>
                <span className="text-text-muted text-[11px] truncate">
                  {r.completedAt
                    ? new Date(r.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                    : ''}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Right: Master Report Body */}
        <div className="w-full md:w-2/3 flex flex-col gap-3 overflow-y-auto max-h-[60vh] pixel-scrollbar pr-1">
          {currentReport?.finalReport ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-border flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-accent-bright">{currentReport.title}</h3>
                  <span className="text-[11px] text-text-muted">Synthesized by Indra (Manager)</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="min-h-[44px] px-3 py-1.5 bg-bg-dark hover:bg-btn-hover border-2 border-border text-xs font-bold text-text transition-colors flex items-center gap-1.5"
                >
                  <span>{copied ? '✅' : '📋'}</span>
                  <span>{copied ? 'Copied!' : 'Copy Markdown'}</span>
                </button>
              </div>

              {currentReport.summary && (
                <div className="bg-bg-dark p-3 border-2 border-border text-xs text-text italic">
                  <span className="font-bold text-accent-bright">Executive Summary: </span>
                  {currentReport.summary}
                </div>
              )}

              <div className="p-3 bg-bg-dark border-2 border-accent text-xs whitespace-pre-wrap leading-relaxed font-sans text-text overflow-x-auto select-text">
                {currentReport.finalReport}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-text-muted text-xs">Select a report to read</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
