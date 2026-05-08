import { config } from '../config.js';
import type { StorageAdapter } from './adapter.js';
import { FilesystemAdapter } from './filesystem.js';
import { S3Adapter } from './s3.js';

let cached: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
	if (cached) return cached;

	switch (config.storageDriver) {
		case 'filesystem':
			cached = new FilesystemAdapter(config.storagePath);
			return cached;
		case 's3': {
			const bucket = config.s3Bucket;
			if (!bucket) {
				throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET to be set.');
			}
			cached = new S3Adapter({
				bucket,
				region: config.s3Region,
				cloudfrontDistributionId: config.cloudfrontDistributionId,
			});
			return cached;
		}
	}
}

export function resetStorage(): void {
	cached = null;
}
