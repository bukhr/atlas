import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const BUCKET = process.env.S3_BUCKET!;

function orderKey(folderId: string): string {
  return `data/folder-order/${folderId}.json`;
}

interface FolderOrder {
  order: string[];
  updatedAt: string;
  updatedBy?: string;
}

export async function readOrder(folderId: string): Promise<FolderOrder | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: orderKey(folderId) })
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as FolderOrder;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'NoSuchKey') return null;
    throw err;
  }
}

export async function writeOrder(
  folderId: string,
  order: string[],
  userEmail?: string
): Promise<void> {
  const data: FolderOrder = {
    order,
    updatedAt: new Date().toISOString(),
    ...(userEmail && { updatedBy: userEmail }),
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: orderKey(folderId),
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    })
  );
}
