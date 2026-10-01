import type { IncomingMessage, ServerResponse } from 'http';

import { getAllApplicationAgents } from '../../core/src/ai/agentDefinitions.js';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(
    JSON.stringify({
      agents: getAllApplicationAgents(),
    }),
  );
}
