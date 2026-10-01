import { GoogleGenAI } from '@google/genai';

import type { ApplicationAgent } from './agentDefinitions.js';
import type { AgentTask, ManagerPlanOutput, TaskStep } from './taskTypes.js';

export interface AgentTaskRequest {
  agent: ApplicationAgent;
  task: AgentTask;
}

export interface AgentTaskResult {
  summary: string;
  steps: TaskStep[];
  result: string;
}

export interface AgentChatRequest {
  agent: ApplicationAgent;
  message: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
}

export interface AgentChatResult {
  reply: string;
}

export interface ChildTaskResultPayload {
  agentId: string;
  title: string;
  status: string;
  result: string;
  error?: string;
}

export interface AIAgentProvider {
  readonly id: string;
  readonly displayName: string;
  executeTask(request: AgentTaskRequest): Promise<AgentTaskResult>;
  planManagerDelegation(request: { agent: ApplicationAgent; task: AgentTask }): Promise<ManagerPlanOutput>;
  synthesizeManagerResults(request: {
    agent: ApplicationAgent;
    task: AgentTask;
    childResults: ChildTaskResultPayload[];
  }): Promise<AgentTaskResult>;
  chat(request: AgentChatRequest): Promise<AgentChatResult>;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export class GeminiProvider implements AIAgentProvider {
  readonly id = 'gemini';
  readonly displayName: string;
  private readonly client: GoogleGenAI | null = null;
  private readonly modelName: string;

  constructor(apiKey?: string, modelOverride?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY;
    this.modelName = modelOverride ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    this.displayName = `Google Gemini (${this.modelName})`;

    if (key) {
      try {
        this.client = new GoogleGenAI({
          apiKey: key,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
      } catch (err) {
        console.error('[GeminiProvider] Failed to instantiate GoogleGenAI client:', err);
      }
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getModelName(): string {
    return this.modelName;
  }

  async executeTask(request: AgentTaskRequest): Promise<AgentTaskResult> {
    if (!this.client) {
      throw new Error('GEMINI_API_KEY is not configured on the server. Please set GEMINI_API_KEY in environment.');
    }

    const { agent, task } = request;

    const prompt = `You are performing the following assigned task in INDRA AI OFFICE:
Title: ${task.title}
Task Information & Directives:
${task.description}

Requirement: Return ONLY a valid JSON object matching this schema:
{
  "summary": "Concise 1-2 sentence overview of your output",
  "steps": [
    { "name": "Step name", "description": "What was analyzed or performed", "status": "completed" }
  ],
  "result": "Comprehensive and structured deliverable matching your role capabilities"
}`;

    try {
      console.log(`[GeminiProvider] Executing task "${task.id}" with agent "${agent.id}" via ${this.modelName}...`);

      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction: agent.systemInstruction,
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      });

      const rawText = response.text?.trim() ?? '';
      if (!rawText) {
        throw new Error('Gemini returned an empty response.');
      }

      return this.parseStructuredTaskResult(rawText, task.title);
    } catch (err) {
      const sanitized = err instanceof Error ? err.message : String(err);
      console.error(`[GeminiProvider] Task execution failed for task "${task.id}":`, sanitized);
      const cleanError = sanitized.replace(/key=[^&\s]+/gi, 'key=REDACTED');
      throw new Error(`Gemini execution failed: ${cleanError}`);
    }
  }

  async planManagerDelegation(request: { agent: ApplicationAgent; task: AgentTask }): Promise<ManagerPlanOutput> {
    if (!this.client) {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const { agent, task } = request;

    const prompt = `User Objective: ${task.title}
Objective Details & Context:
${task.description}

As Manager, evaluate if this objective can be completed directly, or if you should delegate fact-gathering to "researcher" and/or quantitative/risk analysis to "analyst".

Return ONLY valid JSON matching this exact schema:
{
  "mode": "direct" | "delegate",
  "reason": "Explanation of your orchestration strategy",
  "delegations": [
    {
      "agentId": "researcher" | "analyst",
      "title": "Subtask title",
      "instruction": "Specific directive for this agent"
    }
  ]
}

Constraints:
- Allowed agentId in delegations: ONLY "researcher" or "analyst". NEVER "manager".
- If mode is "direct", "delegations" must be empty.
- If mode is "delegate", provide at least 1 delegation.`;

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction: agent.systemInstruction,
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      });

      const raw = response.text?.trim() ?? '{}';
      const parsed = JSON.parse(raw) as Partial<ManagerPlanOutput>;

      const mode = parsed.mode === 'delegate' ? 'delegate' : 'direct';
      const reason = typeof parsed.reason === 'string' ? parsed.reason : 'Direct orchestration';
      const rawDelegations = Array.isArray(parsed.delegations) ? parsed.delegations : [];

      const delegations = rawDelegations
        .filter((d) => d && (d.agentId === 'researcher' || d.agentId === 'analyst'))
        .map((d) => ({
          agentId: d.agentId as 'researcher' | 'analyst',
          title: typeof d.title === 'string' ? d.title : `Subtask for ${d.agentId}`,
          instruction: typeof d.instruction === 'string' ? d.instruction : task.description,
        }));

      if (mode === 'delegate' && delegations.length === 0) {
        return { mode: 'direct', reason: 'No valid child delegations found; executing directly', delegations: [] };
      }

      return { mode, reason, delegations: mode === 'delegate' ? delegations : [] };
    } catch (err) {
      console.warn('[GeminiProvider] Delegation planning parse fallback to direct:', err);
      return { mode: 'direct', reason: 'Fallback to direct execution', delegations: [] };
    }
  }

  async synthesizeManagerResults(request: {
    agent: ApplicationAgent;
    task: AgentTask;
    childResults: ChildTaskResultPayload[];
  }): Promise<AgentTaskResult> {
    if (!this.client) {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const { agent, task, childResults } = request;

    const childReportsText = childResults
      .map(
        (c, idx) =>
          `### Child Deliverable ${idx + 1} (${c.agentId.toUpperCase()}): "${c.title}"\nStatus: ${c.status}\nOutput:\n${c.result || c.error || 'No output recorded'}`,
      )
      .join('\n\n');

    const prompt = `You are synthesizing the Master Executive Deliverable for the overall project.
Project Title: ${task.title}
Project Directives:
${task.description}

Verified Child Agent Deliverables:
${childReportsText}

Strict Requirement:
Synthesize an authoritative, structured Executive Master Report strictly incorporating the findings, facts, and risks identified above by your team. Do not fabricate child results.

Return ONLY valid JSON matching this schema:
{
  "summary": "Executive 1-2 sentence master summary",
  "steps": [
    { "name": "Phase name", "description": "What was gathered or evaluated", "status": "completed" }
  ],
  "result": "Comprehensive and structured Master Executive Report"
}`;

    const response = await this.client.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        systemInstruction: agent.systemInstruction,
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text?.trim() ?? '';
    return this.parseStructuredTaskResult(rawText, task.title);
  }

  async chat(request: AgentChatRequest): Promise<AgentChatResult> {
    if (!this.client) {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const { agent, message } = request;

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: message,
        config: {
          systemInstruction: `${agent.systemInstruction}\nYou are conversing directly with the user inside INDRA AI OFFICE. Be concise, insightful, and remain in character.`,
          temperature: 0.6,
        },
      });

      return {
        reply: response.text?.trim() || 'Standing by for objectives.',
      };
    } catch (err) {
      const sanitized = err instanceof Error ? err.message : String(err);
      console.error('[GeminiProvider] Chat error:', sanitized);
      throw new Error(`Chat failed: ${sanitized.replace(/key=[^&\s]+/gi, 'key=REDACTED')}`);
    }
  }

