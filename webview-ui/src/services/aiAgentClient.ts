import {
  type AgentTask,
  type AIAgentEvent,
  APPLICATION_AGENTS,
  type ApplicationAgent,
} from '../../../core/src/index.js';
import { transport } from '../transport/index.js';
import {
  ensureAnonymousAuth,
  fetchTasksFromFirestore,
  subscribeTasksFromFirestore,
} from './firebase.js';

export type AIEventListener = (event: AIAgentEvent) => void;

class AIAgentClient {
  private tasks = new Map<string, AgentTask>();
  private listeners = new Set<AIEventListener>();
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined' || this.isInitialized) return;
    this.isInitialized = true;

    // 1. Primary realtime channel: WebSocket transport
    transport.onMessage((msg) => {
      const raw = msg as unknown as Record<string, unknown>;
      if (raw && typeof raw.type === 'string' && raw.type.startsWith('aiAgent.')) {
        this.handleEvent(raw as unknown as AIAgentEvent);
      }
    });

    // 2. Cross-session persistence subscription via Firestore
    try {
      subscribeTasksFromFirestore((firestoreTasks) => {
        for (const t of firestoreTasks) {
          this.tasks.set(t.id, t);
        }
      });
    } catch (err) {
      console.warn('[AIAgentClient] Firestore subscription error:', err);
    }

    // 3. Initial hydration of tasks from server
    void this.fetchTasks();
  }

  on(listener: AIEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getAgents(): ApplicationAgent[] {
    return Object.values(APPLICATION_AGENTS);
  }

  getAgent(id: string): ApplicationAgent | undefined {
    return APPLICATION_AGENTS[id as keyof typeof APPLICATION_AGENTS];
  }

  getAgentByCharacterId(charId: number): ApplicationAgent | undefined {
    return Object.values(APPLICATION_AGENTS).find((a) => a.characterId === charId);
  }

  getTasks(): AgentTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  getActiveTaskForAgent(agentId: string): AgentTask | undefined {
    return this.getTasks().find(
      (t) =>
        t.assignedAgentId === agentId &&
        (t.status === 'planning' ||
          t.status === 'thinking' ||
          t.status === 'working' ||
          t.status === 'waiting' ||
          t.status === 'queued'),
    );
  }

  async fetchTasks(): Promise<AgentTask[]> {
    // 1. Fetch user tasks from Firestore for user-isolated persistence
    try {
      const firestoreTasks = await fetchTasksFromFirestore();
      for (const t of firestoreTasks) {
        this.tasks.set(t.id, t);
      }
    } catch {
      // offline or unauthenticated fallback
    }

    // 2. Hydrate from server API endpoint
    try {
      const token = await ensureAnonymousAuth();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai/tasks', { headers });
      if (res.ok) {
        const data = (await res.json()) as { tasks: AgentTask[] };
        if (Array.isArray(data.tasks)) {
          for (const t of data.tasks) {
            this.tasks.set(t.id, t);
          }
          return this.getTasks();
        }
      }
    } catch (err) {
      console.warn('[AIAgentClient] Failed to fetch tasks from server:', err);
    }
    return this.getTasks();
  }

  async createTask(agentId: string, title: string, description: string): Promise<{ taskId: string; status: string }> {
    const token = await ensureAnonymousAuth();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/ai/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId, title, description }),
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || `Task creation failed with status ${res.status}`);
    }

    const data = (await res.json()) as { taskId: string; status: string };

    // Hydrate task state via server response / WebSocket broadcast
    return data;
  }

  async chat(agentId: string, message: string): Promise<string> {
    const token = await ensureAnonymousAuth();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId, message }),
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || `Chat request failed: ${res.status}`);
    }

    const data = (await res.json()) as { text?: string };
    return data.text || 'Standing by for objectives.';
  }

  private handleEvent(event: AIAgentEvent): void {
    const { taskId } = event;

    if (event.type === 'aiAgent.taskCreated') {
      if (event.task) {
        this.tasks.set(taskId, event.task);
      } else if (!this.tasks.has(taskId)) {
        this.tasks.set(taskId, {
          id: taskId,
          title: 'AI Task',
          description: '',
          userId: event.userId || '',
          assignedAgentId: event.agentId,
          status: 'queued',
          createdAt: Date.now(),
        });
      }
    } else {
      const task = this.tasks.get(taskId);
      if (task) {
        switch (event.type) {
          case 'aiAgent.planning':
            task.status = 'planning';
            task.currentStep = event.currentStep || 'Formulating plan';
            break;
          case 'aiAgent.thinking':
            task.status = 'thinking';
            task.currentStep = event.currentStep || 'Reasoning over directives';
            break;
          case 'aiAgent.waiting':
            task.status = 'waiting';
            task.currentStep = event.currentStep || 'Waiting for team deliverables';
            break;
          case 'aiAgent.working':
            task.status = 'working';
            task.currentStep = event.currentStep || 'Executing task with Gemini';
            break;
          case 'aiAgent.completed':
            task.status = 'completed';
            task.completedAt = Date.now();
            task.result = event.result;
            task.summary = event.summary;
            task.steps = event.steps;
            task.currentStep = 'Completed';
            break;
          case 'aiAgent.failed':
            task.status = 'failed';
            task.completedAt = Date.now();
            task.error = event.error;
            task.currentStep = 'Failed';
            break;
        }
      }
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[AIAgentClient] Listener error:', err);
      }
    }
  }
}

export const aiAgentClient = new AIAgentClient();
