import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { FolderOrder, Session, StorageAdapter } from './adapter.js';

export class FilesystemAdapter implements StorageAdapter {
	private readonly basePath: string;

	constructor(basePath: string) {
		this.basePath = resolve(basePath);
	}

	private orderPath(folderId: string): string {
		return join(this.basePath, 'folder-order', `${sanitizeId(folderId)}.json`);
	}

	private sessionPath(userId: string): string {
		return join(this.basePath, 'auth-sessions', `${sanitizeId(userId)}.json`);
	}

	async readOrder(folderId: string): Promise<FolderOrder | null> {
		return readJsonOrNull<FolderOrder>(this.orderPath(folderId));
	}

	async writeOrder(folderId: string, data: FolderOrder): Promise<void> {
		await writeJsonAtomic(this.orderPath(folderId), data);
	}

	async getSession(userId: string): Promise<Session | null> {
		return readJsonOrNull<Session>(this.sessionPath(userId));
	}

	async saveSession(session: Session): Promise<void> {
		await writeJsonAtomic(this.sessionPath(session.userId), session);
	}

	async deleteSession(userId: string): Promise<void> {
		try {
			await unlink(this.sessionPath(userId));
		} catch (err) {
			if (!isNotFound(err)) throw err;
		}
	}
}

function sanitizeId(id: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(id)) {
		throw new Error(`Invalid id (must match /^[A-Za-z0-9_-]+$/): ${id}`);
	}
	return id;
}

async function readJsonOrNull<T>(path: string): Promise<T | null> {
	try {
		const content = await readFile(path, 'utf-8');
		return JSON.parse(content) as T;
	} catch (err) {
		if (isNotFound(err)) return null;
		throw err;
	}
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmp, JSON.stringify(data, null, 2));
	const { rename } = await import('node:fs/promises');
	await rename(tmp, path);
}

function isNotFound(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: string }).code === 'ENOENT'
	);
}
