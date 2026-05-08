import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilesystemAdapter } from '../storage/filesystem.js';

describe('FilesystemAdapter', () => {
	let dir: string;
	let adapter: FilesystemAdapter;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'atlas-fs-test-'));
		adapter = new FilesystemAdapter(dir);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('returns null for missing folder order', async () => {
		expect(await adapter.readOrder('nope_id')).toBeNull();
	});

	it('round-trips folder order', async () => {
		await adapter.writeOrder('folder-abc_123', {
			order: ['a', 'b', 'c'],
			updatedAt: '2026-05-07T00:00:00.000Z',
			updatedBy: 'user@example.com',
		});

		const data = await adapter.readOrder('folder-abc_123');
		expect(data?.order).toEqual(['a', 'b', 'c']);
		expect(data?.updatedBy).toBe('user@example.com');
	});

	it('returns null for missing session', async () => {
		expect(await adapter.getSession('user-1')).toBeNull();
	});

	it('round-trips and deletes a session', async () => {
		const session = {
			userId: 'user-1',
			email: 'a@b.com',
			name: 'A',
			picture: 'p',
			refreshToken: 'rt',
			createdAt: '2026-05-07T00:00:00.000Z',
			lastUsedAt: '2026-05-07T00:00:00.000Z',
		};
		await adapter.saveSession(session);
		expect(await adapter.getSession('user-1')).toEqual(session);

		await adapter.deleteSession('user-1');
		expect(await adapter.getSession('user-1')).toBeNull();
	});

	it('deleting a missing session is a no-op', async () => {
		await expect(adapter.deleteSession('ghost')).resolves.toBeUndefined();
	});

	it('rejects ids with path-traversal characters', async () => {
		await expect(adapter.readOrder('../etc/passwd')).rejects.toThrow(/Invalid id/);
		await expect(
			adapter.writeOrder('../bad', {
				order: [],
				updatedAt: '2026-05-07T00:00:00.000Z',
			})
		).rejects.toThrow(/Invalid id/);
	});
});
