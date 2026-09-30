import type { AgentConfig, AgentState, AgentStatus, AgentStructuredOutput } from './types.js';

export class Agent {
  readonly id: string;
  readonly characterId: number;
  readonly name: string;
  readonly role: string;
  readonly avatar: string;
  readonly personality: string;
  readonly systemPrompt: string;
  readonly capabilities: string[];
  readonly palette: number;
  readonly hueShift?: number;

  status: AgentStatus = 'idle';
  currentTask: string | null = null;
  currentTaskTitle: string | null = null;
  currentStepDescription: string | null = null;
  position: { x: number; y: number; col?: number; row?: number } = { x: 0, y: 0 };
  assignedSeatId?: string;
  lastActive: number = Date.now();
  latestOutput?: AgentStructuredOutput;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.characterId = config.characterId;
    this.name = config.name;
    this.role = config.role;
    this.avatar = config.avatar;
    this.palette = config.palette;
    this.hueShift = config.hueShift;
    this.personality = config.personality;
    this.systemPrompt = config.systemPrompt;
    this.capabilities = [...config.capabilities];
    this.assignedSeatId = config.assignedSeatId;
  }

  setStatus(status: AgentStatus, stepDescription?: string): void {
    this.status = status;
    this.currentStepDescription = stepDescription ?? null;
    this.lastActive = Date.now();
  }

  setCurrentTask(taskId: string | null, title?: string | null): void {
    this.currentTask = taskId;
    this.currentTaskTitle = title ?? null;
  }

  setLatestOutput(output: AgentStructuredOutput): void {
    this.latestOutput = output;
  }

  getState(): AgentState {
    return {
      id: this.id,
      characterId: this.characterId,
      name: this.name,
      role: this.role,
      avatar: this.avatar,
      status: this.status,
      currentTask: this.currentTask,
      currentTaskTitle: this.currentTaskTitle,
      currentStepDescription: this.currentStepDescription,
      position: { ...this.position },
      personality: this.personality,
      systemPrompt: this.systemPrompt,
      capabilities: [...this.capabilities],
      assignedSeatId: this.assignedSeatId,
      lastActive: this.lastActive,
      latestOutput: this.latestOutput ? { ...this.latestOutput } : undefined,
    };
  }
}
