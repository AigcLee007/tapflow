# TapFlow Staging Environment Template

Use this with `docker-compose.staging.yml`.

```env
NODE_ENV=production
PORT=3366

DATABASE_URL=postgres://...

REDIS_URL=redis://tapflow-redis:6379
QUEUE_PREFIX=aigc-flow:staging
WORKER_CONCURRENCY=16
NODE_EXECUTE_CONCURRENCY=16
PROVIDER_POLL_CONCURRENCY=16

CREDENTIAL_MASTER_KEY=<base64-secret>
CREDENTIAL_KEY_VERSION=v1
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>

S3_ENDPOINT=<endpoint>
S3_REGION=<region>
S3_BUCKET=<bucket>
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
S3_FORCE_PATH_STYLE=false
```

BullMQ is command-heavy. Do not run staging generation workloads on low-quota request-limited Redis plans such as Upstash free/low caps. Use local Docker Redis for staging tests, and use Tair/Redis Cloud/self-hosted HA Redis or another high-QPS Redis service for production.
