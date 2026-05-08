import { config } from '../config.js';
import type { Session, StorageAdapter } from '../storage/adapter.js';

/**
 * Reads the session, checks inactivity timeout, and updates lastUsedAt.
 * Returns null if the session doesn't exist or has been inactive too long.
 */
export async function touchSession(
	storage: StorageAdapter,
	userId: string
): Promise<Session | null> {
	const session = await storage.getSession(userId);
	if (!session) return null;

	const idleTime = Date.now() - new Date(session.lastUsedAt).getTime();
	if (idleTime > config.session.inactivityTimeoutMs) {
		await storage.deleteSession(userId);
		return null;
	}

	session.lastUsedAt = new Date().toISOString();
	await storage.saveSession(session);
	return session;
}
