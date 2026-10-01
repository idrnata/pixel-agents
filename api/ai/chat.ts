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

  if (req.method !== 'POST') {
    sendSafeError(res, 405, 'Method not allowed');
    return;
  }

  try {
    await extractAndVerifyUserId(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'SERVICE_UNAVAILABLE') {
      sendSafeError(res, 503, 'Authentication service unavailable');
    } else {
      sendSafeError(res, 401, 'Unauthorized');
    }
    return;
  }

  try {
    const body = await parseJsonBody<{ agentId?: string; message?: string }>(req);
    if (!body.agentId || !body.message) {
      sendSafeError(res, 400, 'Missing agentId or message');
      return;
    }

    const text = await aiAgentRuntime.chatWithAgent(body.agentId, body.message);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text }));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    sendSafeError(res, 500, errorMsg.includes('quota') ? 'Quota exceeded' : 'Chat execution error');
  }
}
