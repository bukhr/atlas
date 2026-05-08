import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const BUCKET = process.env.S3_BUCKET!;
const SESSION_PREFIX = 'auth/sessions';
const INACTIVITY_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Session {
  userId: string;
  email: string;
  name: string;
  picture: string;
  refreshToken: string;
  createdAt: string;
  lastUsedAt: string;
}

function sessionKey(userId: string): string {
  return `${SESSION_PREFIX}/${userId}.json`;
}

export async function getSession(userId: string): Promise<Session | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: sessionKey(userId) })
    );
    const body = await result.Body!.transformToString();
    return JSON.parse(body) as Session;
  } catch (err: any) {
    if (err.name === 'NoSuchKey') return null;
    throw err;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: sessionKey(session.userId),
      ContentType: 'application/json',
      Body: JSON.stringify(session),
    })
  );
}

export async function deleteSession(userId: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: sessionKey(userId) })
  );
}

/**
 * Reads the session, checks inactivity timeout, and updates lastUsedAt.
 * Returns null if the session doesn't exist or has been inactive too long.
 */
export async function touchSession(userId: string): Promise<Session | null> {
  const session = await getSession(userId);
  if (!session) return null;

  const idleTime = Date.now() - new Date(session.lastUsedAt).getTime();
  if (idleTime > INACTIVITY_TIMEOUT_MS) {
    await deleteSession(userId);
    return null;
  }

  session.lastUsedAt = new Date().toISOString();
  await saveSession(session);
  return session;
}
