import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';

import type { AgentTask } from '../../../core/src/index.js';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

// ── Anonymous Auth Lifecycle ─────────────────────────────────

let authInitPromise: Promise<string | null> | null = null;

export async function ensureAnonymousAuth(): Promise<string | null> {
  if (auth.currentUser) {
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      // fallback
    }
  }

  if (authInitPromise) return authInitPromise;

  authInitPromise = (async () => {
    try {
      const cred = await signInAnonymously(auth);
      return await cred.user.getIdToken();
    } catch (err) {
      console.warn('[Firebase] Anonymous sign-in warning:', err);
      return null;
    } finally {
      authInitPromise = null;
    }
  })();

  return authInitPromise;
}

// Auto-authenticate on browser load
if (typeof window !== 'undefined') {
  void ensureAnonymousAuth();
}

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on boot per Skill requirement
async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

// ── Firestore Tasks Sync ─────────────────────────────────────

const TASKS_PATH = 'tasks';

export async function persistTaskToFirestore(task: AgentTask): Promise<void> {
  const docPath = `${TASKS_PATH}/${task.id}`;
  try {
    const payload: Record<string, unknown> = {
      id: task.id,
      title: task.title,
      description: task.description,
      assignedAgentId: task.assignedAgentId,
      status: task.status,
      createdAt: task.createdAt,
    };
    if (task.startedAt) payload.startedAt = task.startedAt;
    if (task.completedAt) payload.completedAt = task.completedAt;
    if (task.currentStep) payload.currentStep = task.currentStep;
    if (task.result) payload.result = task.result;
    if (task.summary) payload.summary = task.summary;
    if (task.error) payload.error = task.error;

    await setDoc(doc(db, TASKS_PATH, task.id), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function fetchTasksFromFirestore(): Promise<AgentTask[]> {
  try {
    const snapshot = await getDocs(collection(db, TASKS_PATH));
    const tasks: AgentTask[] = [];
    snapshot.forEach((d) => {
      tasks.push(d.data() as AgentTask);
    });
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, TASKS_PATH);
  }
}

export function subscribeTasksFromFirestore(onUpdate: (tasks: AgentTask[]) => void): () => void {
  return onSnapshot(
    collection(db, TASKS_PATH),
    (snapshot) => {
      const tasks: AgentTask[] = [];
      snapshot.forEach((d) => {
        tasks.push(d.data() as AgentTask);
      });
      onUpdate(tasks.sort((a, b) => b.createdAt - a.createdAt));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, TASKS_PATH);
    },
  );
}

// ── Firestore Office Settings & Layout Sync ──────────────────

const SETTINGS_PATH = 'officeSettings';
const MAIN_LAYOUT_DOC = 'main_layout';

export async function persistLayoutToFirestore(layoutJson: string): Promise<void> {
  const docPath = `${SETTINGS_PATH}/${MAIN_LAYOUT_DOC}`;
  try {
    await setDoc(doc(db, SETTINGS_PATH, MAIN_LAYOUT_DOC), {
      id: MAIN_LAYOUT_DOC,
      layout: layoutJson,
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function fetchLayoutFromFirestore(): Promise<string | null> {
  const docPath = `${SETTINGS_PATH}/${MAIN_LAYOUT_DOC}`;
  try {
    const snapshot = await getDoc(doc(db, SETTINGS_PATH, MAIN_LAYOUT_DOC));
    if (snapshot.exists()) {
      return (snapshot.data() as { layout?: string }).layout ?? null;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}
