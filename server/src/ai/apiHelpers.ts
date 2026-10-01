import type { IncomingMessage, ServerResponse } from 'http';

import { verifyFirebaseIdToken } from '../firebase/firebaseAdmin.js';

export async function extractAndVerifyUserId(
  req: IncomingMessage | { headers: Record<string, string | string[] | undefined> },
): Promise<string> {
  const authHeader =
    'headers' in req
      ? Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization
      : undefined;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new Error('UNAUTHORIZED');
  }

  return (await verifyFirebaseIdToken(token)).uid;
}

export function sendSafeError(res: ServerResponse, statusCode: number, clientMessage: string): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: clientMessage }));
}
