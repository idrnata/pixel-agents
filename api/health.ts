import type { IncomingMessage, ServerResponse } from 'http';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(
    JSON.stringify({
      status: 'ok',
      service: 'INDRA AI OFFICE',
      environment: 'vercel',
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      timestamp: Date.now(),
    }),
  );
}
