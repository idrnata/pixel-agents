import { GoogleGenAI } from '@google/genai';

import type { ApplicationAgent } from './agentDefinitions.js';
import type { AgentTask, TaskStep } from './taskTypes.js';

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

export interface AIAgentProvider {
  readonly id: string;
  readonly displayName: string;
  executeTask(request: AgentTaskRequest): Promise<AgentTaskResult>;
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
      // Clean up sensitive strings if any
      const cleanError = sanitized.replace(/key=[^&\s]+/gi, 'key=REDACTED');
      throw new Error(`Gemini execution failed: ${cleanError}`);
    }
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
    // 1. Direct JSON parse attempt
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
              status: (s.status === 'completed' || s.status === 'failed' || s.status === 'in_progress') ? s.status : 'completed',
            }))
          : [
              { name: 'Analysis', description: 'Evaluated provided context', status: 'completed' },
              { name: 'Synthesis', description: 'Formulated conclusions', status: 'completed' },
            ];

        return { summary, steps, result };
      }
    } catch {
      // 2. Safe fallback extraction: search for markdown JSON fence or first '{' ... '}'
      const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/);
      if (match && match[1]) {
        try {
          const fallbackParsed = JSON.parse(match[1]) as Record<string, unknown>;
          return {
            summary: typeof fallbackParsed.summary === 'string' ? fallbackParsed.summary : `Analysis for ${fallbackTitle}`,
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

    // If completely unparseable as JSON, treat as failure per requirement
    throw new Error('Gemini response could not be parsed as structured JSON.');
  }
}
