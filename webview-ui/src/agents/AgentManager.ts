import { Agent } from './Agent.js';
import type { AgentConfig, AgentEvent, AgentEventListener, AgentEventType, AgentMessage, AgentState } from './types.js';

export class AgentManager {
  private agents: Map<string, Agent> = new Map();
  private characterIdToAgentId: Map<number, string> = new Map();
  private listeners: Set<AgentEventListener> = new Set();
  private messages: AgentMessage[] = [];

  constructor() {
    this.initDefaultAgents();
  }

  private initDefaultAgents(): void {
    // 1. Manager: AI project manager and orchestrator
    // 2. Researcher: Research and information gathering
    // 3. Analyst: Analytical reasoning & risk modeling
    const defaultConfigs: AgentConfig[] = [
      {
        id: 'agent_manager',
        characterId: 1,
        name: 'Indra (Manager)',
        role: 'AI Project Manager & Orchestrator',
        avatar: '👔',
        palette: 0,
        personality: 'Strategic, decisive, structured, and focused on clear execution and team synthesis.',
        systemPrompt: `You are Indra, the Lead Project Manager and Orchestrator in INDRA AI OFFICE.
Your responsibilities:
- Receive user objectives and task context
- Break down tasks into specialized research directives and quantitative analysis scopes
- Delegate work sequentially to Researcher Atlas and Analyst Cyra
- Monitor progress and synthesize all collected findings and risk audits into a comprehensive Executive Master Report.`,
        capabilities: ['Task Decomposition', 'Workflow Delegation', 'Consensus Synthesis', 'Executive Reporting'],
      },
      {
        id: 'agent_researcher',
        characterId: 2,
        name: 'Atlas (Researcher)',
        role: 'Research & Information Gathering',
        avatar: '🔍',
        palette: 1,
        personality: 'Investigative, factual, objective, and skilled at isolating key facts and missing data.',
        systemPrompt: `You are Atlas, the Research & Information Specialist in INDRA AI OFFICE.
Your responsibilities:
- Analyze information provided by the user or task context
- Identify important facts, market signals, architecture patterns, and empirical evidence
- Organize findings logically with clear bullet points
- Identify missing information or data gaps
- Return structured research findings.`,
        capabilities: ['Fact Extraction', 'Information Organization', 'Data Gap Analysis', 'Context Mining'],
      },
      {
        id: 'agent_analyst',
        characterId: 3,
        name: 'Cyra (Analyst)',
        role: 'Analytical Reasoning & Risk Modeling',
        avatar: '📊',
        palette: 2,
        personality: 'Quantitative, rigorous, critical thinker specializing in pattern detection and risk evaluation.',
        systemPrompt: `You are Cyra, the Analytical Reasoning and Risk Specialist in INDRA AI OFFICE.
Your responsibilities:
- Analyze Researcher Atlas's output
- Identify patterns, trends, and correlations
- Calculate, model, or reason about provided data and fundamentals
- Identify structural, operational, and strategic risks
- Produce structured analysis.`,
        capabilities: ['Pattern Recognition', 'Quantitative Reasoning', 'Risk Identification', 'Feasibility Audits'],
      },
    ];

    for (const config of defaultConfigs) {
      this.registerAgent(config);
    }
  }

  registerAgent(config: AgentConfig): Agent {
    const agent = new Agent(config);
    this.agents.set(agent.id, agent);
    this.characterIdToAgentId.set(agent.characterId, agent.id);
    this.emit({
      type: 'agent.created',
      agentId: agent.id,
      characterId: agent.characterId,
      status: agent.status,
      timestamp: Date.now(),
    });
    return agent;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getAgentByCharacterId(charId: number): Agent | undefined {
    const id = this.characterIdToAgentId.get(charId);
    return id ? this.agents.get(id) : undefined;
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAllStates(): AgentState[] {
    return this.getAllAgents().map((a) => a.getState());
  }

  updateAgentStatus(agentId: string, status: AgentState['status'], stepDescription?: string, toolName?: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.setStatus(status, stepDescription);

    let eventType: AgentEventType = 'agent.working';
    if (status === 'thinking') eventType = 'agent.thinking';
    else if (status === 'reading') eventType = 'agent.reading';
    else if (status === 'writing') eventType = 'agent.writing';
    else if (status === 'waiting') eventType = 'agent.waiting';
    else if (status === 'completed') eventType = 'agent.completed';
    else if (status === 'error') eventType = 'agent.error';

    this.emit({
      type: eventType,
      agentId: agent.id,
      characterId: agent.characterId,
      status,
      toolName: toolName || status,
      description: stepDescription,
      timestamp: Date.now(),
    });
  }

  addMessage(msg: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
    const message: AgentMessage = {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    this.messages.push(message);
    this.emit({
      type: 'message.created',
      agentId: msg.fromAgentId,
      message,
      timestamp: Date.now(),
    });
    return message;
  }

  getMessages(taskId?: string): AgentMessage[] {
    if (!taskId) return [...this.messages];
    return this.messages.filter((m) => m.taskId === taskId);
  }

  on(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[AgentManager] Error in event listener:', err);
      }
    }
  }
}

// Global Singleton AgentManager
export const agentManager = new AgentManager();
