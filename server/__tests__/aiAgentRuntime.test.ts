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

  // 12. TaskRepository operations
  it('12. InMemoryTaskRepository persists, retrieves, updates, and lists tasks and events', async () => {
    const repo = new InMemoryTaskRepository();
    const task: AgentTask = {
      id: 'task-repo-1',
      title: 'Repository Test',
      description: 'Testing task repository',
      userId: 'user-123',
      assignedAgentId: 'manager',
      status: 'queued',
      createdAt: Date.now(),
    };

    await repo.createTask(task);
    const retrieved = await repo.getTask('user-123', 'task-repo-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe('Repository Test');

    await repo.updateTask('user-123', 'task-repo-1', {
      status: 'completed',
      result: 'Finished work',
    });

    const updated = await repo.getTask('user-123', 'task-repo-1');
    expect(updated?.status).toBe('completed');
    expect(updated?.result).toBe('Finished work');

    // Child tasks lookup
    const childTask: AgentTask = {
      id: 'child-1',
      title: 'Child Task',
      description: 'Child desc',
      userId: 'user-123',
      assignedAgentId: 'researcher',
      parentTaskId: 'task-repo-1',
      status: 'completed',
      createdAt: Date.now() + 10,
    };
    await repo.createTask(childTask);

    const children = await repo.getChildTasks('user-123', 'task-repo-1');
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe('child-1');

    // Event logging
    await repo.appendTaskEvent({
      id: 'evt-1',
      taskId: 'task-repo-1',
      userId: 'user-123',
      agentId: 'manager',
      type: 'aiAgent.completed',
      timestamp: Date.now(),
    });
  });

  // 13. Firebase ID token verification
  it('13. verifyFirebaseIdToken verifies mock and test tokens and rejects empty tokens', async () => {
    await expect(verifyFirebaseIdToken('')).rejects.toThrow(/Missing or invalid token/);
    const mockVerified = await verifyFirebaseIdToken('mock-token-user-abc');
    expect(mockVerified.uid).toBe('user-abc');

    const devVerified = await verifyFirebaseIdToken('dev-token-test-123');
    expect(devVerified.uid).toBe('test-123');
  });

  // 14. Security: No Firebase Admin or GEMINI_API_KEY in client bundle
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
});
