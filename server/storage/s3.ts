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
import type { FolderOrder, Session, StorageAdapter } from './adapter.js';

export interface S3AdapterOptions {
	bucket: string;
	region?: string;
	cloudfrontDistributionId?: string;
}

/**
 * S3-backed storage adapter.
 *
 * Layout (rooted at the bucket):
 *   folder-order/{folderId}.json
 *   auth-sessions/{userId}.json
 *
 * If `cloudfrontDistributionId` is provided, `invalidateOrderCache` will
 * issue an invalidation for the order key after a write — useful when the
 * bucket is fronted by CloudFront and the order JSON is publicly cached.
 */
export class S3Adapter implements StorageAdapter {
	private readonly s3: S3Client;
	private readonly cloudfront: CloudFrontClient | null;
	private readonly bucket: string;
	private readonly distributionId: string | undefined;

	constructor(opts: S3AdapterOptions) {
		this.bucket = opts.bucket;
		this.distributionId = opts.cloudfrontDistributionId;
		this.s3 = new S3Client(opts.region ? { region: opts.region } : {});
		this.cloudfront = this.distributionId
			? new CloudFrontClient(opts.region ? { region: opts.region } : {})
			: null;
	}

	private orderKey(folderId: string): string {
		return `folder-order/${sanitizeId(folderId)}.json`;
	}

	private sessionKey(userId: string): string {
		return `auth-sessions/${sanitizeId(userId)}.json`;
	}

	async readOrder(folderId: string): Promise<FolderOrder | null> {
		return this.readJson<FolderOrder>(this.orderKey(folderId));
	}

	async writeOrder(folderId: string, data: FolderOrder): Promise<void> {
		await this.writeJson(this.orderKey(folderId), data);
	}

	async getSession(userId: string): Promise<Session | null> {
		return this.readJson<Session>(this.sessionKey(userId));
	}

	async saveSession(session: Session): Promise<void> {
		await this.writeJson(this.sessionKey(session.userId), session);
	}

	async deleteSession(userId: string): Promise<void> {
		await this.s3.send(
			new DeleteObjectCommand({ Bucket: this.bucket, Key: this.sessionKey(userId) })
		);
	}

	async invalidateOrderCache(folderId: string): Promise<void> {
		if (!this.cloudfront || !this.distributionId) return;
		await this.cloudfront.send(
			new CreateInvalidationCommand({
				DistributionId: this.distributionId,
				InvalidationBatch: {
					CallerReference: `folder-order-${folderId}-${Date.now()}`,
					Paths: { Quantity: 1, Items: [`/${this.orderKey(folderId)}`] },
				},
			})
		);
	}

	private async readJson<T>(key: string): Promise<T | null> {
		try {
			const res = await this.s3.send(
				new GetObjectCommand({ Bucket: this.bucket, Key: key })
			);
			const body = await res.Body?.transformToString();
			if (!body) return null;
			return JSON.parse(body) as T;
		} catch (err) {
			if (isNoSuchKey(err)) return null;
			throw err;
		}
	}

	private async writeJson(key: string, data: unknown): Promise<void> {
		await this.s3.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: JSON.stringify(data),
				ContentType: 'application/json',
			})
		);
	}
}

function sanitizeId(id: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(id)) {
		throw new Error(`Invalid id (must match /^[A-Za-z0-9_-]+$/): ${id}`);
	}
	return id;
}

function isNoSuchKey(err: unknown): boolean {
	if (typeof err !== 'object' || err === null) return false;
	const name = (err as { name?: string }).name;
	return name === 'NoSuchKey' || name === 'NotFound';
}
