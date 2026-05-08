import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

// Cache: all keys from the global secret, loaded once per cold start
let cachedSecrets: Record<string, string> | null = null;

async function loadSecrets(): Promise<Record<string, string>> {
  if (cachedSecrets) return cachedSecrets;

  const secretName = process.env.SECRETS_NAME;
  if (!secretName) throw new Error('SECRETS_NAME not configured');

  const result = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );

  cachedSecrets = JSON.parse(result.SecretString!);
  return cachedSecrets;
}

export async function getGoogleCredentials(): Promise<GoogleCredentials> {
  const secrets = await loadSecrets();

  const prefix = process.env.SECRETS_PREFIX ?? 'ATLAS';
  const clientId = secrets[`${prefix}/GOOGLE_CLIENT_ID`];
  const clientSecret = secrets[`${prefix}/GOOGLE_CLIENT_SECRET`];

  if (!clientId || !clientSecret) {
    throw new Error(`Missing ${prefix}/GOOGLE_CLIENT_ID or ${prefix}/GOOGLE_CLIENT_SECRET in secrets`);
  }

  return { clientId, clientSecret };
}

export async function getJwtSecret(): Promise<Uint8Array> {
  const secrets = await loadSecrets();

  const prefix = process.env.SECRETS_PREFIX ?? 'ATLAS';
  const secret = secrets[`${prefix}/JWT_SECRET`];

  if (!secret) {
    throw new Error(`Missing ${prefix}/JWT_SECRET in secrets`);
  }

  return new TextEncoder().encode(secret);
}
