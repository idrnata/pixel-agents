import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import * as crypto from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';

import type { AgentRuntime } from './agentRuntime.js';
import type { AgentStateStore } from './agentStateStore.js';
import {
  aiAgentRuntime,
  APPLICATION_AGENTS,
  extractAndVerifyUserId,
  getAllApplicationAgents,
} from './ai/index.js';
import type {
  AssetCache,
  ReloadAssetsSideEffect,
  SetHooksEnabledSideEffect,
} from './clientMessageHandler.js';
import { handleClientMessage, readHooksConsent } from './clientMessageHandler.js';
import {
  HOOK_API_PREFIX,
  MAX_HOOK_BODY_SIZE,
  WS_CLOSE_FORBIDDEN_ORIGIN,
  WS_CLOSE_UNAUTHORIZED,
} from './constants.js';
import { verifyFirebaseIdToken } from './firebase/firebaseAdmin.js';
import type { AgentState } from './types.js';

/** Options for creating the HTTP + WebSocket server. */
export interface HttpServerOptions {
  /** Target port. 0 = assign dynamic free port. */
  port?: number;
  /** Host to bind to. Default '127.0.0.1'. */
  host?: string;
  /** True when hosted inside VS Code webview iframe. False in standalone web. */
  embedded?: boolean;
  /** Shared auth token from host extension or CLI URL. */
  token: string;
  /** Path to static directory containing webview build output (standalone mode). */
  staticDir?: string;
  /** Shared agent state store (for standalone mode broadcast). */
  store: AgentStateStore;
  /** Runtime engine instance (standalone mode). */
  runtime: AgentRuntime;
  /** Cache for generated asset packs. */
  assetCache?: AssetCache;
  /** Invoked when a hook event POST arrives. */
  onHookEvent?: (providerId: string, event: Record<string, unknown>) => void;
  /** Invoked when client toggles hooks enabled. Standalone updates settings.json here. */
  onSetHooksEnabled?: SetHooksEnabledSideEffect;
  /** Invoked when an external asset directory is added/removed. Standalone reloads + re-broadcasts assets here. */
  onReloadAssets?: ReloadAssetsSideEffect;
}

/** Result of createHttpServer(). */
export interface HttpServerHandle {
  app: FastifyInstance;
  port: number;
}

const startTime = Date.now();

/**
 * Create a Fastify server with hook endpoint, health check, and WebSocket support.
 */
export async function createHttpServer(options: HttpServerOptions): Promise<HttpServerHandle> {
  const app = Fastify({
    logger: !options.embedded,
    bodyLimit: MAX_HOOK_BODY_SIZE,
  });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebsocket);

  // Static SPA serving (standalone mode only)
  if (!options.embedded && options.staticDir) {
    await app.register(fastifyStatic, {
      root: options.staticDir,
      prefix: '/',
    });
    app.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html');
    });
  }

  // ── Routes ──────────────────────────────────────────────────

  aiAgentRuntime.setBroadcaster((event) => {
    options.store.broadcast(event);
  });

  registerHealthRoute(app);
  registerHookRoute(app, options);
  registerAiRoutes(app);
  registerWebSocketRoute(app, options);

  // ── Listen ──────────────────────────────────────────────────

  await app.listen({ host: options.host ?? '127.0.0.1', port: options.port ?? 0 });
  const address = app.server.address();
  const port = typeof address === 'object' ? (address?.port ?? 0) : 0;

  return { app, port };
}

// ── Health ──────────────────────────────────────────────────────

function registerHealthRoute(app: FastifyInstance): void {
  app.get('/api/health', async () => {
    let firebaseConfigured = false;
    try {
      firebaseConfigured = initFirebaseAdmin();
    } catch {
      firebaseConfigured = false;
    }

    return {
      status: 'ok',
      service: 'INDRA AI OFFICE',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      pid: process.pid,
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      firebaseConfigured,
      applicationAgents: getAllApplicationAgents().map((a) => a.id),
    };
  });
}

// ── Application AI Agents ───────────────────────────────────────

