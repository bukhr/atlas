import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import {
	CloudFrontClient,
	CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Adapter } from '../storage/s3.js';

function fakeBody(content: string) {
	return {
		transformToString: async () => content,
	};
}

function noSuchKeyError() {
	const err = new Error('not found');
	(err as { name?: string }).name = 'NoSuchKey';
	return err;
}

describe('S3Adapter', () => {
	let sendSpy: ReturnType<typeof vi.spyOn>;
	let cfSendSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		sendSpy = vi.spyOn(S3Client.prototype, 'send');
		cfSendSpy = vi.spyOn(CloudFrontClient.prototype, 'send');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('readOrder returns null on NoSuchKey', async () => {
		sendSpy.mockRejectedValueOnce(noSuchKeyError());
		const adapter = new S3Adapter({ bucket: 'b' });
		expect(await adapter.readOrder('folder-1')).toBeNull();
	});

	it('readOrder parses returned body', async () => {
		const data = { order: ['a', 'b'], updatedAt: '2026-05-07T00:00:00Z' };
		sendSpy.mockResolvedValueOnce({ Body: fakeBody(JSON.stringify(data)) } as never);
		const adapter = new S3Adapter({ bucket: 'b' });
		expect(await adapter.readOrder('folder-1')).toEqual(data);
	});

	it('writeOrder issues PutObject with proper key/body', async () => {
		sendSpy.mockResolvedValueOnce({} as never);
		const adapter = new S3Adapter({ bucket: 'my-bucket' });
		await adapter.writeOrder('f-1', {
			order: ['x'],
			updatedAt: '2026-05-07T00:00:00Z',
		});
		expect(sendSpy).toHaveBeenCalledOnce();
		const cmd = sendSpy.mock.calls[0][0] as PutObjectCommand;
		expect(cmd).toBeInstanceOf(PutObjectCommand);
		expect(cmd.input.Bucket).toBe('my-bucket');
		expect(cmd.input.Key).toBe('folder-order/f-1.json');
		expect(JSON.parse(cmd.input.Body as string).order).toEqual(['x']);
	});

	it('saveSession writes to auth-sessions/<id>.json', async () => {
		sendSpy.mockResolvedValueOnce({} as never);
		const adapter = new S3Adapter({ bucket: 'b' });
		await adapter.saveSession({
			userId: 'u-1',
			email: 'e',
			name: 'n',
			picture: 'p',
			refreshToken: 'rt',
			createdAt: '2026-05-07T00:00:00Z',
			lastUsedAt: '2026-05-07T00:00:00Z',
		});
		const cmd = sendSpy.mock.calls[0][0] as PutObjectCommand;
		expect(cmd.input.Key).toBe('auth-sessions/u-1.json');
	});

	it('deleteSession issues DeleteObject', async () => {
		sendSpy.mockResolvedValueOnce({} as never);
		const adapter = new S3Adapter({ bucket: 'b' });
		await adapter.deleteSession('u-1');
		const cmd = sendSpy.mock.calls[0][0] as DeleteObjectCommand;
		expect(cmd).toBeInstanceOf(DeleteObjectCommand);
		expect(cmd.input.Key).toBe('auth-sessions/u-1.json');
	});

	it('rejects invalid IDs (path traversal)', async () => {
		const adapter = new S3Adapter({ bucket: 'b' });
		await expect(adapter.readOrder('../etc/passwd')).rejects.toThrow(/Invalid id/);
	});

	it('invalidateOrderCache is no-op when no distribution configured', async () => {
		const adapter = new S3Adapter({ bucket: 'b' });
		await adapter.invalidateOrderCache?.('folder-1');
		expect(cfSendSpy).not.toHaveBeenCalled();
	});

	it('invalidateOrderCache issues CreateInvalidation when distribution configured', async () => {
		cfSendSpy.mockResolvedValueOnce({} as never);
		const adapter = new S3Adapter({
			bucket: 'b',
			cloudfrontDistributionId: 'E123',
		});
		await adapter.invalidateOrderCache?.('folder-1');
		expect(cfSendSpy).toHaveBeenCalledOnce();
		const cmd = cfSendSpy.mock.calls[0][0] as CreateInvalidationCommand;
		expect(cmd).toBeInstanceOf(CreateInvalidationCommand);
		expect(cmd.input.DistributionId).toBe('E123');
		expect(cmd.input.InvalidationBatch?.Paths?.Items).toEqual(['/folder-order/folder-1.json']);
	});
});
