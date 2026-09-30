import type { AgentTask } from '../agents/types.js';

interface BottomToolbarProps {
  currentTab: 'office' | 'tasks' | 'agents' | 'reports';
  onSelectTab: (tab: 'office' | 'tasks' | 'agents' | 'reports') => void;
  isEditMode: boolean;
  onToggleEditMode: () => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  tasks: AgentTask[];
  agentCount: number;
}

export function BottomToolbar({
  currentTab,
  onSelectTab,
  isEditMode,
  onToggleEditMode,
  isSettingsOpen,
  onToggleSettings,
  tasks,
  agentCount,
}: BottomToolbarProps) {
  const activeTaskCount = tasks.filter((t) => t.status === 'in_progress').length;
  const completedReportsCount = tasks.filter((t) => !!t.finalReport).length;

  return (
    <nav
      aria-label="Office navigation"
      className="fixed bottom-0 left-0 right-0 z-30 flex justify-center pointer-events-none pb-safe px-2 pb-2 md:pb-4"
    >
      <div className="pointer-events-auto flex items-center justify-between gap-1 sm:gap-2 pixel-panel p-1.5 bg-bg/95 backdrop-blur-md shadow-pixel border-2 border-border max-w-full w-full sm:w-auto overflow-hidden">
        {/* 1. Office */}
        <button
          type="button"
          onClick={() => onSelectTab('office')}
          className={`flex-1 sm:flex-initial min-h-[44px] min-w-[44px] px-2.5 sm:px-4 py-2 text-xs font-bold transition-transform active:scale-95 flex items-center justify-center gap-1.5 border-2 ${
            currentTab === 'office' && !isEditMode && !isSettingsOpen
              ? 'bg-accent text-white border-accent-bright shadow-pixel'
              : 'bg-btn-bg hover:bg-btn-hover text-text border-border'
          }`}
          title="Return to Pixel Office"
        >
          <span className="text-sm">🏢</span>
          <span className="text-[12px] sm:text-xs">Office</span>
        </button>

        {/* 2. Tasks */}
        <button
          type="button"
          onClick={() => onSelectTab('tasks')}
          className={`flex-1 sm:flex-initial min-h-[44px] min-w-[44px] px-2.5 sm:px-4 py-2 text-xs font-bold transition-transform active:scale-95 flex items-center justify-center gap-1.5 border-2 relative ${
            currentTab === 'tasks'
              ? 'bg-accent text-white border-accent-bright shadow-pixel'
              : 'bg-btn-bg hover:bg-btn-hover text-text border-border'
          }`}
          title="Team Tasks & Execution Graph"
        >
          <span className="text-sm">📋</span>
          <span className="text-[12px] sm:text-xs">Tasks</span>
          {activeTaskCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 bg-status-active text-black font-extrabold text-[10px] rounded-full border border-black animate-pulse">
              {activeTaskCount}
            </span>
          )}
        </button>

        {/* 3. Agents */}
        <button
          type="button"
          onClick={() => onSelectTab('agents')}
          className={`flex-1 sm:flex-initial min-h-[44px] min-w-[44px] px-2.5 sm:px-4 py-2 text-xs font-bold transition-transform active:scale-95 flex items-center justify-center gap-1.5 border-2 ${
            currentTab === 'agents'
              ? 'bg-accent text-white border-accent-bright shadow-pixel'
              : 'bg-btn-bg hover:bg-btn-hover text-text border-border'
          }`}
          title="Team Agents Roster"
        >
          <span className="text-sm">👥</span>
          <span className="text-[12px] sm:text-xs">Agents ({agentCount})</span>
        </button>

        {/* 4. Reports */}
        <button
          type="button"
          onClick={() => onSelectTab('reports')}
          className={`flex-1 sm:flex-initial min-h-[44px] min-w-[44px] px-2.5 sm:px-4 py-2 text-xs font-bold transition-transform active:scale-95 flex items-center justify-center gap-1.5 border-2 relative ${
            currentTab === 'reports'
              ? 'bg-accent text-white border-accent-bright shadow-pixel'
              : 'bg-btn-bg hover:bg-btn-hover text-text border-border'
          }`}
          title="Executive Master Reports"
        >
          <span className="text-sm">📑</span>
          <span className="text-[12px] sm:text-xs">Reports</span>
          {completedReportsCount > 0 && (
            <span className="hidden xs:inline-block px-1.5 py-0.2 bg-status-success/20 text-status-success font-bold text-[10px] border border-status-success/40">
              {completedReportsCount}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="h-6 w-[1px] bg-border my-auto mx-0.5 hidden xs:block" />

        {/* Edit Layout Button */}
        <button
          type="button"
          onClick={onToggleEditMode}
          className={`min-h-[44px] min-w-[44px] px-2 py-2 text-xs font-bold transition-transform active:scale-95 flex items-center justify-center border-2 ${
            isEditMode
              ? 'bg-accent text-white border-accent-bright shadow-pixel'
              : 'bg-btn-bg hover:bg-btn-hover text-text border-border'
          }`}
          title="Edit Office Layout"
        >
          <span className="text-sm">🛠️</span>
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={onToggleSettings}
          className={`min-h-[44px] min-w-[44px] px-2 py-2 text-xs font-bold transition-transform active:scale-95 flex items-center justify-center border-2 ${
            isSettingsOpen
              ? 'bg-accent text-white border-accent-bright shadow-pixel'
              : 'bg-btn-bg hover:bg-btn-hover text-text border-border'
          }`}
          title="Office Settings"
        >
          <span className="text-sm">⚙️</span>
        </button>
      </div>
    </nav>
  );
}
