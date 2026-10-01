import type { IncomingMessage, ServerResponse } from 'http';

import { aiAgentRuntime } from '../../server/src/ai/aiAgentRuntime.js';
import { extractAndVerifyUserId, sendSafeError } from '../../server/src/ai/apiHelpers.js';

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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  let userId: string;
  try {
    userId = await extractAndVerifyUserId(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'SERVICE_UNAVAILABLE') {
      sendSafeError(res, 503, 'Authentication service unavailable');
    } else {
      sendSafeError(res, 401, 'Unauthorized');
    }
    return;
  }

  if (req.method === 'GET') {
    try {
      const userTasks = await aiAgentRuntime.getRepository().listTasks(userId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tasks: userTasks }));
    } catch {
      sendSafeError(res, 500, 'Failed to retrieve tasks');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        agentId?: string;
        title?: string;
        description?: string;
        parentTaskId?: string | null;
      }>(req);

      if (!body.agentId || !body.title || !body.description) {
        sendSafeError(res, 400, 'Missing agentId, title, or description');
        return;
      }

      // If parentTaskId is supplied, verify ownership of parent task
      if (body.parentTaskId) {
        const parentTask = await aiAgentRuntime.getRepository().getTask(userId, body.parentTaskId);
        if (!parentTask) {
          sendSafeError(res, 404, 'Parent task not found');
          return;
        }
      }

      const task = aiAgentRuntime.createTask(body.agentId, body.title, body.description, {
        userId,
        parentTaskId: body.parentTaskId || null,
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ taskId: task.id, status: task.status }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendSafeError(res, 400, msg);
    }
    return;
  }

  sendSafeError(res, 405, 'Method not allowed');
}
