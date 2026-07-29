import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

export async function createSession(data = {}) {
  const id = randomUUID();
  const dir = await mkdtemp(path.join(tmpdir(), 'l4d2spray-'));
  sessions.set(id, { id, dir, createdAt: Date.now(), ...data });
  return sessions.get(id);
}

export function getSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    destroySession(id);
    return null;
  }
  return session;
}

export function destroySession(id) {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  rm(session.dir, { recursive: true, force: true }).catch(() => {});
}

/** Elimina sesiones vencidas. Se llama periodicamente desde server.js */
export function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) destroySession(id);
  }
}

export function destroyAllSessions() {
  for (const id of [...sessions.keys()]) destroySession(id);
}
