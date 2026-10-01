import * as crypto from 'crypto';

import { getDefaultTaskRepository, type TaskRepository } from '../firebase/taskRepository.js';
import { getApplicationAgent } from './agentDefinitions.js';
import type { AIAgentProvider, ChildTaskResultPayload } from './geminiProvider.js';
import { GeminiProvider } from './geminiProvider.js';
import type { AgentTask,AIAgentEvent } from './taskTypes.js';

export type EventBroadcaster = (event: AIAgentEvent) => void;

export const MAX_ORCHESTRATION_ROUNDS = 3;

export class AiAgentRuntime {
  private readonly tasks = new Map<string, AgentTask>();
  private readonly queues = new Map<string, AgentTask[]>();
  private readonly activeTasks = new Map<string, string | null>();
  private readonly childCompletionResolvers = new Map<string, () => void>();
  private readonly idempotencyKeys = new Map<string, AgentTask>();
  private broadcaster: EventBroadcaster | null = null;
  private readonly provider: AIAgentProvider;
  private readonly repository: TaskRepository;

  constructor(provider?: AIAgentProvider, repository?: TaskRepository) {
    this.provider = provider ?? new GeminiProvider();
    this.repository = repository ?? getDefaultTaskRepository();
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

  getRepository(): TaskRepository {
    return this.repository;
  }

  getTasks(): AgentTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  getChildTasks(parentTaskId: string): AgentTask[] {
    return Array.from(this.tasks.values())
      .filter((t) => t.parentTaskId === parentTaskId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  getQueueForAgent(agentId: string): AgentTask[] {
    return [...(this.queues.get(agentId) ?? [])];
  }

  getActiveTaskForAgent(agentId: string): AgentTask | undefined {
    const activeId = this.activeTasks.get(agentId);
    return activeId ? this.tasks.get(activeId) : undefined;
  }

  createTask(
    agentId: string,
    title: string,
    description: string,
    options?: {
      userId?: string;
      parentTaskId?: string | null;
      metadata?: Record<string, unknown>;
      idempotencyKey?: string | null;
    },
  ): AgentTask {
    const userId = options?.userId || 'default-user';
    const idempotencyKey = options?.idempotencyKey?.trim();

    if (idempotencyKey) {
      const compositeKey = `${userId}:${idempotencyKey}`;
      const existing = this.idempotencyKeys.get(compositeKey);
      if (existing) {
        return existing;
      }
    }

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

    // 4. Create task object
    const parentTaskId = options?.parentTaskId || null;

    const task: AgentTask = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      description: trimmedDesc,
      userId,
      assignedAgentId: agent.id,
      parentTaskId,
      status: 'queued',
      createdAt: Date.now(),
      currentStep: parentTaskId ? 'Queued delegated child task' : 'Queued in office pipeline',
      metadata: options?.metadata || {},
    };

    this.tasks.set(task.id, task);

    if (idempotencyKey) {
      const compositeKey = `${userId}:${idempotencyKey}`;
      this.idempotencyKeys.set(compositeKey, task);
    }

    // 5. Persist to Firestore / TaskRepository
    void this.repository.createTask(task).catch((err) => {
      console.warn(`[AiAgentRuntime] Failed to persist task ${task.id}:`, err);
    });

    void this.repository
      .appendTaskEvent({
        id: crypto.randomUUID(),
        taskId: task.id,
        userId,
        agentId: agent.id,
        type: 'aiAgent.taskCreated',
        timestamp: Date.now(),
        payload: { title: task.title, parentTaskId },
      })
      .catch(() => {});

    // 6. Broadcast taskCreated event
    this.broadcast({
      type: 'aiAgent.taskCreated',
      taskId: task.id,
      agentId: agent.id,
      userId,
      parentTaskId,
      task,
    });

    // 7. Queue and trigger execution on next tick
    const agentQueue = this.queues.get(agent.id) ?? [];
    agentQueue.push(task);
    this.queues.set(agent.id, agentQueue);

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
      if ((this.queues.get(agentId)?.length ?? 0) > 0) {
        setTimeout(() => void this.processQueue(agentId), 0);
      }
    }
  }

  private async runTaskLifecycle(task: AgentTask): Promise<void> {
    const agent = getApplicationAgent(task.assignedAgentId);
    if (!agent) {
      task.status = 'failed';
      task.error = `Agent "${task.assignedAgentId}" not found.`;
      task.completedAt = Date.now();
      await this.finalizeTask(task, 'failed');
      return;
    }

    task.startedAt = Date.now();

    // ── Phase 1: Planning ───────────────────────────────────────
    task.status = 'planning';
    task.currentStep =
      task.assignedAgentId === 'manager' && !task.parentTaskId
        ? 'Assessing project scope & delegation needs'
        : 'Formulating execution strategy & scope';

    this.broadcast({
      type: 'aiAgent.planning',
      taskId: task.id,
      agentId: agent.id,
      userId: task.userId,
      currentStep: task.currentStep,
    });
    void this.repository.updateTask(task.userId || 'default', task.id, {
      status: task.status,
      currentStep: task.currentStep,
      startedAt: task.startedAt,
    });
    await new Promise((r) => setTimeout(r, 400));

    // ── Phase 2: Thinking ───────────────────────────────────────
    task.status = 'thinking';
    task.currentStep =
      task.assignedAgentId === 'manager' && !task.parentTaskId
        ? 'Evaluating delegation to Researcher and/or Analyst'
        : 'Reasoning over context & directives';

    this.broadcast({
      type: 'aiAgent.thinking',
      taskId: task.id,
      agentId: agent.id,
      userId: task.userId,
      currentStep: task.currentStep,
    });
    void this.repository.updateTask(task.userId || 'default', task.id, {
      status: task.status,
      currentStep: task.currentStep,
    });
    await new Promise((r) => setTimeout(r, 400));

    // ── MANAGER ORCHESTRATION (Root Manager Tasks) ──────────────
    if (task.assignedAgentId === 'manager' && !task.parentTaskId) {
      await this.runManagerOrchestration(agent, task);
      return;
    }

    // ── STANDARD EXECUTION (Researcher, Analyst, Direct Child) ──
    task.status = 'working';
    task.currentStep = 'Executing AI model analysis';
    this.broadcast({
      type: 'aiAgent.working',
      taskId: task.id,
      agentId: agent.id,
      userId: task.userId,
      toolName: 'work',
      description: `Synthesizing ${agent.name} deliverable`,
      currentStep: task.currentStep,
    });
    void this.repository.updateTask(task.userId || 'default', task.id, {
      status: task.status,
      currentStep: task.currentStep,
    });

    try {
      const result = await this.provider.executeTask({ agent, task });
      task.result = result.result;
      task.summary = result.summary;
      task.steps = result.steps;
      await this.finalizeTask(task, 'completed');
    } catch (err) {
      task.error = err instanceof Error ? err.message : String(err);
      await this.finalizeTask(task, 'failed');
    }
  }

  private async runManagerOrchestration(
    managerAgent: ReturnType<typeof getApplicationAgent> & object,
    task: AgentTask,
  ): Promise<void> {
    try {
      // 1. Plan delegation with Gemini
      const plan = await this.provider.planManagerDelegation({
        agent: managerAgent,
        task,
      });

      // Filter delegations: ONLY researcher or analyst, never manager
      const validDelegations = (plan.delegations || []).filter(
        (d) => d.agentId === 'researcher' || d.agentId === 'analyst',
      );

      // Check if delegation requested
      if (plan.mode === 'delegate' && validDelegations.length > 0) {
        this.broadcast({
          type: 'aiAgent.delegated',
          taskId: task.id,
          agentId: managerAgent.id,
          userId: task.userId,
          delegations: validDelegations,
          reason: plan.reason,
        });

        // Register listener BEFORE child tasks are created to prevent race condition
        const childTaskIds: string[] = [];
        const waitPromise = this.prepareAndWaitForChildren(task.id, () => childTaskIds);

        // Create child tasks in runtime and repository
        for (const item of validDelegations) {
          const child = this.createTask(item.agentId, item.title, item.instruction, {
            userId: task.userId,
            parentTaskId: task.id,
            metadata: { delegatedBy: 'manager', reason: plan.reason },
          });
          childTaskIds.push(child.id);
        }

        // Manager enters WAITING state
        task.status = 'waiting';
        task.currentStep = `Waiting for ${validDelegations.map((d) => d.agentId).join(' & ')} deliverables`;
        this.broadcast({
          type: 'aiAgent.waiting',
          taskId: task.id,
          agentId: managerAgent.id,
          userId: task.userId,
          waitingForTaskIds: childTaskIds,
          currentStep: task.currentStep,
        });
        void this.repository.updateTask(task.userId || 'default', task.id, {
          status: 'waiting',
          currentStep: task.currentStep,
        });

        // Wait for all child tasks to reach terminal state
        await waitPromise;

        // Children complete -> Manager returns to THINKING then WORKING
        task.status = 'thinking';
        task.currentStep = 'Reviewing team deliverables';
        this.broadcast({
          type: 'aiAgent.thinking',
          taskId: task.id,
          agentId: managerAgent.id,
          userId: task.userId,
          currentStep: task.currentStep,
        });
        await new Promise((r) => setTimeout(r, 400));

        task.status = 'working';
        task.currentStep = 'Synthesizing Executive Master Report';
        this.broadcast({
          type: 'aiAgent.working',
          taskId: task.id,
          agentId: managerAgent.id,
          userId: task.userId,
          toolName: 'synthesis',
          description: 'Synthesizing verified child deliverables',
          currentStep: task.currentStep,
        });

        // Fetch actual child deliverables
        const childTasks = this.getChildTasks(task.id);
        const childResults: ChildTaskResultPayload[] = childTasks.map((ct) => ({
          agentId: ct.assignedAgentId,
          title: ct.title,
          status: ct.status,
          result: ct.result || '',
          error: ct.error,
        }));

        // Synthesize master deliverable
        const synth = await this.provider.synthesizeManagerResults({
          agent: managerAgent,
          task,
          childResults,
        });

        task.result = synth.result;
        task.summary = synth.summary;
        task.steps = synth.steps;
        await this.finalizeTask(task, 'completed');
      } else {
        // Direct execution by Manager
        task.status = 'working';
        task.currentStep = 'Executing direct master analysis';
        this.broadcast({
          type: 'aiAgent.working',
          taskId: task.id,
          agentId: managerAgent.id,
          userId: task.userId,
          toolName: 'work',
          description: 'Executing direct analysis',
          currentStep: task.currentStep,
        });

        const direct = await this.provider.executeTask({ agent: managerAgent, task });
        task.result = direct.result;
        task.summary = direct.summary;
        task.steps = direct.steps;
        await this.finalizeTask(task, 'completed');
      }
    } catch (err) {
      task.error = err instanceof Error ? err.message : String(err);
      await this.finalizeTask(task, 'failed');
    }
  }

  private prepareAndWaitForChildren(
    parentTaskId: string,
    getChildIds: () => string[],
  ): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false;

      const checkDone = () => {
        if (resolved) return;
        const childTaskIds = getChildIds();
        if (childTaskIds.length === 0) return;

        const allDone = childTaskIds.every((id) => {
          const t = this.tasks.get(id);
          return t && (t.status === 'completed' || t.status === 'failed');
        });

        if (allDone) {
          resolved = true;
          this.childCompletionResolvers.delete(parentTaskId);
          if (timeoutId) clearTimeout(timeoutId);
          resolve();
        }
      };

      // Register listener BEFORE child completion can occur
      this.childCompletionResolvers.set(parentTaskId, checkDone);

      // Safety net: 2 minute max wait to prevent permanent hanging
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.childCompletionResolvers.delete(parentTaskId);
          console.warn(`[AiAgentRuntime] Timeout waiting for child tasks of parent "${parentTaskId}"`);
          resolve();
        }
      }, 120_000);

      // Initial check in case all children are already done
      checkDone();
    });
  }

  waitForChildrenCompletion(parentTaskId: string, childTaskIds: string[]): Promise<void> {
    return this.prepareAndWaitForChildren(parentTaskId, () => childTaskIds);
  }

  async recoverOrphanedTasks(userId = 'default-user'): Promise<void> {
    try {
      const persistedTasks = await this.repository.listTasks(userId);
      for (const t of persistedTasks) {
        if (
          t.status === 'queued' ||
          t.status === 'planning' ||
          t.status === 'thinking' ||
          t.status === 'working' ||
          t.status === 'waiting'
        ) {
          t.status = 'failed';
          t.error = 'Task execution interrupted by server restart.';
          t.completedAt = Date.now();
          t.currentStep = 'Failed (Server Restart)';
          this.tasks.set(t.id, t);
          await this.repository.updateTask(userId, t.id, {
            status: 'failed',
            error: t.error,
            completedAt: t.completedAt,
            currentStep: t.currentStep,
          });
        }
      }
    } catch (err) {
      console.warn('[AiAgentRuntime] Error recovering orphaned tasks:', err);
    }
  }

  private async finalizeTask(task: AgentTask, finalStatus: 'completed' | 'failed'): Promise<void> {
    task.status = finalStatus;
    task.completedAt = Date.now();
    task.currentStep = finalStatus === 'completed' ? 'Completed' : 'Failed';

    // Broadcast completion or failure
    if (finalStatus === 'completed') {
      this.broadcast({
        type: 'aiAgent.completed',
        taskId: task.id,
        agentId: task.assignedAgentId,
        userId: task.userId,
        parentTaskId: task.parentTaskId,
        result: task.result || '',
        summary: task.summary,
        steps: task.steps,
      });
    } else {
      this.broadcast({
        type: 'aiAgent.failed',
        taskId: task.id,
        agentId: task.assignedAgentId,
        userId: task.userId,
        parentTaskId: task.parentTaskId,
        error: task.error || 'Execution failed',
      });
    }

    // Persist to repository
    void this.repository.updateTask(task.userId || 'default', task.id, {
      status: task.status,
      completedAt: task.completedAt,
      currentStep: task.currentStep,
      result: task.result,
      summary: task.summary,
      steps: task.steps,
      error: task.error,
    });

    void this.repository.appendTaskEvent({
      id: crypto.randomUUID(),
      taskId: task.id,
      userId: task.userId || 'default',
      agentId: task.assignedAgentId,
      type: finalStatus === 'completed' ? 'aiAgent.completed' : 'aiAgent.failed',
      timestamp: Date.now(),
      payload: {
        status: finalStatus,
        result: task.result,
        error: task.error,
      },
    });

    // Notify any parent task waiting for this child
    if (task.parentTaskId) {
      const resolver = this.childCompletionResolvers.get(task.parentTaskId);
      if (resolver) resolver();
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