function registerAiRoutes(app: FastifyInstance): void {
  // GET /api/ai/agents - list application agents
  app.get('/api/ai/agents', async () => ({
    agents: getAllApplicationAgents().map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      avatar: a.avatar,
      description: a.description,
      characterId: a.characterId,
      palette: a.palette,
      defaultWorkLocation: a.defaultWorkLocation,
      capabilities: a.capabilities,
    })),
  }));

  // GET /api/ai/tasks - list user tasks
  app.get('/api/ai/tasks', async (request, reply) => {
    let userId: string;
    try {
      userId = await extractAndVerifyUserId(request.raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(msg === 'SERVICE_UNAVAILABLE' ? 503 : 401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      const tasks = await aiAgentRuntime.getRepository().listTasks(userId);
      return { tasks };
    } catch {
      reply.status(500).send({ error: 'Failed to retrieve tasks.' });
    }
  });

  // GET /api/ai/tasks/:taskId - get single user task
  app.get<{
    Params: { taskId: string };
  }>('/api/ai/tasks/:taskId', async (request, reply) => {
    let userId: string;
    try {
      userId = await extractAndVerifyUserId(request.raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(msg === 'SERVICE_UNAVAILABLE' ? 503 : 401).send({ error: 'Unauthorized' });
      return;
    }

    const { taskId } = request.params;
    const task = await aiAgentRuntime.getRepository().getTask(userId, taskId);
    if (!task || (task.userId && task.userId !== userId)) {
      reply.status(404).send({ error: `Task "${taskId}" not found.` });
      return;
    }
    reply.send({ task });
  });

  // GET /api/ai/tasks/:taskId/children - get child tasks
  app.get<{
    Params: { taskId: string };
  }>('/api/ai/tasks/:taskId/children', async (request, reply) => {
    let userId: string;
    try {
      userId = await extractAndVerifyUserId(request.raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(msg === 'SERVICE_UNAVAILABLE' ? 503 : 401).send({ error: 'Unauthorized' });
      return;
    }

    const { taskId } = request.params;
    const parent = await aiAgentRuntime.getRepository().getTask(userId, taskId);
    if (!parent) {
      reply.status(404).send({ error: `Parent task "${taskId}" not found.` });
      return;
    }

    const children = await aiAgentRuntime.getRepository().getChildTasks(userId, taskId);
    reply.send({ children });
  });

  // POST /api/ai/tasks - create task
  app.post<{
    Body: {
      agentId?: string;
      title?: string;
      description?: string;
      parentTaskId?: string | null;
    };
  }>('/api/ai/tasks', async (request, reply) => {
    let userId: string;
    try {
      userId = await extractAndVerifyUserId(request.raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(msg === 'SERVICE_UNAVAILABLE' ? 503 : 401).send({ error: 'Unauthorized' });
      return;
    }

    const { agentId, title, description, parentTaskId } = request.body || {};

    if (!agentId) {
      reply.status(400).send({ error: 'Missing "agentId" field.' });
      return;
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      reply.status(400).send({ error: 'Missing or empty "title" field.' });
      return;
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      reply.status(400).send({ error: 'Missing or empty "description" field.' });
      return;
    }

    if (parentTaskId) {
      const parentTask = await aiAgentRuntime.getRepository().getTask(userId, parentTaskId);
      if (!parentTask) {
        reply.status(404).send({ error: 'Parent task not found.' });
        return;
      }
    }

    try {
      const idempotencyKey =
        (request.headers['idempotency-key'] as string | undefined) ||
        (request.headers['x-idempotency-key'] as string | undefined);

      const task = aiAgentRuntime.createTask(agentId, title, description, {
        userId,
        parentTaskId: parentTaskId || null,
        idempotencyKey,
      });
      reply.status(201).send({
        taskId: task.id,
        status: task.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reply.status(400).send({ error: message });
    }
  });

  // POST /api/ai/chat - live chat
  app.post<{
    Body: {
      agentId?: string;
      message?: string;
    };
  }>('/api/ai/chat', async (request, reply) => {
    try {
      await extractAndVerifyUserId(request.raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(msg === 'SERVICE_UNAVAILABLE' ? 503 : 401).send({ error: 'Unauthorized' });
      return;
    }

    const { agentId, message } = request.body || {};
    if (!agentId || !message) {
      reply.status(400).send({ error: 'Missing agentId or message.' });
      return;
    }
    try {
      const text = await aiAgentRuntime.chatWithAgent(agentId, message);
      reply.send({ text });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      reply.status(500).send({ error: errMsg.includes('quota') ? 'Quota exceeded' : 'Chat failed' });
    }
  });
}

// ── Hook Events ────────────────────────────────────────────────

function registerHookRoute(app: FastifyInstance, options: HttpServerOptions): void {
  app.post<{
    Params: { providerId: string };
    Body: Record<string, unknown>;
  }>(
    `${HOOK_API_PREFIX}/:providerId`,
    {
      preHandler: bearerAuth(options.token),
      schema: {
        params: {
          type: 'object',
          properties: {
            providerId: { type: 'string', pattern: '^[a-z0-9-]+$' },
          },
          required: ['providerId'],
        },
      },
    },
    async (request, reply) => {
      const { providerId } = request.params;
      const event = request.body;

      if (event.session_id && event.hook_event_name) {
        options.onHookEvent?.(providerId, event);
      }

      reply.send('ok');
    },
  );
}

// ── WebSocket ──────────────────────────────────────────────────

function registerWebSocketRoute(app: FastifyInstance, options: HttpServerOptions): void {
  app.get('/ws', { websocket: true }, (socket, request) => {
    if (options.embedded) {
      if (!timingSafeStringEqual(request.headers.authorization ?? '', `Bearer ${options.token}`)) {
        socket.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized');
        return;
      }
    } else if (!isAllowedWebSocketOrigin(request.headers.origin, request.headers.host)) {
      socket.close(WS_CLOSE_FORBIDDEN_ORIGIN, 'forbidden origin');
      return;
    }

    const privileged = options.embedded || standaloneTokenValid(request.raw?.url || request.url, options.token);

    let socketUserId: string | null = null;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      void verifyFirebaseIdToken(token)
        .then((res) => {
          socketUserId = res.uid;
        })
        .catch(() => {});
    }

    const { store } = options;

    const onAgentAdded = (id: number, agent: AgentState) => {
      safeSend(socket, {
        type: 'agentCreated',
        agentId: id,
        characterId: agent.characterId,
      });
    };

    const onAgentRemoved = (id: number) => {
      safeSend(socket, {
        type: 'agentRemoved',
        agentId: id,
      });
    };

    const onBroadcast = (event: Record<string, unknown>) => {
      // User Isolation for AI events
      if (typeof event.type === 'string' && event.type.startsWith('aiAgent.')) {
        const eventUserId = event.userId as string | undefined;
        if (socketUserId && eventUserId && socketUserId !== eventUserId) {
          return; // Do not leak other user's events
        }
      }
      safeSend(socket, event);
    };

    store.on('agentAdded', onAgentAdded);
    store.on('agentRemoved', onAgentRemoved);
    store.on('broadcast', onBroadcast);

    socket.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (!options.embedded && msg.type) {
          console.log('[Pixel Agents] WS client message:', msg.type);
        }
        handleClientMessage(msg, (m) => safeSend(socket, m), {
          store,
          runtime: options.runtime,
          cache: options.assetCache ?? null,
          onSetHooksEnabled: options.onSetHooksEnabled,
          onReloadAssets: options.onReloadAssets,
          privileged,
        });
      } catch {
        // Malformed JSON, ignore
      }
    });

    socket.on('close', () => {
      store.off('agentAdded', onAgentAdded);
      store.off('agentRemoved', onAgentRemoved);
      store.off('broadcast', onBroadcast);
    });
  });
}

export function isAllowedWebSocketOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (!host) return true;
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;
    if (originHost === host) return true;

    const isLoopback = (h: string) => {
      const hostname = h.split(':')[0];
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    };

    if (isLoopback(originHost) && isLoopback(host)) {
      const originPort = originUrl.port || (originUrl.protocol === 'https:' ? '443' : '80');
      const hostPort = host.includes(':') ? host.split(':')[1] : '80';
      return originPort === hostPort;
    }
    return false;
  } catch {
    return false;
  }
}

function standaloneTokenValid(url: string | undefined, expected: string): boolean {
  if (!expected) return false;
  let provided: string;
  try {
    provided = new URL(url ?? '', 'http://localhost').searchParams.get('token') ?? '';
  } catch {
    return false;
  }
  return timingSafeStringEqual(provided, expected);
}

function timingSafeStringEqual(actual: string, expected: string): boolean {
  const actualBuf = Buffer.from(actual);
  const expectedBuf = Buffer.from(expected);
  return actualBuf.length === expectedBuf.length && crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function bearerAuth(expectedToken: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!timingSafeStringEqual(request.headers.authorization ?? '', `Bearer ${expectedToken}`)) {
      reply.code(401).send('unauthorized');
    }
  };
}

function safeSend(
  socket: { send: (data: string) => void; readyState: number },
  message: Record<string, unknown>,
): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}
