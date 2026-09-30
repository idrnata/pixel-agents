import { useState } from 'react';

import { type AgentTask,APPLICATION_AGENTS } from '../../../core/src/index.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface TasksDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: AgentTask[];
  onOpenCreate: () => void;
}

export function TasksDrawer({ isOpen, onClose, tasks, onOpenCreate }: TasksDrawerProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || tasks[0];

  const getStatusBadge = (status: AgentTask['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="text-status-success font-bold text-[11px] px-2 py-0.5 border border-status-success/50 bg-status-success/10">
            [COMPLETED]
          </span>
        );
      case 'working':
        return (
          <span className="text-status-active pixel-pulse font-bold text-[11px] px-2 py-0.5 border border-accent bg-accent/20">
            [WORKING]
          </span>
        );
      case 'planning':
        return (
          <span className="text-status-permission font-bold text-[11px] px-2 py-0.5 border border-status-permission/50 bg-status-permission/10">
            [PLANNING]
          </span>
        );
      case 'waiting':
        return (
          <span className="text-status-permission font-bold text-[11px] px-2 py-0.5 border border-status-permission/50 bg-status-permission/10">
            [WAITING]
          </span>
        );
      case 'failed':
        return (
          <span className="text-status-error font-bold text-[11px] px-2 py-0.5 border border-status-error/50 bg-status-error/10">
            [FAILED]
          </span>
        );
      default:
        return (
          <span className="text-text-muted font-bold text-[11px] px-2 py-0.5 border border-border bg-bg">
            [QUEUED]
          </span>
        );
    }
  };

  const getAssignedAgent = (agentId: string) => {
    return APPLICATION_AGENTS[agentId as keyof typeof APPLICATION_AGENTS];
  };

  return (
    <Modal title="AI Agent Tasks & Execution Log" isOpen={isOpen} onClose={onClose}>
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
              Deploy an objective for the office agents!
            </div>
          ) : (
            tasks.map((t) => {
              const agent = getAssignedAgent(t.assignedAgentId);
              return (
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
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span className="truncate flex items-center gap-1">
                      <span>{agent?.avatar || '🤖'}</span>
                      <span>{agent?.name || t.assignedAgentId}</span>
                    </span>
                    <span className="text-[10px]">
                      {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right: Task Details */}
        <div className="w-full md:w-2/3 flex flex-col gap-3 overflow-y-auto max-h-[60vh] pixel-scrollbar pr-1">
          {selectedTask ? (
            <>
              {/* Task Header */}
              <div className="bg-bg-dark p-3 border-2 border-border flex flex-col gap-1.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-base font-bold text-accent-bright leading-snug">{selectedTask.title}</h3>
                  {getStatusBadge(selectedTask.status)}
                </div>

                <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                  <span>Assignee:</span>
                  <span className="font-bold text-text flex items-center gap-1">
                    <span>{getAssignedAgent(selectedTask.assignedAgentId)?.avatar}</span>
                    <span>{getAssignedAgent(selectedTask.assignedAgentId)?.name}</span>
                  </span>
                  <span>•</span>
                  <span>ID: {selectedTask.id.slice(0, 8)}...</span>
                </div>

                <div className="bg-bg p-2 border border-border text-xs text-text/90 mt-1">
                  <span className="font-bold text-text-muted block text-[10px] uppercase mb-0.5">Directives:</span>
                  <p className="whitespace-pre-wrap">{selectedTask.description}</p>
                </div>

                {selectedTask.currentStep && selectedTask.status !== 'completed' && selectedTask.status !== 'failed' && (
                  <div className="text-[11px] text-accent-bright bg-accent/10 border border-accent/40 p-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent animate-ping" />
                    <span>Current Step: {selectedTask.currentStep}</span>
                  </div>
                )}
              </div>

              {/* Agent Timeline (Requirement 9) */}
              <div className="flex flex-col gap-1.5 bg-bg-dark p-3 border-2 border-border">
                <span className="text-[11px] uppercase font-bold text-text-muted flex items-center gap-1.5">
                  <span>⏱️</span>
                  <span>Agent Timeline</span>
                </span>
                <div className="flex flex-col gap-2 mt-1 border-l-2 border-border pl-3 ml-2">
                  {/* Phase 1: Queued & Ingested */}
                  <div className="relative flex flex-col gap-0.5 text-xs">
                    <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-status-success" />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">1. Ingestion & Setup</span>
                      <span className="text-[10px] text-text-muted">
                        {new Date(selectedTask.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted">Objective assigned to {getAssignedAgent(selectedTask.assignedAgentId)?.name}</p>
                  </div>

                  {/* Phase 2: Planning */}
                  <div className="relative flex flex-col gap-0.5 text-xs">
                    <div
                      className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ${
                        selectedTask.status === 'queued'
                          ? 'bg-text-muted'
                          : selectedTask.status === 'planning'
                            ? 'bg-status-permission animate-pulse'
                            : 'bg-status-success'
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">2. Strategy & Scope Planning</span>
                      <span className="text-[10px] uppercase font-bold text-text-muted">
                        {selectedTask.status === 'queued' ? 'PENDING' : selectedTask.status === 'planning' ? 'IN PROGRESS' : 'DONE'}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted">Formulating step decomposition and execution directives</p>
                  </div>

                  {/* Phase 3: Thinking */}
                  <div className="relative flex flex-col gap-0.5 text-xs">
                    <div
                      className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ${
                        selectedTask.status === 'queued' || selectedTask.status === 'planning'
                          ? 'bg-text-muted'
                          : selectedTask.status === 'thinking'
                            ? 'bg-status-permission animate-pulse'
                            : 'bg-status-success'
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">3. Analytical Reasoning</span>
                      <span className="text-[10px] uppercase font-bold text-text-muted">
                        {selectedTask.status === 'queued' || selectedTask.status === 'planning' ? 'PENDING' : selectedTask.status === 'thinking' ? 'IN PROGRESS' : 'DONE'}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted">Agent reasoning over domain context and facts</p>
                  </div>

                  {/* Phase 4: Working (Gemini Execution) */}
                  <div className="relative flex flex-col gap-0.5 text-xs">
                    <div
                      className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ${
                        selectedTask.status === 'working'
                          ? 'bg-accent animate-ping'
                          : selectedTask.status === 'completed'
                            ? 'bg-status-success'
                            : selectedTask.status === 'failed'
                              ? 'bg-status-error'
                              : 'bg-text-muted'
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">4. Server Gemini Model Execution</span>
                      <span className="text-[10px] uppercase font-bold text-text-muted">
                        {selectedTask.status === 'working' ? 'EXECUTING' : selectedTask.status === 'completed' ? 'DONE' : selectedTask.status === 'failed' ? 'FAILED' : 'PENDING'}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted">Calling Gemini 3.8 Flash model on backend runtime</p>
                  </div>

                  {/* Phase 5: Final Delivery */}
                  <div className="relative flex flex-col gap-0.5 text-xs">
                    <div
                      className={`absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full ${
                        selectedTask.status === 'completed'
                          ? 'bg-status-success'
                          : selectedTask.status === 'failed'
                            ? 'bg-status-error'
                            : 'bg-text-muted'
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-text">5. Synthesis & Results</span>
                      <span className="text-[10px] uppercase font-bold text-text-muted">
                        {selectedTask.status === 'completed' ? 'DELIVERED' : selectedTask.status === 'failed' ? 'FAILED' : 'WAITING'}
                      </span>
                    </div>
                    {selectedTask.completedAt && (
                      <p className="text-[10px] text-text-muted">
                        Finished in {Math.max(1, Math.round((selectedTask.completedAt - selectedTask.createdAt) / 1000))}s
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Subtasks / Steps (Requirement 9) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase font-bold text-text-muted">
                  Subtasks & Execution Steps
                </span>
                {selectedTask.steps && selectedTask.steps.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {selectedTask.steps.map((s, idx) => (
                      <div key={idx} className="p-2 bg-bg-dark border border-border flex items-start justify-between gap-2 text-xs">
                        <div>
                          <span className="font-bold text-text">{s.name}</span>
                          {s.description && <p className="text-text-muted text-[11px] mt-0.5">{s.description}</p>}
                        </div>
                        <span className="text-[10px] text-status-success font-bold uppercase">[COMPLETED]</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2 bg-bg-dark border border-border text-xs text-text-muted italic">
                    Pipeline steps configured automatically by assigned agent.
                  </div>
                )}
              </div>

              {/* Task Result (Completed) */}
              {selectedTask.status === 'completed' && selectedTask.result && (
                <div className="flex flex-col gap-2 bg-bg-dark p-3.5 border-2 border-accent">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <h4 className="text-sm font-bold text-accent-bright uppercase flex items-center gap-1.5">
                      <span>📑</span>
                      <span>Task Result</span>
                    </h4>
                    <span className="text-[11px] text-status-success font-bold px-2 py-0.5 border border-status-success/50 bg-status-success/10">
                      SUCCESS
                    </span>
                  </div>

                  {selectedTask.summary && (
                    <div className="bg-bg p-2.5 border border-border text-xs text-text italic">
                      💡 <span className="font-bold">Summary:</span> {selectedTask.summary}
                    </div>
                  )}

                  <div className="p-3 bg-bg border border-border text-xs whitespace-pre-wrap leading-relaxed font-sans text-text overflow-x-auto select-text">
                    {selectedTask.result}
                  </div>
                </div>
              )}

              {/* Task Error (Failed) */}
              {selectedTask.status === 'failed' && (
                <div className="flex flex-col gap-2 bg-bg-dark p-3.5 border-2 border-status-error">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <h4 className="text-sm font-bold text-status-error uppercase flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>Task Failed</span>
                    </h4>
                    <span className="text-[11px] text-status-error font-bold px-2 py-0.5 border border-status-error/50 bg-status-error/10">
                      ERROR
                    </span>
                  </div>

                  <div className="bg-bg p-3 border border-status-error/40 text-xs text-status-error">
                    <span className="font-bold block mb-1">Execution Failure:</span>
                    <p className="whitespace-pre-wrap font-mono text-[11px]">{selectedTask.error || 'Unknown error occurred during execution.'}</p>
                  </div>
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
