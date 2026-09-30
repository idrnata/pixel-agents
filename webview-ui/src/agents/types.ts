export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'reading'
  | 'writing'
  | 'waiting'
  | 'completed'
  | 'error';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface AgentConfig {
  id: string;
  characterId: number; // Numeric ID mapped to canvas character (1=Manager, 2=Researcher, 3=Analyst)
  name: string;
  role: string;
  avatar: string;
  palette: number;
  hueShift?: number;
  personality: string;
  systemPrompt: string;
  capabilities: string[];
  assignedSeatId?: string;
}

export interface AgentStructuredOutput {
  agentId: string;
  taskId: string;
  status: 'completed' | 'in_progress' | 'error';
  summary: string;
  findings: string[];
  risks: string[];
  nextAction: string;
}

export interface AgentMessage {
  id: string;
  taskId?: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId?: string;
  content: string;
  type: 'thought' | 'speech' | 'report' | 'system';
  timestamp: number;
}

export interface AgentState {
  id: string;
  characterId: number;
  name: string;
  role: string;
  avatar: string;
  status: AgentStatus;
  currentTask: string | null;
  currentTaskTitle?: string | null;
  currentStepDescription: string | null;
  position: { x: number; y: number; col?: number; row?: number };
  personality: string;
  systemPrompt: string;
  capabilities: string[];
  assignedSeatId?: string;
  lastActive: number;
  latestOutput?: AgentStructuredOutput;
}

export interface TimelineStep {
  id: string;
  timestamp: number;
  phase: 'manager_planning' | 'researcher_executing' | 'analyst_evaluating' | 'manager_synthesizing';
  agentId: string;
  agentName: string;
  agentRole: string;
  agentAvatar: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  output?: AgentStructuredOutput;
}

export interface TaskSubtask {
  id: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  title: string;
  instruction: string;
  status: TaskStatus;
  result?: string;
  structuredOutput?: AgentStructuredOutput;
  toolUsed?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
  managerId: string;
  subtasks: TaskSubtask[];
  timeline: TimelineStep[];
  managerPlan?: AgentStructuredOutput;
  researcherOutput?: AgentStructuredOutput;
  analystOutput?: AgentStructuredOutput;
  finalSynthesisOutput?: AgentStructuredOutput;
  finalReport?: string;
  summary?: string;
}

export type AgentEventType =
  | 'agent.created'
  | 'agent.started'
  | 'agent.thinking'
  | 'agent.working'
  | 'agent.reading'
  | 'agent.writing'
  | 'agent.waiting'
  | 'agent.completed'
  | 'agent.error'
  | 'agent.moved'
  | 'task.created'
  | 'task.started'
  | 'task.updated'
  | 'task.completed'
  | 'message.created';

export interface AgentEvent {
  type: AgentEventType;
  agentId?: string;
  characterId?: number;
  taskId?: string;
  status?: AgentStatus;
  toolName?: string;
  description?: string;
  targetLocation?: 'desk' | 'meeting' | 'office';
  message?: AgentMessage;
  task?: AgentTask;
  timestamp: number;
}

export type AgentEventListener = (event: AgentEvent) => void;
