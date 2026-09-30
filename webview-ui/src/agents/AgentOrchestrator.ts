import { AgentManager, agentManager } from './AgentManager.js';
import type { AIProvider } from './providers/AIProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import type { AgentStructuredOutput, AgentTask, TaskSubtask, TimelineStep } from './types.js';

export class AgentOrchestrator {
  private manager: AgentManager;
  private provider: AIProvider;
  private tasks: Map<string, AgentTask> = new Map();
  private activeTaskId: string | null = null;

  constructor(manager: AgentManager = agentManager, provider: AIProvider = new GeminiProvider()) {
    this.manager = manager;
    this.provider = provider;
  }

  getTasks(): AgentTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  getActiveTask(): AgentTask | undefined {
    return this.activeTaskId ? this.tasks.get(this.activeTaskId) : undefined;
  }

  async createTaskAndExecute(title: string, description: string): Promise<AgentTask> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task: AgentTask = {
      id: taskId,
      title,
      description,
      status: 'pending',
      createdAt: Date.now(),
      managerId: 'agent_manager',
      subtasks: [],
      timeline: [
        {
          id: `step_init_${taskId}`,
          timestamp: Date.now(),
          phase: 'manager_planning',
          agentId: 'agent_manager',
          agentName: 'Indra (Manager)',
          agentRole: 'AI Project Manager & Orchestrator',
          agentAvatar: '👔',
          title: 'Task Ingestion & Delegation Planning',
          description: 'Manager receives objective, breaks down problem scope, and prepares research directives.',
          status: 'in_progress',
        },
        {
          id: `step_research_${taskId}`,
          timestamp: Date.now(),
          phase: 'researcher_executing',
          agentId: 'agent_researcher',
          agentName: 'Atlas (Researcher)',
          agentRole: 'Research & Information Gathering',
          agentAvatar: '🔍',
          title: 'Fact Extraction & Information Gathering',
          description: 'Researcher analyzes provided context, extracts factual signals, and identifies missing data.',
          status: 'pending',
        },
        {
          id: `step_analyst_${taskId}`,
          timestamp: Date.now(),
          phase: 'analyst_evaluating',
          agentId: 'agent_analyst',
          agentName: 'Cyra (Analyst)',
          agentRole: 'Analytical Reasoning & Risk Modeling',
          agentAvatar: '📊',
          title: 'Pattern Detection & Risk Modeling',
          description: 'Analyst evaluates research findings, runs quantitative models, and uncovers strategic risk vectors.',
          status: 'pending',
        },
        {
          id: `step_synth_${taskId}`,
          timestamp: Date.now(),
          phase: 'manager_synthesizing',
          agentId: 'agent_manager',
          agentName: 'Indra (Manager)',
          agentRole: 'AI Project Manager & Orchestrator',
          agentAvatar: '👔',
          title: 'Executive Master Synthesis & Final Report',
          description: 'Manager compiles findings and risk evaluations into a finalized Executive Master Report.',
          status: 'pending',
        },
      ],
    };

    this.tasks.set(taskId, task);
    this.activeTaskId = taskId;

    this.manager.emit({
      type: 'task.created',
      taskId: task.id,
      task,
      timestamp: Date.now(),
    });

    // Run task graph asynchronously
    void this.executeWorkflow(task);

