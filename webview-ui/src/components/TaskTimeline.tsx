import type { AgentTask, TimelineStep } from '../agents/types.js';

interface TaskTimelineProps {
  task: AgentTask;
}

export function TaskTimeline({ task }: TaskTimelineProps) {
  const getStepStatusIcon = (status: TimelineStep['status']) => {
    switch (status) {
      case 'completed':
        return <span className="text-status-success font-bold">✓</span>;
      case 'in_progress':
        return <span className="text-status-active pixel-pulse font-bold">⚡</span>;
      case 'failed':
        return <span className="text-status-error font-bold">✗</span>;
      default:
        return <span className="text-text-muted">○</span>;
    }
  };

  const getStepBorderColor = (status: TimelineStep['status']) => {
    switch (status) {
      case 'completed':
        return 'border-status-success/80 bg-bg-dark';
      case 'in_progress':
        return 'border-accent bg-accent/10';
      case 'failed':
        return 'border-status-error bg-status-error/10';
      default:
        return 'border-border/50 bg-bg-dark/40 opacity-70';
    }
  };

  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex items-center justify-between pb-1 border-b border-border/70">
        <h4 className="text-xs uppercase font-bold text-accent-bright flex items-center gap-1.5">
          <span>📊</span>
          <span>Task Execution Graph (Sequential Delegation)</span>
        </h4>
        <span className="text-[11px] text-text-muted">
          USER → MANAGER → RESEARCHER → ANALYST → MANAGER
        </span>
      </div>

      <div className="flex flex-col gap-2.5 relative">
        {task.timeline.map((step, idx) => {
          const isLast = idx === task.timeline.length - 1;
          const output = step.output;

          return (
            <div key={step.id} className="relative flex items-start gap-2.5">
              {/* Vertical connector line */}
              {!isLast && (
                <div
                  className={`absolute left-[13px] top-[26px] bottom-[-10px] w-[2px] z-0 ${
                    step.status === 'completed' ? 'bg-status-success/60' : 'bg-border'
                  }`}
                />
              )}

              {/* Node Icon */}
              <div
                className={`w-7 h-7 shrink-0 z-10 flex items-center justify-center border-2 text-xs font-bold ${
                  step.status === 'completed'
                    ? 'border-status-success bg-bg text-status-success'
                    : step.status === 'in_progress'
                      ? 'border-accent bg-bg-dark text-accent-bright animate-pulse'
                      : 'border-border bg-bg-dark text-text-muted'
                }`}
              >
                {getStepStatusIcon(step.status)}
              </div>

              {/* Step Card */}
              <div className={`flex-1 border-2 p-2.5 flex flex-col gap-1.5 text-xs ${getStepBorderColor(step.status)}`}>
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{step.agentAvatar}</span>
                    <span className="font-bold text-text">{step.agentName}</span>
                    <span className="text-[11px] text-text-muted">({step.agentRole})</span>
                  </div>
                  <span
                    className={`font-bold uppercase text-[11px] px-1.5 py-0.2 border ${
                      step.status === 'completed'
                        ? 'text-status-success border-status-success/40 bg-status-success/10'
                        : step.status === 'in_progress'
                          ? 'text-status-active border-accent bg-accent/20 pixel-pulse'
                          : 'text-text-muted border-border'
                    }`}
                  >
                    {step.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="text-xs text-text/90">
                  <strong className="text-accent-bright">{step.title}</strong>
                  <p className="text-text-muted text-[12px] mt-0.5">{step.description}</p>
                </div>

                {/* Structured JSON Output Box */}
                {output && (
                  <div className="mt-1 bg-bg border border-border p-2 flex flex-col gap-1.5 text-[12px] font-mono">
                    <div className="flex items-center justify-between text-accent-bright font-bold">
                      <span>📄 Structured Agent Output</span>
                      <span className="text-[10px] text-text-muted">ID: {output.agentId}</span>
                    </div>

                    <p className="text-text/90 italic font-sans">{output.summary}</p>

                    {output.findings.length > 0 && (
                      <div className="mt-0.5">
                        <span className="font-bold text-text text-[11px] font-sans">🔍 Key Findings:</span>
                        <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-text-muted font-sans">
                          {output.findings.map((f, i) => (
                            <li key={i} className="text-[11px] leading-tight text-text/90">
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {output.risks.length > 0 && (
                      <div className="mt-0.5">
                        <span className="font-bold text-warning text-[11px] font-sans">⚠️ Risk Vectors:</span>
                        <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-text-muted font-sans">
                          {output.risks.map((r, i) => (
                            <li key={i} className="text-[11px] leading-tight text-text/90">
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-1 pt-1 border-t border-border/70 flex items-center gap-1 text-[11px] text-text-muted font-sans">
                      <span className="font-bold text-accent-bright">Next Action:</span>
                      <span>{output.nextAction}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
