import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';

import {
  APPLICATION_AGENTS,
  getAllApplicationAgents,
  getApplicationAgent,
} from '../src/ai/agentDefinitions.js';
import { AiAgentRuntime } from '../src/ai/aiAgentRuntime.js';
import type { AIAgentProvider } from '../src/ai/geminiProvider.js';
import { GeminiProvider } from '../src/ai/geminiProvider.js';
import type { AgentTask,AIAgentEvent } from '../src/ai/taskTypes.js';

describe('AI Agent Runtime & Provider Tests', () => {
  // Mock Provider for deterministic tests
  const createMockProvider = (behavior: {
    succeed?: boolean;
    result?: string;
    summary?: string;
    shouldThrow?: boolean;
    throwMessage?: string;
    delayMs?: number;
  }): AIAgentProvider => ({
    id: 'mock-gemini',
    displayName: 'Mock Gemini',
    async executeTask(req) {
      if (behavior.delayMs) {
        await new Promise((r) => setTimeout(r, behavior.delayMs));
      }
      if (behavior.shouldThrow) {
        throw new Error(behavior.throwMessage || 'API quota exceeded');
      }
      return {
        summary: behavior.summary || `Summary for ${req.task.title}`,
        steps: [
          { name: 'Analysis', description: 'Evaluated prompt', status: 'completed' },
          { name: 'Deliverable', description: 'Formulated result', status: 'completed' },
        ],
        result: behavior.result || `Result deliverable for ${req.task.title}`,
      };
    },
    async chat() {
      return { reply: 'Mock reply' };
    },
  });

  // 1. Unknown agent ID rejected
  it('1. rejects unknown agent ID', () => {
    const runtime = new AiAgentRuntime(createMockProvider({}));
    expect(() => {
      runtime.createTask('unknown_bot', 'Valid title', 'Valid description');
    }).toThrow(/Unknown agent ID "unknown_bot"/);
  });

  // 2. Missing title rejected
  it('2. rejects missing or empty title', () => {
    const runtime = new AiAgentRuntime(createMockProvider({}));
    expect(() => {
      runtime.createTask('researcher', '   ', 'Valid description');
    }).toThrow(/Task title is required/);
  });

  // 3. Missing description rejected
  it('3. rejects missing or empty description', () => {
    const runtime = new AiAgentRuntime(createMockProvider({}));
    expect(() => {
      runtime.createTask('researcher', 'Valid title', '');
    }).toThrow(/Task description is required/);
  });

  // 4. Task creation
  it('4. creates task in queued state with correct properties', () => {
    const runtime = new AiAgentRuntime(createMockProvider({}));
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
    const runtime = new AiAgentRuntime(createMockProvider({}));
    const task1 = runtime.createTask('manager', 'Task 1', 'Desc 1');
    const task2 = runtime.createTask('manager', 'Task 2', 'Desc 2');

    expect(task1.id).not.toBe(task2.id);
    // UUID v4 format regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(task1.id).toMatch(uuidRegex);
    expect(task2.id).toMatch(uuidRegex);
  });

  // 6. Task lifecycle (queued -> planning -> thinking -> working -> completed)
  it('6. executes full task lifecycle through state transitions', async () => {
    const runtime = new AiAgentRuntime(createMockProvider({ delayMs: 10 }));
    const events: AIAgentEvent[] = [];
    runtime.setBroadcaster((evt) => events.push(evt));

    const task = runtime.createTask('analyst', 'Analyze market', 'Market info');
    expect(task.status).toBe('queued');

    // Wait for lifecycle phases to finish
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
    const runtime = new AiAgentRuntime(createMockProvider({ delayMs: 150 }));

    // Task 1 for Manager (runs immediately)
    const taskM1 = runtime.createTask('manager', 'M1', 'Desc');
    // Task 2 for Manager (waits in queue)
    const taskM2 = runtime.createTask('manager', 'M2', 'Desc');

    // Task 3 for Researcher (runs concurrently with Manager)
    const taskR1 = runtime.createTask('researcher', 'R1', 'Desc');

    expect(taskM1.status).toBe('queued');
    expect(taskM2.status).toBe('queued');
    expect(taskR1.status).toBe('queued');

    // Wait slightly so taskM1 and taskR1 start running concurrently
    await vi.waitFor(
      () => {
        expect(runtime.getActiveTaskForAgent('manager')?.id).toBe(taskM1.id);
        expect(runtime.getActiveTaskForAgent('researcher')?.id).toBe(taskR1.id);
      },
      { timeout: 1000 },
    );

    // M2 should still be queued
    expect(runtime.getQueueForAgent('manager').some((t) => t.id === taskM2.id)).toBe(true);

    // Wait for M1 and R1 to finish, and M2 to run and complete
    await vi.waitFor(
      () => {
        expect(taskM1.status).toBe('completed');
        expect(taskR1.status).toBe('completed');
        expect(taskM2.status).toBe('completed');
      },
      { timeout: 5000, interval: 100 },
    );
  });

  // 8. Gemini provider success
  it('8. GeminiProvider successfully parses valid structured JSON responses', async () => {
    const provider = new GeminiProvider('fake-key-for-test');
    const agent = getApplicationAgent('researcher')!;
    const task: AgentTask = {
      id: 'test-uuid-1',
      title: 'Analyze Nvidia',
      description: 'Test description',
      assignedAgentId: 'researcher',
      status: 'working',
      createdAt: Date.now(),
    };

    // Mock internal client
    const mockJson = JSON.stringify({
      summary: 'Executive overview of Nvidia',
      steps: [{ name: 'Fact check', description: 'Verified Hopper', status: 'completed' }],
      result: 'Detailed Nvidia findings',
    });

    (provider as unknown as { client: { models: { generateContent: () => Promise<{ text: string }> } } }).client = {
      models: {
        generateContent: async () => ({ text: mockJson }),
      },
    };

    const res = await provider.executeTask({ agent, task });
    expect(res.summary).toBe('Executive overview of Nvidia');
    expect(res.result).toBe('Detailed Nvidia findings');
    expect(res.steps).toHaveLength(1);
  });

  // 9. Gemini provider failure marks task as failed
  it('9. GeminiProvider failures mark tasks as failed with clean error', async () => {
    const runtime = new AiAgentRuntime(
      createMockProvider({ shouldThrow: true, throwMessage: 'Rate limit exceeded key=SECRET123' }),
    );
    const events: AIAgentEvent[] = [];
    runtime.setBroadcaster((e) => events.push(e));

    const task = runtime.createTask('analyst', 'Failing Task', 'Desc');

    await vi.waitFor(
      () => {
        expect(task.status).toBe('failed');
      },
      { timeout: 3000 },
    );

    expect(task.error).toContain('Rate limit exceeded');
    expect(task.result).toBeUndefined(); // NO fake completion!
    expect(events.some((e) => e.type === 'aiAgent.failed')).toBe(true);
  });

  // 10. Malformed Gemini JSON handles fallback or fails safely
  it('10. handles markdown JSON code fences or errors cleanly when unparseable', async () => {
    const provider = new GeminiProvider('fake-key-for-test');
    const agent = getApplicationAgent('analyst')!;
    const task: AgentTask = {
      id: 'test-uuid-2',
      title: 'Fence Test',
      description: 'Desc',
      assignedAgentId: 'analyst',
      status: 'working',
      createdAt: Date.now(),
    };

    // JSON inside markdown code fence
    const fencedJson = '```json\n{"summary": "Parsed from fence", "result": "Fence result"}\n```';
    (provider as unknown as { client: { models: { generateContent: () => Promise<{ text: string }> } } }).client = {
      models: {
        generateContent: async () => ({ text: fencedJson }),
      },
    };

    const res = await provider.executeTask({ agent, task });
    expect(res.summary).toBe('Parsed from fence');
    expect(res.result).toBe('Fence result');

    // Unparseable gibberish fails cleanly
    (provider as unknown as { client: { models: { generateContent: () => Promise<{ text: string }> } } }).client = {
      models: {
        generateContent: async () => ({ text: 'NOT VALID JSON AT ALL' }),
      },
    };

    await expect(provider.executeTask({ agent, task })).rejects.toThrow(
      /could not be parsed as structured JSON/,
    );
  });

  // 11. WebSocket task events
  it('11. broadcasts strongly typed task events during execution', async () => {
    const runtime = new AiAgentRuntime(createMockProvider({ delayMs: 10 }));
    const broadcasted: AIAgentEvent[] = [];
    runtime.setBroadcaster((evt) => broadcasted.push(evt));

    const task = runtime.createTask('manager', 'Manager Task', 'Planning directives');

    await vi.waitFor(
      () => {
        expect(task.status).toBe('completed');
      },
      { timeout: 3000 },
    );

    const types = broadcasted.map((b) => b.type);
    expect(types).toEqual([
      'aiAgent.taskCreated',
      'aiAgent.planning',
      'aiAgent.thinking',
      'aiAgent.working',
      'aiAgent.completed',
    ]);
  });

  // 12. API key never appears in client code
  it('12. verifies GEMINI_API_KEY does not appear in client-side code bundles or UI files', () => {
    const webviewSrcDir = path.resolve(__dirname, '../../webview-ui/src');
    const clientFiles = fs.readdirSync(webviewSrcDir, { recursive: true }) as string[];

    for (const relPath of clientFiles) {
      if (typeof relPath === 'string' && (relPath.endsWith('.ts') || relPath.endsWith('.tsx') || relPath.endsWith('.js'))) {
        const fullPath = path.join(webviewSrcDir, relPath);
        // Skip server dev mock handlers if any
        if (fullPath.includes('/server/')) continue;

        const content = fs.readFileSync(fullPath, 'utf8');
        expect(content).not.toContain('process.env.GEMINI_API_KEY');
        expect(content).not.toContain('import.meta.env.GEMINI_API_KEY');
        expect(content).not.toContain('import.meta.env.VITE_GEMINI_API_KEY');
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
