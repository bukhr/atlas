# AWS Serverless Deployment (Reference)

This directory documents an alternative way to deploy Atlas: as a **fully serverless stack** on AWS — S3 + CloudFront for the frontend, API Gateway + Lambda for the API, Secrets Manager for credentials, Route 53 for DNS.

The recommended deployment for most users is the [Docker container](../docker.md). This serverless variant is preserved as a reference for users who want a managed AWS deployment with no servers to operate.

> **Note:** the main codebase (server in `server/`) was unified to a Node container. The `lambda-reference/` snapshot here is the previous Lambda variant of the API. To use serverless, you can either deploy `lambda-reference/` as-is or repackage `server/` for Lambda — the API contract is identical.

## What's in this folder

| File | Purpose |
|---|---|
| `cloudformation.yaml` | SAM/CloudFormation template that provisions the entire stack |
| `lambda-reference/` | Snapshot of the Lambda handler used to handle `/api/*` routes (uses S3 for storage, Secrets Manager for credentials, AWS SDK directly) |
| `github-actions-example.yml` | Example CI/CD pipeline that builds and pushes frontend, lambda, and the optional browser extension |

## Architecture

```
                          ┌──────────────┐
                          │  Route 53    │
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │  CloudFront  │
                          └─┬──────────┬─┘
                            │          │
                  /api/*    │          │   /*  +  /data/*
                            │          │
                  ┌─────────▼─────┐  ┌─▼─────────────┐
                  │ API Gateway   │  │  S3 Bucket    │
                  └─────┬─────────┘  │  - frontend/  │
                        │            │  - data/      │
                  ┌─────▼─────┐      │  - auth/      │
                  │  Lambda   │      └───────────────┘
                  │  (Node)   │             ▲
                  └─────┬─────┘             │ read/write
                        │                   │ folder-order
                        ├───────────────────┘
                        │
                  ┌─────▼─────────────┐
                  │ Secrets Manager   │
                  │  - GOOGLE_CLIENT_ │
                  │    ID / SECRET    │
                  │  - JWT_SECRET     │
                  └───────────────────┘
```

## Prerequisites

1. AWS account with permissions to create CloudFormation stacks
2. Hosted zone in Route 53 for your domain
3. ACM certificate for your domain in `us-east-1` (CloudFront requirement)
4. Google Cloud OAuth client (Web app) authorizing your domain as origin/redirect
5. Two S3 buckets created out-of-band:
   - One for frontend/data assets (e.g. `atlas-prod`)
   - One for Lambda zip artifacts (e.g. `atlas-lambda-artifacts-prod`)
6. A Secrets Manager secret (e.g. `prod/global`) containing JSON with these keys:
   ```json
   {
     "ATLAS/GOOGLE_CLIENT_ID": "...",
     "ATLAS/GOOGLE_CLIENT_SECRET": "...",
     "ATLAS/JWT_SECRET": "..."
   }
   ```

## Deploy

```bash
# 1. Create the CloudFormation stack
aws cloudformation deploy \
  --template-file docs/deployment/aws/cloudformation.yaml \
  --stack-name atlas-prod \
  --parameter-overrides \
    DomainName=atlas.example.com \
    HostedZoneId=Z123456ABCDEF \
    CertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/abc-... \
    BucketName=atlas-prod \
  --capabilities CAPABILITY_NAMED_IAM

# 2. Package and upload the Lambda
cd docs/deployment/aws/lambda-reference
npm ci
npm run package
aws s3 cp latest.zip s3://atlas-lambda-artifacts-prod/folder-order/latest.zip
aws lambda update-function-code \
  --function-name atlas-folder-order-prod \
  --s3-bucket atlas-lambda-artifacts-prod \
  --s3-key folder-order/latest.zip

# 3. Build and upload the frontend (from repo root)
npm ci
npm run build
aws s3 sync build/ s3://atlas-prod/ --delete --exclude "data/*" --exclude "auth/*"

# 4. Invalidate CloudFront
DIST_ID=$(aws cloudformation describe-stacks --stack-name atlas-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' --output text)
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

## CI/CD

`github-actions-example.yml` is the workflow used by the original Atlas deployment. It assumes:
- A Lambda function named `atlas-folder-order-prod`
- S3 buckets for frontend and Lambda artifacts
- Secrets in GitHub Actions: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, plus the `VITE_*` build-time vars and (optionally) `AMO_JWT_*` for signing the Firefox extension

To use it:
1. Replace the placeholders in the `env:` block at the top
2. Move the file to `.github/workflows/deploy.yml`

## Why this is no longer the default

The serverless stack works well at scale but adds operational complexity:
- Cold starts on Lambda
- CloudFront cache invalidations to coordinate with deploys
- Secrets Manager reads on every cold start (mitigated by caching, but still)
- Multiple AWS accounts/regions to track for ACM cert, Route 53, etc.

The Docker container alternative removes all of this for self-hosted use.

## Note on storage adapter

The `server/storage/s3.ts` adapter in the main codebase can also talk to S3 — so a "hybrid" deployment is possible: run the Atlas container behind ALB or Cloud Run, set `STORAGE_DRIVER=s3 S3_BUCKET=...`, and you get S3-backed storage without needing Lambda.
