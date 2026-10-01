import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';

import {
  APPLICATION_AGENTS,
  getAllApplicationAgents,
} from '../src/ai/agentDefinitions.js';
import { AiAgentRuntime } from '../src/ai/aiAgentRuntime.js';
import type { AIAgentProvider } from '../src/ai/geminiProvider.js';
import { GeminiProvider } from '../src/ai/geminiProvider.js';
import type { AgentTask, AIAgentEvent } from '../src/ai/taskTypes.js';
import { verifyFirebaseIdToken } from '../src/firebase/firebaseAdmin.js';
import { InMemoryTaskRepository } from '../src/firebase/taskRepository.js';

describe('AI Agent Runtime & Provider Tests', () => {
  // Mock Provider for deterministic tests
  const createMockProvider = (options: {
    succeed?: boolean;
    result?: string;
    summary?: string;
    shouldThrow?: boolean;
    throwMessage?: string;
    delayMs?: number;
    planMode?: 'direct' | 'delegate';
    planDelegations?: Array<{ agentId: 'researcher' | 'analyst'; title: string; instruction: string }>;
  }): AIAgentProvider => ({
    id: 'mock-gemini',
    displayName: 'Mock Gemini',
    async executeTask(req) {
      if (options.delayMs) {
        await new Promise((r) => setTimeout(r, options.delayMs));
      }
      if (options.shouldThrow) {
        throw new Error(options.throwMessage || 'API quota exceeded');
      }
      return {
        summary: options.summary || `Summary for ${req.task.title}`,
        steps: [
          { name: 'Analysis', description: 'Evaluated prompt', status: 'completed' },
          { name: 'Deliverable', description: 'Formulated result', status: 'completed' },
        ],
        result: options.result || `Result deliverable for ${req.task.title}`,
      };
    },
    async planManagerDelegation(req) {
      if (options.delayMs) {
        await new Promise((r) => setTimeout(r, options.delayMs));
      }
      return {
        mode: options.planMode || 'direct',
        reason: options.planMode === 'delegate' ? 'Delegating subtasks' : 'Direct execution',
        delegations: options.planDelegations || [],
      };
    },
    async synthesizeManagerResults(req) {
      if (options.delayMs) {
        await new Promise((r) => setTimeout(r, options.delayMs));
      }
      const childSummaries = req.childResults
        .map((c) => `${c.agentId}: ${c.result || c.error || 'done'}`)
        .join('; ');
      return {
        summary: `Executive Master Report for ${req.task.title}`,
        steps: [
          { name: 'Team Coordination', description: 'Aggregated findings', status: 'completed' },
          { name: 'Synthesis', description: 'Formulated executive conclusion', status: 'completed' },
        ],
        result: `Master report based on verified inputs: [${childSummaries}]`,
      };
    },
    async chat() {
      return { reply: 'Mock reply' };
    },
  });

  const createTestRuntime = (options: Parameters<typeof createMockProvider>[0] = {}) =>
    new AiAgentRuntime(createMockProvider(options), new InMemoryTaskRepository());

  // 1. Unknown agent ID rejected
  it('1. rejects unknown agent ID', () => {
    const runtime = createTestRuntime({});
    expect(() => {
      runtime.createTask('unknown_bot', 'Valid title', 'Valid description');
    }).toThrow(/Unknown agent ID "unknown_bot"/);
  });

  // 2. Missing title rejected
  it('2. rejects missing or empty title', () => {
    const runtime = createTestRuntime({});
    expect(() => {
      runtime.createTask('researcher', '   ', 'Valid description');
    }).toThrow(/Task title is required/);
  });

  // 3. Missing description rejected
  it('3. rejects missing or empty description', () => {
    const runtime = createTestRuntime({});
    expect(() => {
      runtime.createTask('researcher', 'Valid title', '');
    }).toThrow(/Task description is required/);
  });

  // 4. Task creation
  it('4. creates task in queued state with correct properties', () => {
    const runtime = createTestRuntime({});
    const task = runtime.createTask('researcher', 'Research Task', 'Detailed description');

    expect(task.title).toBe('Research Task');
    expect(task.description).toBe('Detailed description');
    expect(task.assignedAgentId).toBe('researcher');
    expect(task.status).toBe('queued');
    expect(task.createdAt).toBeGreaterThan(0);
    expect(runtime.getTask(task.id)).toBeDefined();
  });

  // 5. Task ID generation
  it('5. generates unique UUID task IDs', () => {
    const runtime = createTestRuntime({});
    const task1 = runtime.createTask('manager', 'Task 1', 'Desc 1');
    const task2 = runtime.createTask('manager', 'Task 2', 'Desc 2');

    expect(task1.id).not.toBe(task2.id);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(task1.id).toMatch(uuidRegex);
    expect(task2.id).toMatch(uuidRegex);
  });

  // 6. Task lifecycle (queued -> planning -> thinking -> working -> completed)
  it('6. executes full task lifecycle through state transitions', async () => {
    const runtime = createTestRuntime({ delayMs: 10 });
    const events: AIAgentEvent[] = [];
    runtime.setBroadcaster((evt) => events.push(evt));

    const task = runtime.createTask('analyst', 'Analyze market', 'Market info');
    expect(task.status).toBe('queued');

    await vi.waitFor(
      () => {
        expect(task.status).toBe('completed');
      },
      { timeout: 3000, interval: 50 },
    );

    expect(task.result).toContain('Result deliverable for Analyze market');
    expect(task.completedAt).toBeGreaterThan(0);

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('aiAgent.taskCreated');
    expect(eventTypes).toContain('aiAgent.planning');
    expect(eventTypes).toContain('aiAgent.thinking');
    expect(eventTypes).toContain('aiAgent.working');
    expect(eventTypes).toContain('aiAgent.completed');
  });

  // 7. Agent queue behavior
  it('7. queues sequential tasks for same agent and runs tasks concurrently for different agents', async () => {
    const runtime = createTestRuntime({ delayMs: 150 });

    const taskM1 = runtime.createTask('manager', 'M1', 'Desc');
    const taskM2 = runtime.createTask('manager', 'M2', 'Desc');
    const taskR1 = runtime.createTask('researcher', 'R1', 'Desc');

    expect(taskM1.status).toBe('queued');
    expect(taskM2.status).toBe('queued');
    expect(taskR1.status).toBe('queued');

    await vi.waitFor(
      () => {
        expect(runtime.getActiveTaskForAgent('manager')?.id).toBe(taskM1.id);
        expect(runtime.getActiveTaskForAgent('researcher')?.id).toBe(taskR1.id);
      },
      { timeout: 3000, interval: 50 },
    );
  });

  // 8. Gemini response parsing
  it('8. GeminiProvider successfully parses valid structured JSON responses', async () => {
    const provider = new GeminiProvider('mock-api-key');
    const fakeClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            summary: 'Executive brief',
            steps: [{ name: 'Phase 1', description: 'Completed discovery', status: 'completed' }],
            result: 'Full strategic analysis report',
          }),
        }),
      },
    };
    // @ts-expect-error - inject mocked private client
    provider.client = fakeClient;

    const agent = APPLICATION_AGENTS.manager;
    const task: AgentTask = {
      id: 'test-uuid-1',
      title: 'Analyze Strategy',
      description: 'Review portfolio',
      assignedAgentId: 'manager',
      status: 'working',
      createdAt: Date.now(),
    };

    const result = await provider.executeTask({ agent, task });
    expect(result.summary).toBe('Executive brief');
    expect(result.result).toBe('Full strategic analysis report');
    expect(result.steps).toHaveLength(1);
  });

  // 9. Gemini failures handle error state
  it('9. GeminiProvider failures mark tasks as failed with clean error', async () => {
    const runtime = createTestRuntime({
      shouldThrow: true,
      throwMessage: 'Gemini rate limit exceeded',
      delayMs: 10,
    });

    const task = runtime.createTask('researcher', 'Fail Task', 'Directives');

    await vi.waitFor(
      () => {
        expect(task.status).toBe('failed');
      },
      { timeout: 3000 },
    );

    expect(task.error).toContain('Gemini rate limit exceeded');
    expect(task.completedAt).toBeGreaterThan(0);
  });

  // 10. Manager Orchestration: Direct mode
  it('10. Manager executes directly when planMode is direct', async () => {
    const runtime = createTestRuntime({
      planMode: 'direct',
      summary: 'Direct manager result',
      result: 'Comprehensive direct report',
      delayMs: 10,
    });

    const task = runtime.createTask('manager', 'Simple Objective', 'Direct summary request');

    await vi.waitFor(
      () => {
        expect(task.status).toBe('completed');
      },
      { timeout: 3000 },
    );

    expect(task.result).toBe('Comprehensive direct report');
    expect(runtime.getChildTasks(task.id)).toHaveLength(0);
  });

  // 11. Manager Orchestration: Delegation to Researcher and Analyst
  it('11. Manager delegates to Researcher and Analyst, enters waiting, and synthesizes master report', async () => {
    const events: AIAgentEvent[] = [];
    const runtime = createTestRuntime({
      planMode: 'delegate',
      planDelegations: [
        { agentId: 'researcher', title: 'Fact Gathering', instruction: 'Gather facts' },
        { agentId: 'analyst', title: 'Quantitative Modeling', instruction: 'Model risks' },
      ],
      delayMs: 20,
    });

    runtime.setBroadcaster((evt) => events.push(evt));

    const managerTask = runtime.createTask(
      'manager',
      'Evaluate Bitcoin Long Term',
      'Comprehensive crypto evaluation',
    );

    // Wait for children to be spawned
    await vi.waitFor(
      () => {
        const children = runtime.getChildTasks(managerTask.id);
        expect(children).toHaveLength(2);
      },
      { timeout: 3000 },
    );

    const children = runtime.getChildTasks(managerTask.id);
    expect(children[0].assignedAgentId).toBe('researcher');
    expect(children[0].parentTaskId).toBe(managerTask.id);
    expect(children[1].assignedAgentId).toBe('analyst');
    expect(children[1].parentTaskId).toBe(managerTask.id);

    // Wait for manager to finish synthesis and complete
    await vi.waitFor(
      () => {
        expect(managerTask.status).toBe('completed');
      },
      { timeout: 4000 },
    );

    expect(managerTask.result).toContain('Master report based on verified inputs');
    expect(managerTask.result).toContain('researcher: Result deliverable for Fact Gathering');
    expect(managerTask.result).toContain('analyst: Result deliverable for Quantitative Modeling');

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('aiAgent.delegated');
    expect(eventTypes).toContain('aiAgent.waiting');
    expect(eventTypes).toContain('aiAgent.completed');
  });

  // 12. TaskRepository operations & User Isolation
  it('12. InMemoryTaskRepository isolates tasks per userId', async () => {
    const repo = new InMemoryTaskRepository();
    const taskUserA: AgentTask = {
      id: 'task-user-a-1',
      title: 'User A Secret Task',
      description: 'Private directives A',
      userId: 'user-A',
      assignedAgentId: 'manager',
      status: 'queued',
      createdAt: Date.now(),
    };

    const taskUserB: AgentTask = {
      id: 'task-user-b-1',
      title: 'User B Secret Task',
      description: 'Private directives B',
      userId: 'user-B',
      assignedAgentId: 'researcher',
      status: 'queued',
      createdAt: Date.now(),
    };

    await repo.createTask(taskUserA);
    await repo.createTask(taskUserB);

    const userATasks = await repo.listTasks('user-A');
    expect(userATasks).toHaveLength(1);
    expect(userATasks[0].id).toBe('task-user-a-1');

    const userBTasks = await repo.listTasks('user-B');
    expect(userBTasks).toHaveLength(1);
    expect(userBTasks[0].id).toBe('task-user-b-1');

    // Cross-user read returns undefined
    const crossRead = await repo.getTask('user-B', 'task-user-a-1');
    expect(crossRead).toBeUndefined();
  });

  // 13. Firebase ID token verification
  it('13. verifyFirebaseIdToken verifies test tokens in test mode and rejects empty tokens', async () => {
    await expect(verifyFirebaseIdToken('')).rejects.toThrow(/UNAUTHORIZED/);
    const mockVerified = await verifyFirebaseIdToken('mock-token-user-abc');
    expect(mockVerified.uid).toBe('user-abc');

    const devVerified = await verifyFirebaseIdToken('dev-token-test-123');
    expect(devVerified.uid).toBe('test-123');
  });

  // 14. Security: No secrets in client webview bundle
  it('14. verifies client webview does not import firebase-admin or leak server secrets', () => {
    const webviewSrcDir = path.resolve(__dirname, '../../webview-ui/src');
    const clientFiles = fs.readdirSync(webviewSrcDir, { recursive: true }) as string[];

    for (const relPath of clientFiles) {
      if (
        typeof relPath === 'string' &&
        (relPath.endsWith('.ts') || relPath.endsWith('.tsx') || relPath.endsWith('.js'))
      ) {
        const fullPath = path.join(webviewSrcDir, relPath);
        if (fullPath.includes('/server/')) continue;

        const content = fs.readFileSync(fullPath, 'utf8');
        expect(content).not.toContain('firebase-admin');
        expect(content).not.toContain('FIREBASE_PRIVATE_KEY');
        expect(content).not.toContain('process.env.GEMINI_API_KEY');
      }
    }
  });

  // 15. Single Source of Truth: No direct browser task writes
  it('15. verifies browser code does not perform setDoc on tasks collection', () => {
    const firebaseClientFile = path.resolve(__dirname, '../../webview-ui/src/services/firebase.ts');
    const content = fs.readFileSync(firebaseClientFile, 'utf8');
    expect(content).not.toContain("setDoc(doc(db, TASKS_PATH");
    expect(content).not.toContain("updateDoc(");
  });

  // Registry validation
  it('verifies all 3 application agents exist with unique character IDs and palettes', () => {
    const agents = getAllApplicationAgents();
    expect(agents).toHaveLength(3);

    const ids = agents.map((a) => a.id);
    expect(ids).toEqual(['manager', 'researcher', 'analyst']);

    const charIds = agents.map((a) => a.characterId);
    expect(charIds).toEqual([1, 2, 3]);

    const palettes = agents.map((a) => a.palette);
    expect(palettes).toEqual([0, 1, 2]);

    for (const agent of agents) {
      expect(agent.systemInstruction).toBeTruthy();
      expect(agent.defaultWorkLocation).toBeTruthy();
      expect(agent.capabilities.length).toBeGreaterThan(0);
    }
  });

  // 16. Race Condition Regression: Immediate child completion must not hang Manager in waiting
  it('16. resolves Manager waiting state cleanly even if child tasks complete immediately', async () => {
    const runtime = createTestRuntime({
      planMode: 'delegate',
      planDelegations: [
        { agentId: 'researcher', title: 'Fast Research', instruction: 'Instant fact check' },
        { agentId: 'analyst', title: 'Fast Quant', instruction: 'Instant quant check' },
      ],
      delayMs: 0, // Children complete immediately with 0 delay
    });

    const managerTask = runtime.createTask('manager', 'Fast Objective', 'Directives for immediate children');

    await vi.waitFor(
      () => {
        expect(managerTask.status).toBe('completed');
      },
      { timeout: 3000 },
    );

    expect(managerTask.result).toBeTruthy();
    expect(managerTask.status).toBe('completed');
  });

  // 17. Child Failure Handling: Child failure passes actual failure status & error to Manager without fake success
  it('17. Manager receives actual child failure status and incorporates error without pretending success', async () => {
    let callCount = 0;
    const customProvider: AIAgentProvider = {
      id: 'mock-failing-provider',
      displayName: 'Mock Failing Provider',
      async executeTask(req) {
        callCount++;
        if (req.agent.id === 'analyst') {
          throw new Error('Analyst model computation error');
        }
        return {
          summary: 'Researcher report',
          steps: [{ name: 'Research', description: 'Gathered data', status: 'completed' }],
          result: 'Researcher findings on crypto facts',
        };
      },
      async planManagerDelegation() {
        return {
          mode: 'delegate',
          reason: 'Delegating to team',
          delegations: [
            { agentId: 'researcher', title: 'Fact Gathering', instruction: 'Gather facts' },
            { agentId: 'analyst', title: 'Risk Modeling', instruction: 'Calculate risks' },
          ],
        };
      },
      async synthesizeManagerResults(req) {
        const analystResult = req.childResults.find((c) => c.agentId === 'analyst');
        expect(analystResult?.status).toBe('failed');
        expect(analystResult?.error).toContain('Analyst model computation error');
        return {
          summary: 'Executive report noting team failure',
          steps: [{ name: 'Review', description: 'Evaluated team results', status: 'completed' }],
          result: `Executive Synthesis: Researcher succeeded, Analyst failed with error (${analystResult?.error})`,
        };
      },
      async chat() {
        return { reply: 'ok' };
      },
    };

    const runtime = new AiAgentRuntime(customProvider, new InMemoryTaskRepository());
    const managerTask = runtime.createTask('manager', 'Objective with Failing Child', 'Directives');

    await vi.waitFor(
      () => {
        expect(managerTask.status).toBe('completed');
      },
      { timeout: 3000 },
    );

    expect(managerTask.result).toContain('Analyst failed with error');
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  // 18. API Idempotency: Duplicate submissions with same idempotencyKey return existing task
  it('18. returns existing task when duplicate submission uses same idempotencyKey', () => {
    const runtime = createTestRuntime({});
    const options = { userId: 'user-123', idempotencyKey: 'idempotent-key-999' };

    const task1 = runtime.createTask('manager', 'Unique Title', 'Unique Description', options);
    const task2 = runtime.createTask('manager', 'Unique Title', 'Unique Description', options);

    expect(task1.id).toBe(task2.id);
    expect(runtime.getTasks()).toHaveLength(1);
  });

  // 19. Server Restart Recovery: Orphaned non-terminal tasks marked as failed with server restart error
  it('19. recoverOrphanedTasks marks non-terminal persisted tasks as failed', async () => {
    const repo = new InMemoryTaskRepository();
    const activeTask: AgentTask = {
      id: 'interrupted-task-1',
      title: 'Interrupted Task',
      description: 'Running before crash',
      userId: 'user-777',
      assignedAgentId: 'researcher',
      status: 'working',
      createdAt: Date.now() - 5000,
      startedAt: Date.now() - 4000,
    };
    await repo.createTask(activeTask);

    const runtime = new AiAgentRuntime(createMockProvider({}), repo);
    await runtime.recoverOrphanedTasks('user-777');

    const recovered = await repo.getTask('user-777', 'interrupted-task-1');
    expect(recovered?.status).toBe('failed');
    expect(recovered?.error).toContain('Task execution interrupted by server restart');
  });

  // 20. End-to-End Acceptance Test: Bitcoin long-term portfolio analysis
  it('20. End-to-End Acceptance Test: Manager receives Bitcoin objective, delegates, waits, and synthesizes final report', async () => {
    const events: AIAgentEvent[] = [];
    const runtime = createTestRuntime({
      planMode: 'delegate',
      planDelegations: [
        { agentId: 'researcher', title: 'Bitcoin Fundamental Research', instruction: 'Identify facts and assumptions' },
        { agentId: 'analyst', title: 'Bitcoin Risk & Volatility Analysis', instruction: 'Evaluate retail investor risks' },
      ],
      result: 'Verified deliverable output',
      delayMs: 15,
    });

    runtime.setBroadcaster((evt) => events.push(evt));

    const task = runtime.createTask(
      'manager',
      'Analyze Bitcoin as a long-term portfolio asset',
      'Analyze Bitcoin as a long-term portfolio asset. Separate factual information from assumptions and identify important risks and considerations for a retail investor.',
      { userId: 'test-e2e-user' },
    );

    expect(task.status).toBe('queued');
    expect(task.userId).toBe('test-e2e-user');

    await vi.waitFor(
      () => {
        expect(task.status).toBe('completed');
      },
      { timeout: 4000 },
    );

    expect(task.result).toContain('Master report based on verified inputs');
    expect(task.result).toContain('researcher: Verified deliverable output');
    expect(task.result).toContain('analyst: Verified deliverable output');

    const children = runtime.getChildTasks(task.id);
    expect(children).toHaveLength(2);
    expect(children[0].userId).toBe('test-e2e-user');
    expect(children[1].userId).toBe('test-e2e-user');
    expect(children[0].status).toBe('completed');
    expect(children[1].status).toBe('completed');

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('aiAgent.taskCreated');
    expect(eventTypes).toContain('aiAgent.planning');
    expect(eventTypes).toContain('aiAgent.thinking');
    expect(eventTypes).toContain('aiAgent.delegated');
    expect(eventTypes).toContain('aiAgent.waiting');
    expect(eventTypes).toContain('aiAgent.completed');
  });
});
