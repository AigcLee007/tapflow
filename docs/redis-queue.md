# Redis Queue Operations

TapFlow uses BullMQ for workflow execution queues. BullMQ is Redis-intensive: every run enqueue, worker dequeue, retry, completion, and queue health check consumes Redis commands.

Do not use low-quota, request-limited Redis plans for staging or production generation tests. The previous Upstash free/low request cap caused enqueue failures and orphan pending workflow runs even though the API request had already created database rows.

## Recommended Redis

- Staging: local Docker Redis through `docker-compose.staging.yml`.
- Production: Alibaba Cloud Tair/Redis, Redis Cloud, self-hosted HA Redis, or another high-QPS Redis service.
- Avoid: low request-limit Upstash plans for BullMQ workloads.

## Staging Local Redis

`docker-compose.staging.yml` defines `tapflow-redis`:

- Image: `redis:7-alpine`
- AOF enabled with `appendonly yes`
- `appendfsync everysec`
- Volume: `tapflow-redis-data:/data`
- Healthcheck: `redis-cli ping`
- Internal URL: `redis://tapflow-redis:6379`

API and worker services still accept an external `REDIS_URL` override.

## Checks

Worker startup logs should include:

```txt
nodeExecuteConcurrency: 16
providerPollConcurrency: 16
workerConcurrency: 16
```

Redis health:

```bash
docker compose -f docker-compose.staging.yml exec tapflow-redis redis-cli ping
```

Queue depth can be checked through existing queue health endpoints or Redis/BullMQ tooling using the configured `QUEUE_PREFIX`.

## Stuck Run Cleanup

Use the cleanup script after queue outages:

```bash
npm run cleanup:stuck-runs -- --tenant-id <tenant-id> --after 2026-05-22T17:00:00Z --before 2026-05-22T17:30:00Z
```

Add `--apply` only after reviewing the dry-run summary.
