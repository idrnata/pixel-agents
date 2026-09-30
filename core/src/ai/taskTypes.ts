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
  assignedAgentId: string;
  status: AgentTaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  currentStep?: string;
  steps?: TaskStep[];
  result?: string;
  summary?: string;
  error?: string;
}

export type AIAgentEvent =
  | {
      type: 'aiAgent.taskCreated';
      taskId: string;
      agentId: string;
      task?: AgentTask;
    }
  | {
      type: 'aiAgent.planning';
      taskId: string;
      agentId: string;
      currentStep?: string;
    }
  | {
      type: 'aiAgent.thinking';
      taskId: string;
      agentId: string;
      currentStep?: string;
    }
  | {
      type: 'aiAgent.working';
      taskId: string;
      agentId: string;
      toolName?: string;
      description?: string;
      currentStep?: string;
    }
  | {
      type: 'aiAgent.completed';
      taskId: string;
      agentId: string;
      result: string;
      summary?: string;
      steps?: TaskStep[];
    }
  | {
      type: 'aiAgent.failed';
      taskId: string;
      agentId: string;
      error: string;
    };

export interface CreateTaskRequest {
  agentId: string;
  title: string;
  description: string;
}

export interface CreateTaskResponse {
  taskId: string;
  status: 'queued';
}
