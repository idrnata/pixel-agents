import type { IncomingMessage, ServerResponse } from 'http';

import { aiAgentRuntime } from '../../server/src/ai/aiAgentRuntime.js';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tasks: aiAgentRuntime.getTasks() }));
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        agentId?: string;
        title?: string;
        description?: string;
      }>(req);

      if (!body.agentId || !body.title || !body.description) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing agentId, title, or description' }));
        return;
      }

      const task = aiAgentRuntime.createTask(body.agentId, body.title, body.description);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ taskId: task.id, status: task.status }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}
