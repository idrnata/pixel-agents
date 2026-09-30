import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';

// Initialize server-side Gemini SDK
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

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
      version: '1.0.0',
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      timestamp: Date.now(),
    });
    return true;
  }

  // ── POST /api/agents/generate (Server-Side Gemini Calling) ────
  if (pathname === '/api/agents/generate' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        prompt: string;
        systemInstruction?: string;
        temperature?: number;
        jsonMode?: boolean;
      }>(req);

      if (!body.prompt) {
        sendJson(res, 400, { error: 'Missing "prompt" parameter' });
        return true;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: body.prompt,
        config: {
          systemInstruction: body.systemInstruction,
          temperature: body.temperature ?? 0.7,
          ...(body.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      });

      sendJson(res, 200, { text: response.text || '' });
      return true;
    } catch (err) {
      console.error('[API] Gemini generate error:', err);
      sendJson(res, 500, {
        error: `Gemini API invocation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return true;
    }
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