    return task;
  }

  private updateTimelineStep(
    task: AgentTask,
    phase: TimelineStep['phase'],
    status: TimelineStep['status'],
    output?: AgentStructuredOutput,
  ): void {
    const step = task.timeline.find((s) => s.phase === phase);
    if (step) {
      step.status = status;
      if (output) step.output = output;
      step.timestamp = Date.now();
    }
    this.manager.emit({
      type: 'task.updated',
      taskId: task.id,
      task,
      timestamp: Date.now(),
    });
  }

  private async executeWorkflow(task: AgentTask): Promise<void> {
    task.status = 'in_progress';

    const managerAgent = this.manager.getAgent('agent_manager');
    const researcherAgent = this.manager.getAgent('agent_researcher');
    const analystAgent = this.manager.getAgent('agent_analyst');

    if (!managerAgent || !researcherAgent || !analystAgent) {
      task.status = 'failed';
      return;
    }

    try {
      // ═══════════════════════════════════════════════════════════════════
      // STEP 1: MANAGER RECEIVES TASK & DELEGATES WORK
      // ═══════════════════════════════════════════════════════════════════
      managerAgent.setCurrentTask(task.id, task.title);
      this.manager.updateAgentStatus('agent_manager', 'thinking', 'Analyzing task & decomposing objectives', 'Think');
      this.manager.emit({
        type: 'agent.moved',
        agentId: managerAgent.id,
        characterId: managerAgent.characterId,
        targetLocation: 'desk',
        timestamp: Date.now(),
      });

      this.manager.addMessage({
        taskId: task.id,
        fromAgentId: managerAgent.id,
        fromAgentName: managerAgent.name,
        type: 'speech',
        content: `Objective received: "${task.title}". Decomposing into research gathering (Atlas) and quantitative/risk analysis (Cyra).`,
      });

      await new Promise((r) => setTimeout(r, 1200));

      const managerPlanJson = await this.provider.generateStructured<AgentStructuredOutput>(
        `User Task Title: ${task.title}\nUser Task Context & Information Provided: ${task.description}`,
        `{
  "agentId": "agent_manager",
  "taskId": "${task.id}",
  "status": "completed",
  "summary": "Executive summary of delegation strategy and work plan",
  "findings": ["Task scope breakdown", "Key target metrics to discover", "Delegation directives for Researcher Atlas"],
  "risks": ["Potential information gaps in prompt", "Execution risks"],
  "nextAction": "Delegate fact extraction and information gathering to Researcher Atlas"
}`,
        { systemInstruction: managerAgent.systemPrompt },
      );

      managerAgent.setLatestOutput(managerPlanJson);
      task.managerPlan = managerPlanJson;
      this.updateTimelineStep(task, 'manager_planning', 'completed', managerPlanJson);

      const subtaskResearch: TaskSubtask = {
        id: `sub_${task.id}_1`,
        agentId: researcherAgent.id,
        agentName: researcherAgent.name,
        agentRole: researcherAgent.role,
        title: `Research & Fact Gathering: ${task.title}`,
        instruction: managerPlanJson.summary,
        status: 'in_progress',
        startedAt: Date.now(),
      };

      const subtaskAnalysis: TaskSubtask = {
        id: `sub_${task.id}_2`,
        agentId: analystAgent.id,
        agentName: analystAgent.name,
        agentRole: analystAgent.role,
        title: `Analytical Modeling & Risk Assessment: ${task.title}`,
        instruction: 'Evaluate Researcher Atlas output for patterns, calculations, and risk vectors.',
        status: 'pending',
      };

      task.subtasks = [subtaskResearch, subtaskAnalysis];

      this.manager.updateAgentStatus('agent_manager', 'waiting', 'Delegated to Researcher Atlas', 'Wait');
      this.manager.emit({
        type: 'agent.moved',
        agentId: managerAgent.id,
        characterId: managerAgent.characterId,
        targetLocation: 'office',
        timestamp: Date.now(),
      });

      this.manager.addMessage({
        taskId: task.id,
        fromAgentId: managerAgent.id,
        fromAgentName: managerAgent.name,
        toAgentId: researcherAgent.id,
        type: 'speech',
        content: `Atlas, please analyze the task context and extract all key facts and data: ${managerPlanJson.summary}`,
      });

      // ═══════════════════════════════════════════════════════════════════
      // STEP 2: RESEARCHER ANALYZES PROVIDED INFORMATION & GATHERS FACTS
      // ═══════════════════════════════════════════════════════════════════
      this.updateTimelineStep(task, 'researcher_executing', 'in_progress');
      researcherAgent.setCurrentTask(task.id, task.title);

      this.manager.emit({
        type: 'agent.moved',
        agentId: researcherAgent.id,
        characterId: researcherAgent.characterId,
        targetLocation: 'desk',
        timestamp: Date.now(),
      });

      await new Promise((r) => setTimeout(r, 900));
      this.manager.updateAgentStatus('agent_researcher', 'reading', 'Analyzing provided information & identifying facts', 'Search');

      await new Promise((r) => setTimeout(r, 1600));
      this.manager.updateAgentStatus('agent_researcher', 'working', 'Compiling structured research findings', 'Research');

      const researcherPrompt = `Task Title: ${task.title}
Task Information Provided: ${task.description}
Manager Instructions: ${managerPlanJson.summary}

Instructions for Researcher Atlas:
1. Analyze strictly based on information provided in the task and fundamental knowledge.
2. Identify all crucial facts, business segments, revenue drivers, and architecture foundations.
3. Organize findings with clear structure.
4. Identify missing information or data limitations.
5. Return valid JSON adhering to the exact AgentStructuredOutput schema.`;

      const researcherOutput = await this.provider.generateStructured<AgentStructuredOutput>(
        researcherPrompt,
        `{
  "agentId": "agent_researcher",
  "taskId": "${task.id}",
  "status": "completed",
  "summary": "Concise summary of research intelligence gathered",
  "findings": [
    "Key fact or finding 1",
    "Key fact or finding 2",
    "Key fact or finding 3",
    "Identified information gaps / missing data"
  ],
  "risks": [
    "Information limitation risk",
    "Domain specific observation"
  ],
  "nextAction": "Forward structured research findings to Quantitative Analyst Cyra for evaluation"
}`,
        { systemInstruction: researcherAgent.systemPrompt },
      );

      researcherAgent.setLatestOutput(researcherOutput);
      task.researcherOutput = researcherOutput;
      subtaskResearch.status = 'completed';
      subtaskResearch.structuredOutput = researcherOutput;
      subtaskResearch.result = researcherOutput.summary;
      subtaskResearch.completedAt = Date.now();

      this.updateTimelineStep(task, 'researcher_executing', 'completed', researcherOutput);
      this.manager.updateAgentStatus('agent_researcher', 'completed', 'Research intelligence structured & ready', 'Done');

      this.manager.emit({
        type: 'agent.moved',
        agentId: researcherAgent.id,
        characterId: researcherAgent.characterId,
        targetLocation: 'meeting',
        timestamp: Date.now(),
      });

      this.manager.addMessage({
        taskId: task.id,
        fromAgentId: researcherAgent.id,
        fromAgentName: researcherAgent.name,
        toAgentId: analystAgent.id,
        type: 'report',
        content: `Research findings ready for "${task.title}":\nSummary: ${researcherOutput.summary}\nFindings: ${researcherOutput.findings.length} points extracted. Handing over to Cyra.`,
      });

      // ═══════════════════════════════════════════════════════════════════
      // STEP 3: ANALYST REASONS ABOUT RESEARCHER OUTPUT & IDENTIFIES RISKS
      // ═══════════════════════════════════════════════════════════════════
      this.updateTimelineStep(task, 'analyst_evaluating', 'in_progress');
      analystAgent.setCurrentTask(task.id, task.title);

      this.manager.emit({
        type: 'agent.moved',
        agentId: analystAgent.id,
        characterId: analystAgent.characterId,
        targetLocation: 'desk',
        timestamp: Date.now(),
      });

      subtaskAnalysis.status = 'in_progress';
      subtaskAnalysis.startedAt = Date.now();

      await new Promise((r) => setTimeout(r, 1000));
      this.manager.updateAgentStatus('agent_analyst', 'thinking', 'Evaluating patterns & calculating fundamentals', 'Analyze');

      this.manager.addMessage({
        taskId: task.id,
        fromAgentId: analystAgent.id,
        fromAgentName: analystAgent.name,
        type: 'speech',
        content: `Analyzing Atlas's findings for "${task.title}". Stress-testing fundamentals, identifying structural patterns, and quantifying risk vectors.`,
      });

      await new Promise((r) => setTimeout(r, 1800));
      this.manager.updateAgentStatus('agent_analyst', 'writing', 'Modeling risks & synthesis metrics', 'Code');

      const analystPrompt = `Task Title: ${task.title}
Task Background: ${task.description}

RESEARCH FINDINGS FROM ATLAS:
Summary: ${researcherOutput.summary}
Findings:
${researcherOutput.findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}
Identified Limitations / Gaps:
${researcherOutput.risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Instructions for Analyst Cyra:
1. Thoroughly analyze Researcher Atlas's output.
2. Identify core patterns, competitive moats, market dynamics, and operational feasibility.
3. Calculate/reason about the provided data points.
4. Uncover critical business, market, regulatory, or technical risk vectors.
5. Produce structured JSON according to the AgentStructuredOutput schema.`;

      const analystOutput = await this.provider.generateStructured<AgentStructuredOutput>(
        analystPrompt,
        `{
  "agentId": "agent_analyst",
  "taskId": "${task.id}",
  "status": "completed",
  "summary": "Deep analytical evaluation and fundamental risk modeling summary",
  "findings": [
    "Analytical pattern or fundamental deduction 1",
    "Analytical pattern or fundamental deduction 2",
    "Analytical calculation or strategic metric 3"
  ],
  "risks": [
    "Primary risk vector 1",
    "Primary risk vector 2",
    "Structural or competitive threat 3"
  ],
  "nextAction": "Submit quantitative assessment & risk matrix to Indra for Executive Master Synthesis"
}`,
        { systemInstruction: analystAgent.systemPrompt },
      );

      analystAgent.setLatestOutput(analystOutput);
      task.analystOutput = analystOutput;
      subtaskAnalysis.status = 'completed';
      subtaskAnalysis.structuredOutput = analystOutput;
      subtaskAnalysis.result = analystOutput.summary;
      subtaskAnalysis.completedAt = Date.now();

      this.updateTimelineStep(task, 'analyst_evaluating', 'completed', analystOutput);
      this.manager.updateAgentStatus('agent_analyst', 'completed', 'Analysis & risk evaluation finalized', 'Done');

      this.manager.emit({
        type: 'agent.moved',
        agentId: analystAgent.id,
        characterId: analystAgent.characterId,
        targetLocation: 'meeting',
        timestamp: Date.now(),
      });

      this.manager.addMessage({
        taskId: task.id,
        fromAgentId: analystAgent.id,
        fromAgentName: analystAgent.name,
        toAgentId: managerAgent.id,
        type: 'report',
        content: `Quantitative & risk analysis completed for "${task.title}". Identified ${analystOutput.risks.length} key risk vectors. Ready for Indra's final synthesis.`,
      });

      // ═══════════════════════════════════════════════════════════════════
      // STEP 4: MANAGER COLLECTS RESULTS & PRODUCES FINAL SYNTHESIS REPORT
      // ═══════════════════════════════════════════════════════════════════
      this.updateTimelineStep(task, 'manager_synthesizing', 'in_progress');
      this.manager.emit({
        type: 'agent.moved',
        agentId: managerAgent.id,
        characterId: managerAgent.characterId,
        targetLocation: 'desk',
        timestamp: Date.now(),
      });

      await new Promise((r) => setTimeout(r, 1000));
      this.manager.updateAgentStatus('agent_manager', 'thinking', 'Reviewing team outputs & synthesizing strategy', 'Think');

      await new Promise((r) => setTimeout(r, 1500));
      this.manager.updateAgentStatus('agent_manager', 'writing', 'Drafting Executive Master Report', 'Write');

      const synthesisPrompt = `Task Title: ${task.title}
Original Context: ${task.description}

1. RESEARCHER FINDINGS (Atlas):
Summary: ${researcherOutput.summary}
Findings:
${researcherOutput.findings.map((f) => `- ${f}`).join('\n')}

2. ANALYST EVALUATION & RISK AUDIT (Cyra):
Summary: ${analystOutput.summary}
Analytical Insights:
${analystOutput.findings.map((f) => `- ${f}`).join('\n')}
Identified Risks:
${analystOutput.risks.map((r) => `- ${r}`).join('\n')}

Manager Directives:
Produce the final Executive Master Synthesis in two parts:
1. A structured JSON summary conforming to AgentStructuredOutput.
2. A comprehensive, polished Markdown Executive Master Report with Executive Summary, Fact Sheet, Critical Risk Matrix, and Actionable Recommendations.`;

      const finalSynthesisOutput = await this.provider.generateStructured<AgentStructuredOutput>(
        synthesisPrompt,
        `{
  "agentId": "agent_manager",
  "taskId": "${task.id}",
  "status": "completed",
  "summary": "Executive master synthesis summary across all research and analytical outputs",
  "findings": [
    "Core synthesized takeaway 1",
    "Core synthesized takeaway 2",
    "Strategic recommendation 3"
  ],
  "risks": [
    "Priority mitigated risk 1",
    "Key monitoring indicator 2"
  ],
  "nextAction": "Executive Master Report finalized and published to office repository"
}`,
        { systemInstruction: managerAgent.systemPrompt },
      );

      const finalReportMarkdown = await this.provider.generateText(
        `${synthesisPrompt}\n\nDeliverable: Please format the comprehensive Executive Master Report in high-grade Markdown with clean headings (#, ##), bullet points, comparison tables where appropriate, and actionable next steps.`,
        { systemInstruction: managerAgent.systemPrompt },
      );

      managerAgent.setLatestOutput(finalSynthesisOutput);
      task.finalSynthesisOutput = finalSynthesisOutput;
      task.finalReport = finalReportMarkdown;
      task.summary = finalSynthesisOutput.summary;
      task.status = 'completed';
      task.completedAt = Date.now();

      this.updateTimelineStep(task, 'manager_synthesizing', 'completed', finalSynthesisOutput);
      this.manager.updateAgentStatus('agent_manager', 'completed', 'Executive Master Report published', 'Done');

      this.manager.addMessage({
        taskId: task.id,
        fromAgentId: managerAgent.id,
        fromAgentName: managerAgent.name,
        type: 'speech',
        content: `Team, the Executive Master Report for "${task.title}" is complete and published. All findings and risk vectors have been synthesized.`,
      });

      this.manager.emit({
        type: 'task.completed',
        taskId: task.id,
        task,
        timestamp: Date.now(),
      });

      // After task completion, team meets in lounge to celebrate / discuss
      this.manager.emit({
        type: 'agent.moved',
        agentId: managerAgent.id,
        characterId: managerAgent.characterId,
        targetLocation: 'meeting',
        timestamp: Date.now(),
      });

      // Settle agents back to idle after a brief pause
      setTimeout(() => {
        this.manager.updateAgentStatus('agent_manager', 'idle');
        this.manager.updateAgentStatus('agent_researcher', 'idle');
        this.manager.updateAgentStatus('agent_analyst', 'idle');
        managerAgent.setCurrentTask(null, null);
        researcherAgent.setCurrentTask(null, null);
        analystAgent.setCurrentTask(null, null);
      }, 7000);
    } catch (err) {
      console.error('[AgentOrchestrator] Task execution error:', err);
      task.status = 'failed';
      this.manager.updateAgentStatus('agent_manager', 'error', 'Error during task graph execution');
    }
  }
}

// Global Singleton Orchestrator
export const agentOrchestrator = new AgentOrchestrator();
