import type { AgentState, AgentTask } from '../agents/types.js';

interface MobileHeaderProps {
  agents: AgentState[];
  activeTask?: AgentTask;
  onOpenTasks: () => void;
  onOpenCreateTask: () => void;
}

export function MobileHeader({
  agents,
  activeTask,
  onOpenTasks,
  onOpenCreateTask,
}: MobileHeaderProps) {
  const workingCount = agents.filter(
    (a) => a.status === 'working' || a.status === 'thinking' || a.status === 'writing' || a.status === 'reading',
  ).length;

  return (
    <header className="absolute top-0 left-0 right-0 z-20 pointer-events-none p-2 sm:p-3 flex items-start justify-between gap-2 max-w-full overflow-hidden">
      {/* Brand & Live Office Status Badge */}
      <div className="pointer-events-auto flex flex-col gap-1 min-w-0">
        <div className="pixel-panel px-3 py-1.5 flex items-center gap-2 bg-bg/95 backdrop-blur-sm border-2 border-border shadow-pixel min-h-[44px]">
          <div className="w-2.5 h-2.5 rounded-full bg-status-success animate-pulse shrink-0" />
          <h1 className="text-xs sm:text-sm font-bold tracking-wide text-white truncate">
            INDRA <span className="text-accent-bright">AI OFFICE</span>
          </h1>
          <span className="text-[10px] px-1.5 py-0.5 bg-bg-dark border border-border text-text-muted hidden sm:inline-block">
            Gemini 3.8
          </span>
        </div>

        {/* Live Active Task Indicator */}
        {activeTask && activeTask.status === 'in_progress' && (
          <button
            type="button"
            onClick={onOpenTasks}
            className="pointer-events-auto pixel-panel px-3 py-1.5 flex items-center gap-2 bg-bg-dark/95 border-2 border-accent text-left animate-fadeIn max-w-[280px] sm:max-w-xs min-h-[44px] cursor-pointer"
          >
            <span className="text-xs text-status-active pixel-pulse shrink-0">⚡</span>
            <div className="truncate text-xs min-w-0">
              <span className="font-bold text-accent-bright truncate block">{activeTask.title}</span>
              <span className="text-[11px] text-text-muted">
                {workingCount} agent{workingCount !== 1 ? 's' : ''} in progress
              </span>
            </div>
          </button>
        )}
      </div>

      {/* Quick "New Task" Button */}
      <div className="pointer-events-auto shrink-0">
        <button
          type="button"
          onClick={onOpenCreateTask}
          className="pixel-panel px-3.5 py-2 bg-accent hover:bg-accent-bright text-white font-bold text-xs flex items-center gap-1.5 shadow-pixel transition-transform active:scale-95 cursor-pointer min-h-[44px] border-2 border-accent-bright"
          title="Deploy a new objective for the AI agents"
        >
          <span className="text-sm">🚀</span>
          <span className="font-bold">New Task</span>
        </button>
      </div>
    </header>
  );
}
