/**
 * Environment-driven configuration for the server.
 * Read once at startup; all values are validated lazily where they are required.
 */

function readEnv(key: string): string | undefined {
	const value = process.env[key];
	if (value === undefined || value === '') return undefined;
	return value;
}

function requireEnv(key: string): string {
	const value = readEnv(key);
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

export const config = {
	get googleClientId() {
		return requireEnv('VITE_GOOGLE_CLIENT_ID');
	},
	get googleClientSecret() {
		return requireEnv('GOOGLE_CLIENT_SECRET');
	},
	get jwtSecret() {
		return requireEnv('JWT_SECRET');
	},

	get storageDriver(): 'filesystem' | 's3' {
		const raw = readEnv('STORAGE_DRIVER') ?? 'filesystem';
		if (raw !== 'filesystem' && raw !== 's3') {
			throw new Error(`Invalid STORAGE_DRIVER: ${raw}. Use 'filesystem' or 's3'.`);
		}
		return raw;
	},
	get storagePath() {
		return readEnv('STORAGE_PATH') ?? './data';
	},
	get s3Bucket() {
		return readEnv('S3_BUCKET');
	},
	get s3Region() {
		return readEnv('S3_REGION');
	},
	get cloudfrontDistributionId() {
		return readEnv('CLOUDFRONT_DISTRIBUTION_ID');
	},

	jwt: {
		issuer: 'atlas',
		expiration: '90d',
	},

	session: {
		inactivityTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
};
