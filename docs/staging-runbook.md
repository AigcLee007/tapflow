# Staging Runbook

## Start Staging Services

```bash
docker compose -f docker-compose.staging.yml up -d --build tapflow-redis tapflow-api tapflow-worker tapflow-frontend
```

The compose file runs Redis inside the Docker network. Do not publish Redis to the public internet.

Default staging Redis URL:

```env
REDIS_URL=redis://tapflow-redis:6379
```

External Redis is still supported by overriding `REDIS_URL`.

## Required Queue Concurrency

Use these defaults unless intentionally load testing:

```env
WORKER_CONCURRENCY=16
NODE_EXECUTE_CONCURRENCY=16
PROVIDER_POLL_CONCURRENCY=16
```

Confirm in worker logs after deploy.

## Concurrent Generation Smoke

Create a temporary flow and run three target-node image generations:

```bash
TAPFLOW_API_BASE_URL=https://art.aittco.com \
TAPFLOW_ACCESS_TOKEN=<token> \
TAPFLOW_TENANT_ID=<tenant-id> \
npm run smoke:concurrent-runs -- --count 3 --prompt "staging concurrent smoke"
```

Use an existing flow:

```bash
npm run smoke:concurrent-runs -- --flow-id <flow-id> --count 3 --timeout-ms 180000
```

Warnings are emitted when create-run latency exceeds 2 seconds or provider start spread exceeds 5 seconds.

## Cleanup Stuck Runs

Dry-run first:

```bash
npm run cleanup:stuck-runs -- --tenant-id <tenant-id> --after 2026-05-22T17:00:00Z --before 2026-05-22T17:30:00Z --reason "Upstash Redis quota exceeded during staging test"
```

Apply:

```bash
npm run cleanup:stuck-runs -- --tenant-id <tenant-id> --after 2026-05-22T17:00:00Z --before 2026-05-22T17:30:00Z --reason "Upstash Redis quota exceeded during staging test" --apply
```

The cleanup only marks clearly orphaned `pending` workflow runs and `runnable` node runs that never started. It does not touch succeeded, running, failed, or waiting-provider runs.

## Notes

- Target-node runs must not use `flows FOR UPDATE`.
- Target-node snapshots should reuse `flow_id + checksum` and recover from `23505` conflicts.
- Provider calls must run outside long DB transactions.
- Draft patching remains target-node-only after provider success.
