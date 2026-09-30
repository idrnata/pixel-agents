import { useState } from 'react';

import type { AgentTask } from '../agents/types.js';
import { TaskTimeline } from './TaskTimeline.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface TasksDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: AgentTask[];
  onOpenCreate: () => void;
  initialTab?: 'timeline' | 'subtasks' | 'report';
}

export function TasksDrawer({ isOpen, onClose, tasks, onOpenCreate, initialTab = 'timeline' }: TasksDrawerProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'subtasks' | 'report'>(initialTab);

  if (!isOpen) return null;

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || tasks[0];

  const getStatusBadge = (status: AgentTask['status']) => {
    switch (status) {
      case 'completed':
        return <span className="text-status-success font-bold text-[11px] px-2 py-0.5 border border-status-success/50 bg-status-success/10">[COMPLETED]</span>;
      case 'in_progress':
        return <span className="text-status-active pixel-pulse font-bold text-[11px] px-2 py-0.5 border border-accent bg-accent/20">[IN PROGRESS]</span>;
      case 'failed':
        return <span className="text-status-error font-bold text-[11px] px-2 py-0.5 border border-status-error/50 bg-status-error/10">[FAILED]</span>;
      default:
        return <span className="text-text-muted font-bold text-[11px] px-2 py-0.5 border border-border bg-bg">[PENDING]</span>;
    }
  };

  return (
    <Modal title="Team Tasks & Executive Reports" isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col md:flex-row gap-4 max-h-[75vh] overflow-hidden text-sm">
        {/* Left: Tasks List */}
        <div className="w-full md:w-1/3 flex flex-col gap-2 border-b md:border-b-0 md:border-r border-border pb-3 md:pb-0 md:pr-3 overflow-y-auto max-h-48 md:max-h-[60vh] pixel-scrollbar">
          <Button
            variant="accent"
            onClick={onOpenCreate}
            className="w-full justify-center text-xs mb-1 min-h-[44px]"
          >
            + New Task
          </Button>

          {tasks.length === 0 ? (
            <div className="text-center py-6 text-text-muted text-xs">
              No tasks launched yet.
              <br />
              Deploy an objective for the team!
            </div>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTaskId(t.id)}
                className={`text-left p-2.5 border-2 transition-colors flex flex-col gap-1 min-h-[44px] ${
                  selectedTask?.id === t.id
                    ? 'bg-accent/20 border-accent'
                    : 'bg-bg-dark border-border hover:bg-btn-hover'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold truncate text-xs text-text">{t.title}</span>
                  {getStatusBadge(t.status)}
                </div>
                <span className="text-text-muted text-[12px] truncate">{t.description}</span>
                <span className="text-text-muted text-[10px]">
                  {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Right: Task Details (Name, Status, Timeline, Subtasks, Results) */}
        <div className="w-full md:w-2/3 flex flex-col gap-3 overflow-y-auto max-h-[60vh] pixel-scrollbar pr-1">
          {selectedTask ? (
            <>
              {/* Task Header */}
              <div className="bg-bg-dark p-3 border-2 border-border flex flex-col gap-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-base font-bold text-accent-bright leading-snug">{selectedTask.title}</h3>
                  {getStatusBadge(selectedTask.status)}
                </div>
                <p className="text-text-muted text-xs mt-0.5">{selectedTask.description}</p>
                <span className="text-[10px] text-text-muted mt-1">Task ID: {selectedTask.id}</span>
              </div>

              {/* View Tabs */}
              <div className="grid grid-cols-3 gap-1.5 border-b border-border pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('timeline')}
                  className={`min-h-[44px] px-2 py-1.5 text-xs font-bold border transition-colors flex items-center justify-center gap-1 ${
                    activeTab === 'timeline'
                      ? 'bg-accent text-white border-accent-bright'
                      : 'bg-bg-dark text-text-muted border-border hover:bg-btn-hover'
                  }`}
                >
                  <span>📈</span>
                  <span className="truncate">Timeline</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('subtasks')}
                  className={`min-h-[44px] px-2 py-1.5 text-xs font-bold border transition-colors flex items-center justify-center gap-1 ${
                    activeTab === 'subtasks'
                      ? 'bg-accent text-white border-accent-bright'
                      : 'bg-bg-dark text-text-muted border-border hover:bg-btn-hover'
                  }`}
                >
                  <span>🧩</span>
                  <span className="truncate">Subtasks ({selectedTask.subtasks.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('report')}
                  className={`min-h-[44px] px-2 py-1.5 text-xs font-bold border transition-colors flex items-center justify-center gap-1 ${
                    activeTab === 'report'
                      ? 'bg-accent text-white border-accent-bright'
                      : 'bg-bg-dark text-text-muted border-border hover:bg-btn-hover'
                  }`}
                >
                  <span>📑</span>
                  <span className="truncate">Results & Report</span>
                </button>
              </div>

              {/* Tab 1: Agent Timeline & Task Graph */}
              {activeTab === 'timeline' && (
                <div className="flex flex-col gap-3">
                  <TaskTimeline task={selectedTask} />
                </div>
              )}

              {/* Tab 2: Subtasks Breakdown */}
              {activeTab === 'subtasks' && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-border/70">
                    <h4 className="text-xs uppercase font-bold text-accent-bright">Agent Subtask Pipeline</h4>
                    <span className="text-[11px] text-text-muted">{selectedTask.subtasks.length} Subtasks</span>
                  </div>

                  {selectedTask.subtasks.length === 0 ? (
                    <div className="text-center py-6 text-text-muted text-xs">
                      No subtasks generated yet. Manager Indra is planning work.
                    </div>
                  ) : (
                    selectedTask.subtasks.map((st) => (
                      <div key={st.id} className="border-2 border-border p-3 bg-bg-dark flex flex-col gap-2 text-xs">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-accent-bright">{st.agentName}</span>
                            <span className="text-[11px] text-text-muted">({st.agentRole})</span>
                          </div>
                          <span
                            className={`font-bold text-[10px] uppercase px-1.5 py-0.2 border ${
                              st.status === 'completed'
                                ? 'text-status-success border-status-success/50 bg-status-success/10'
                                : st.status === 'in_progress'
                                  ? 'text-status-active border-accent bg-accent/20 pixel-pulse'
                                  : 'text-text-muted border-border'
                            }`}
                          >
                            [{st.status.toUpperCase()}]
                          </span>
                        </div>

                        <div className="text-text font-bold text-xs">{st.title}</div>
                        <p className="text-text-muted text-[12px]">{st.instruction}</p>

                        {/* Subtask Result */}
                        {st.structuredOutput ? (
                          <div className="bg-bg border border-border p-2 mt-1 flex flex-col gap-1 text-[11px]">
                            <span className="font-bold text-accent-bright uppercase">Output Summary:</span>
                            <p className="text-text/90 italic">{st.structuredOutput.summary}</p>
                            {st.structuredOutput.findings.length > 0 && (
                              <div className="mt-1">
                                <span className="font-bold text-text">Findings:</span>
                                <ul className="list-disc list-inside space-y-0.5 text-text-muted mt-0.5">
                                  {st.structuredOutput.findings.map((f, i) => (
                                    <li key={i}>{f}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : st.result ? (
                          <div className="bg-bg border border-border p-2 mt-1 text-[11px] text-text/90 font-mono whitespace-pre-wrap max-h-36 overflow-y-auto pixel-scrollbar">
                            {st.result}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 3: Final Master Report & Results */}
              {activeTab === 'report' && (
                <div className="flex flex-col gap-3">
                  {selectedTask.finalReport ? (
                    <div className="flex flex-col gap-2 bg-bg-dark p-3.5 border-2 border-accent">
                      <div className="flex items-center justify-between pb-2 border-b border-border">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📑</span>
                          <div>
                            <h4 className="text-sm font-bold text-accent-bright uppercase">Executive Master Report</h4>
                            <span className="text-[11px] text-text-muted">Synthesized by Indra (Manager)</span>
                          </div>
                        </div>
                        <span className="text-[11px] text-status-success font-bold px-2 py-0.5 border border-status-success/50 bg-status-success/10">
                          SYNTHESIS READY
                        </span>
                      </div>

                      {/* Synthesis Summary */}
                      {selectedTask.summary && (
                        <div className="bg-bg p-2.5 border border-border text-xs text-text italic">
                          💡 <span className="font-bold">Executive Summary:</span> {selectedTask.summary}
                        </div>
                      )}

                      {/* Full Markdown Report */}
                      <div className="p-3 bg-bg border border-border text-xs whitespace-pre-wrap leading-relaxed font-sans text-text overflow-x-auto select-text">
                        {selectedTask.finalReport}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10 text-text-muted text-xs border-2 border-dashed border-border flex flex-col items-center gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                      <span>Report is currently being processed by the AI Agent team...</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-text-muted text-xs">Select a task to view details</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
