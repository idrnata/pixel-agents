import * as crypto from 'crypto';

import { getApplicationAgent } from './agentDefinitions.js';
import type { AIAgentProvider } from './geminiProvider.js';
import { GeminiProvider } from './geminiProvider.js';
import type { AgentTask,AIAgentEvent } from './taskTypes.js';

export type EventBroadcaster = (event: AIAgentEvent) => void;

export class AiAgentRuntime {
  private readonly tasks = new Map<string, AgentTask>();
  private readonly queues = new Map<string, AgentTask[]>();
  private readonly activeTasks = new Map<string, string | null>();
  private broadcaster: EventBroadcaster | null = null;
  private readonly provider: AIAgentProvider;

  constructor(provider?: AIAgentProvider) {
    this.provider = provider ?? new GeminiProvider();
    this.queues.set('manager', []);
    this.queues.set('researcher', []);
    this.queues.set('analyst', []);
    this.activeTasks.set('manager', null);
    this.activeTasks.set('researcher', null);
    this.activeTasks.set('analyst', null);
  }

  setBroadcaster(broadcaster: EventBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  getTasks(): AgentTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  getQueueForAgent(agentId: string): AgentTask[] {
    return [...(this.queues.get(agentId) ?? [])];
  }

  getActiveTaskForAgent(agentId: string): AgentTask | undefined {
    const activeId = this.activeTasks.get(agentId);
    return activeId ? this.tasks.get(activeId) : undefined;
  }

  createTask(agentId: string, title: string, description: string): AgentTask {
    // 1. Validate agentId
    const agent = getApplicationAgent(agentId);
    if (!agent) {
      throw new Error(`Unknown agent ID "${agentId}". Must be one of: manager, researcher, analyst.`);
    }

    // 2. Validate title
    const trimmedTitle = title?.trim();
    if (!trimmedTitle || trimmedTitle.length === 0) {
      throw new Error('Task title is required.');
    }
    if (trimmedTitle.length > 200) {
      throw new Error('Task title exceeds maximum length of 200 characters.');
    }

    // 3. Validate description
    const trimmedDesc = description?.trim();
    if (!trimmedDesc || trimmedDesc.length === 0) {
      throw new Error('Task description is required.');
    }
    if (trimmedDesc.length > 5000) {
      throw new Error('Task description exceeds maximum length of 5000 characters.');
    }

    // 4. Create task with UUID
    const task: AgentTask = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      description: trimmedDesc,
      assignedAgentId: agent.id,
      status: 'queued',
      createdAt: Date.now(),
      currentStep: 'Queued in office pipeline',
    };

    this.tasks.set(task.id, task);

    // 5. Broadcast taskCreated event
    this.broadcast({
      type: 'aiAgent.taskCreated',
      taskId: task.id,
      agentId: agent.id,
      task,
    });

    // 6. Queue and trigger execution
    const agentQueue = this.queues.get(agent.id) ?? [];
    agentQueue.push(task);
    this.queues.set(agent.id, agentQueue);

    // Run execution asynchronously on next tick so task starts in 'queued' state
    setTimeout(() => {
      void this.processQueue(agent.id);
    }, 0);

    return task;
  }

  async chatWithAgent(agentId: string, message: string): Promise<string> {
    const agent = getApplicationAgent(agentId);
    if (!agent) {
      throw new Error(`Unknown agent ID "${agentId}".`);
    }
    if (!message?.trim()) {
      throw new Error('Message cannot be empty.');
    }
    const result = await this.provider.chat({ agent, message: message.trim() });
    return result.reply;
  }

  private async processQueue(agentId: string): Promise<void> {
    // Only one task executes per agent at a time
    if (this.activeTasks.get(agentId)) {
      return;
    }

    const queue = this.queues.get(agentId);
    if (!queue || queue.length === 0) {
      return;
    }

    const task = queue.shift()!;
    this.activeTasks.set(agentId, task.id);

    try {
      await this.runTaskLifecycle(task);
    } finally {
      this.activeTasks.set(agentId, null);
      // Process next queued task if present
      if ((this.queues.get(agentId)?.length ?? 0) > 0) {
        void this.processQueue(agentId);
      }
    }
  }

  private async runTaskLifecycle(task: AgentTask): Promise<void> {
    const agent = getApplicationAgent(task.assignedAgentId);
    if (!agent) {
      task.status = 'failed';
      task.error = `Agent "${task.assignedAgentId}" not found.`;
      task.completedAt = Date.now();
      this.broadcast({
        type: 'aiAgent.failed',
        taskId: task.id,
        agentId: task.assignedAgentId,
        error: task.error,
      });
      return;
    }

    task.startedAt = Date.now();

    // ── Phase 1: Planning ───────────────────────────────────────
    task.status = 'planning';
    task.currentStep = 'Formulating execution strategy & scope';
    this.broadcast({
      type: 'aiAgent.planning',
      taskId: task.id,
      agentId: agent.id,
      currentStep: task.currentStep,
    });
    await new Promise((r) => setTimeout(r, 600));

    // ── Phase 2: Thinking ───────────────────────────────────────
    task.status = 'thinking';
    task.currentStep = 'Reasoning over context & directives';
    this.broadcast({
      type: 'aiAgent.thinking',
      taskId: task.id,
      agentId: agent.id,
      currentStep: task.currentStep,
    });
    await new Promise((r) => setTimeout(r, 600));

    // ── Phase 3: Working & Calling Gemini ───────────────────────
    task.status = 'working';
    task.currentStep = 'Executing AI model analysis';
    this.broadcast({
      type: 'aiAgent.working',
      taskId: task.id,
      agentId: agent.id,
      toolName: 'work',
      description: `Synthesizing ${agent.name} deliverable`,
      currentStep: task.currentStep,
    });

    try {
      const result = await this.provider.executeTask({ agent, task });

      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result.result;
      task.summary = result.summary;
      task.steps = result.steps;
      task.currentStep = 'Completed';

      this.broadcast({
        type: 'aiAgent.completed',
        taskId: task.id,
        agentId: agent.id,
        result: result.result,
        summary: result.summary,
        steps: result.steps,
      });
    } catch (err) {
      task.status = 'failed';
      task.completedAt = Date.now();
      task.error = err instanceof Error ? err.message : String(err);
      task.currentStep = 'Failed';

      this.broadcast({
        type: 'aiAgent.failed',
        taskId: task.id,
        agentId: agent.id,
        error: task.error,
      });
    }
  }

  private broadcast(event: AIAgentEvent): void {
    if (this.broadcaster) {
      try {
        this.broadcaster(event);
      } catch (err) {
        console.error('[AiAgentRuntime] Broadcast error:', err);
      }
    }
  }
}

// Global runtime instance
export const aiAgentRuntime = new AiAgentRuntime();
