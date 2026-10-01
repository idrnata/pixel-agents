export type AgentTaskStatus =
  | 'queued'
  | 'planning'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'completed'
  | 'failed';

export interface TaskStep {
  name: string;
  description: string;
  status: 'completed' | 'in_progress' | 'failed' | 'pending';
}

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  userId?: string;
  assignedAgentId: string;
  parentTaskId?: string | null;
  status: AgentTaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  currentStep?: string;
  steps?: TaskStep[];
  result?: string;
  summary?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface DelegationItem {
  agentId: 'researcher' | 'analyst';
  title: string;
  instruction: string;
}

export interface ManagerPlanOutput {
  mode: 'direct' | 'delegate';
  reason: string;
  delegations: DelegationItem[];
  summary?: string;
  result?: string;
}

export type AIAgentEvent =
  | {
      type: 'aiAgent.taskCreated';
      taskId: string;
      agentId: string;
      userId?: string;
      parentTaskId?: string | null;
      task?: AgentTask;
    }
  | {
      type: 'aiAgent.planning';
      taskId: string;
      agentId: string;
      userId?: string;
      currentStep?: string;
    }
  | {
      type: 'aiAgent.thinking';
      taskId: string;
      agentId: string;
      userId?: string;
      currentStep?: string;
    }
  | {
      type: 'aiAgent.delegated';
      taskId: string;
      agentId: string;
      userId?: string;
      delegations: DelegationItem[];
      reason: string;
    }
  | {
      type: 'aiAgent.waiting';
      taskId: string;
      agentId: string;
      userId?: string;
      waitingForTaskIds: string[];
      currentStep?: string;
    }
  | {
      type: 'aiAgent.working';
      taskId: string;
      agentId: string;
      userId?: string;
      toolName?: string;
      description?: string;
      currentStep?: string;
    }
  | {
      type: 'aiAgent.completed';
      taskId: string;
      agentId: string;
      userId?: string;
      parentTaskId?: string | null;
      result: string;
      summary?: string;
      steps?: TaskStep[];
    }
  | {
      type: 'aiAgent.failed';
      taskId: string;
      agentId: string;
      userId?: string;
      parentTaskId?: string | null;
      error: string;
    };

export interface CreateTaskRequest {
  agentId: string;
  title: string;
  description: string;
  parentTaskId?: string | null;
}

export interface CreateTaskResponse {
  taskId: string;
  status: 'queued';
}
