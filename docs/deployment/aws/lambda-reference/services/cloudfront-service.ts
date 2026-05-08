import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';

const cf = new CloudFrontClient({});
const DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID!;

export async function invalidateCache(folderId: string): Promise<void> {
  await cf.send(
    new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `folder-order-${folderId}-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: [`/data/folder-order/${folderId}.json`],
        },
      },
    })
  );
}