  private parseStructuredTaskResult(rawText: string, fallbackTitle: string): AgentTaskResult {
    try {
      const parsed = JSON.parse(rawText) as {
        summary?: unknown;
        steps?: unknown;
        result?: unknown;
      };

      if (parsed && typeof parsed === 'object') {
        const summary = typeof parsed.summary === 'string' ? parsed.summary : `Completed: ${fallbackTitle}`;
        const result = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed, null, 2);
        const steps: TaskStep[] = Array.isArray(parsed.steps)
          ? parsed.steps.map((s: Record<string, unknown>, idx: number) => ({
              name: typeof s.name === 'string' ? s.name : `Step ${idx + 1}`,
              description: typeof s.description === 'string' ? s.description : '',
              status:
                s.status === 'completed' || s.status === 'failed' || s.status === 'in_progress'
                  ? s.status
                  : 'completed',
            }))
          : [
              { name: 'Analysis', description: 'Evaluated provided context', status: 'completed' },
              { name: 'Synthesis', description: 'Formulated conclusions', status: 'completed' },
            ];

        return { summary, steps, result };
      }
    } catch {
      const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/);
      if (match && match[1]) {
        try {
          const fallbackParsed = JSON.parse(match[1]) as Record<string, unknown>;
          return {
            summary:
              typeof fallbackParsed.summary === 'string' ? fallbackParsed.summary : `Analysis for ${fallbackTitle}`,
            steps: Array.isArray(fallbackParsed.steps)
              ? (fallbackParsed.steps as TaskStep[])
              : [{ name: 'Execution', description: 'Processed task directives', status: 'completed' }],
            result: typeof fallbackParsed.result === 'string' ? fallbackParsed.result : match[1],
          };
        } catch {
          // JSON inside fence also malformed
        }
      }
    }

    throw new Error('Gemini response could not be parsed as structured JSON.');
  }
}
