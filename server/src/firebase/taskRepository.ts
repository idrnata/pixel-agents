import type { AgentTask } from '../ai/taskTypes.js';
import { getAdminFirestore } from './firebaseAdmin.js';

export interface TaskEventRecord {
  id: string;
  taskId: string;
  userId: string;
  agentId: string;
  type: string;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export interface TaskRepository {
  createTask(task: AgentTask): Promise<void>;
  getTask(userId: string, taskId: string): Promise<AgentTask | undefined>;
  updateTask(userId: string, taskId: string, patch: Partial<AgentTask>): Promise<void>;
  listTasks(userId: string, options?: { limit?: number }): Promise<AgentTask[]>;
  appendTaskEvent(event: TaskEventRecord): Promise<void>;
  getChildTasks(userId: string, parentTaskId: string): Promise<AgentTask[]>;
  listActiveTasksForRecovery(): Promise<AgentTask[]>;
}

// ── In-Memory Implementation (For unit tests & offline mode) ─

export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasksByUser = new Map<string, Map<string, AgentTask>>();
  private readonly eventsByUser = new Map<string, TaskEventRecord[]>();

  async createTask(task: AgentTask): Promise<void> {
    const userId = task.userId || 'default';
    if (!this.tasksByUser.has(userId)) {
      this.tasksByUser.set(userId, new Map());
    }
    this.tasksByUser.get(userId)!.set(task.id, { ...task });
  }

  async getTask(userId: string, taskId: string): Promise<AgentTask | undefined> {
    const userTasks = this.tasksByUser.get(userId);
    return userTasks ? userTasks.get(taskId) : undefined;
  }

  async updateTask(userId: string, taskId: string, patch: Partial<AgentTask>): Promise<void> {
    const userTasks = this.tasksByUser.get(userId);
    if (userTasks && userTasks.has(taskId)) {
      const existing = userTasks.get(taskId)!;
      userTasks.set(taskId, { ...existing, ...patch });
    }
  }

  async listTasks(userId: string, options?: { limit?: number }): Promise<AgentTask[]> {
    const userTasks = this.tasksByUser.get(userId);
    if (!userTasks) return [];
    const list = Array.from(userTasks.values()).sort((a, b) => b.createdAt - a.createdAt);
    return options?.limit ? list.slice(0, options.limit) : list;
  }

  async appendTaskEvent(event: TaskEventRecord): Promise<void> {
    if (!this.eventsByUser.has(event.userId)) {
      this.eventsByUser.set(event.userId, []);
    }
    this.eventsByUser.get(event.userId)!.push({ ...event });
  }

  async getChildTasks(userId: string, parentTaskId: string): Promise<AgentTask[]> {
    const all = await this.listTasks(userId);
    return all.filter((t) => t.parentTaskId === parentTaskId);
  }

  async listActiveTasksForRecovery(): Promise<AgentTask[]> {
    const active: AgentTask[] = [];
    for (const [, userMap] of this.tasksByUser) {
      for (const t of userMap.values()) {
        if (
          t.status === 'queued' ||
          t.status === 'planning' ||
          t.status === 'thinking' ||
          t.status === 'working' ||
          t.status === 'waiting'
        ) {
          active.push({ ...t });
        }
      }
    }
    return active;
  }
}

// ── Cloud Firestore Implementation ───────────────────────────

export class FirebaseTaskRepository implements TaskRepository {
  async createTask(task: AgentTask): Promise<void> {
    const db = getAdminFirestore();
    const userId = task.userId || 'default';
    if (!db) return;

    const docRef = db.collection('users').doc(userId).collection('tasks').doc(task.id);
    await docRef.set({
      id: task.id,
      title: task.title,
      description: task.description,
      userId,
      assignedAgentId: task.assignedAgentId,
      parentTaskId: task.parentTaskId || null,
      status: task.status,
      createdAt: task.createdAt,
      startedAt: task.startedAt || null,
      completedAt: task.completedAt || null,
      currentStep: task.currentStep || null,
      result: task.result || null,
      summary: task.summary || null,
      error: task.error || null,
      metadata: task.metadata || {},
    });
  }

  async getTask(userId: string, taskId: string): Promise<AgentTask | undefined> {
    const db = getAdminFirestore();
    if (!db) return undefined;

    const snap = await db.collection('users').doc(userId).collection('tasks').doc(taskId).get();
    if (!snap.exists) return undefined;
    return snap.data() as AgentTask;
  }

  async updateTask(userId: string, taskId: string, patch: Partial<AgentTask>): Promise<void> {
    const db = getAdminFirestore();
    if (!db) return;

    const cleanPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await db.collection('users').doc(userId).collection('tasks').doc(taskId).update(cleanPatch);
  }

  async listTasks(userId: string, options?: { limit?: number }): Promise<AgentTask[]> {
    const db = getAdminFirestore();
    if (!db) return [];

    let query = db.collection('users').doc(userId).collection('tasks').orderBy('createdAt', 'desc');
    if (options?.limit) query = query.limit(options.limit);
    const snap = await query.get();
    const tasks: AgentTask[] = [];
    for (const d of snap.docs) {
      tasks.push(d.data() as AgentTask);
    }
    return tasks;
  }

  async appendTaskEvent(event: TaskEventRecord): Promise<void> {
    const db = getAdminFirestore();
    if (!db) return;

    const cleanPayload: Record<string, unknown> = {};
    if (event.payload) {
      for (const [k, v] of Object.entries(event.payload)) {
        if (v !== undefined) cleanPayload[k] = v;
      }
    }

    await db
      .collection('users')
      .doc(event.userId)
      .collection('taskEvents')
      .doc(event.id)
      .set({
        id: event.id,
        taskId: event.taskId,
        userId: event.userId,
        agentId: event.agentId,
        type: event.type,
        timestamp: event.timestamp,
        payload: cleanPayload,
      });
  }

  async getChildTasks(userId: string, parentTaskId: string): Promise<AgentTask[]> {
    const db = getAdminFirestore();
    if (!db) return [];

    const snap = await db
      .collection('users')
      .doc(userId)
      .collection('tasks')
      .where('parentTaskId', '==', parentTaskId)
      .get();

    const tasks: AgentTask[] = [];
    for (const d of snap.docs) {
      tasks.push(d.data() as AgentTask);
    }
    return tasks.sort((a, b) => a.createdAt - b.createdAt);
  }

  async listActiveTasksForRecovery(): Promise<AgentTask[]> {
    const db = getAdminFirestore();
    if (!db) return [];

    try {
      const snap = await db
        .collectionGroup('tasks')
        .where('status', 'in', ['queued', 'planning', 'thinking', 'working', 'waiting'])
        .get();

      const tasks: AgentTask[] = [];
      for (const d of snap.docs) {
        tasks.push(d.data() as AgentTask);
      }
      return tasks;
    } catch {
      return [];
    }
  }
}

// Global active repository
export const inMemoryTaskRepository = new InMemoryTaskRepository();
export const firebaseTaskRepository = new FirebaseTaskRepository();

export function getDefaultTaskRepository(): TaskRepository {
  return getAdminFirestore() ? firebaseTaskRepository : inMemoryTaskRepository;
}
