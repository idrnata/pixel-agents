import type { IncomingMessage, ServerResponse } from 'http';

import {
  aiAgentRuntime,
  APPLICATION_AGENTS,
  getAllApplicationAgents,
} from '../../../server/src/ai/index.js';

function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

// In-memory persistent state for cloud web app
const inMemoryOfficeState = {
  customLayout: null as unknown,
};

// SSE subscribers for environments where /ws is not available
const sseClients = new Set<ServerResponse>();

// Connect aiAgentRuntime broadcast to SSE clients
aiAgentRuntime.setBroadcaster((event) => {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
});

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  // ── GET /api/health ───────────────────────────────────────────
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'INDRA AI OFFICE',
      version: '2.0.0',
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      applicationAgents: Object.keys(APPLICATION_AGENTS).length,
      timestamp: Date.now(),
    });
    return true;
  }

  // ── GET /api/ai/agents ────────────────────────────────────────
  if (pathname === '/api/ai/agents' && req.method === 'GET') {
    sendJson(res, 200, {
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
    });
    return true;
  }

  // ── GET /api/ai/tasks ─────────────────────────────────────────
  if (pathname === '/api/ai/tasks' && req.method === 'GET') {
    sendJson(res, 200, {
      tasks: aiAgentRuntime.getTasks(),
    });
    return true;
  }

  // ── POST /api/ai/tasks ────────────────────────────────────────
  if (pathname === '/api/ai/tasks' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        agentId?: string;
        title?: string;
        description?: string;
      }>(req);

      if (!body.agentId) {
        sendJson(res, 400, { error: 'Missing "agentId" field.' });
        return true;
      }
      if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        sendJson(res, 400, { error: 'Missing or empty "title" field.' });
        return true;
      }
      if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
        sendJson(res, 400, { error: 'Missing or empty "description" field.' });
        return true;
      }

      const task = aiAgentRuntime.createTask(body.agentId, body.title, body.description);
      sendJson(res, 201, {
        taskId: task.id,
        status: task.status,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { error: message });
      return true;
    }
  }

  // ── POST /api/ai/chat ─────────────────────────────────────────
  if (pathname === '/api/ai/chat' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        agentId?: string;
        message?: string;
      }>(req);

      if (!body.agentId || !body.message) {
        sendJson(res, 400, { error: 'Missing "agentId" or "message" field.' });
        return true;
      }

      const text = await aiAgentRuntime.chatWithAgent(body.agentId, body.message);
      sendJson(res, 200, { text });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
      return true;
    }
  }

  // ── GET /api/ai/events (SSE Stream) ───────────────────────────
  if (pathname === '/api/ai/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':\n\n'); // SSE comment to open stream
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return true;
  }

  // ── GET /api/office & POST /api/office ────────────────────────
  if (pathname === '/api/office') {
    if (req.method === 'GET') {
      sendJson(res, 200, { layout: inMemoryOfficeState.customLayout });
      return true;
    }
    if (req.method === 'POST') {
      const body = await parseJsonBody<{ layout: unknown }>(req);
      inMemoryOfficeState.customLayout = body.layout;
      sendJson(res, 200, { success: true });
      return true;
    }
  }

  return false;
}
