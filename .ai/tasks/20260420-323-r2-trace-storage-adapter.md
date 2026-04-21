---
status: closed
depends_on: [309, 321]
---

# Task 323 — R2 Trace/Evidence Storage Adapter

## Context

Task 308 designated R2 as the storage for large Trace artifacts: message payloads, sync snapshots, evaluation dumps, and backup manifests. This task implements the adapter that reads and writes these artifacts.

## Goal

Create an R2 adapter with clear path conventions, read/write/delete methods, and Site-scoped object naming.

## Required Work

### 1. Define path conventions

Objects are stored under Site-scoped prefixes:

```text
{site_id}/messages/{message_id}/record.json
{site_id}/snapshots/{snapshot_id}.json
{site_id}/traces/{cycle_id}/evaluation-{evaluation_id}.json
{site_id}/traces/{cycle_id}/decision-{decision_id}.json
{site_id}/backups/{timestamp}.tar.gz
```

### 2. Implement adapter methods

- `writeObject(key: string, body: ReadableStream | ArrayBuffer | string, metadata?: Record<string, string>): Promise<void>`
- `readObject(key: string): Promise<{ body: ReadableStream; metadata: Record<string, string> } | null>`
- `deleteObject(key: string): Promise<void>`
- `listObjects(prefix: string): Promise<string[]>`

### 3. Handle large artifact streaming

- Write must support streaming bodies without buffering entirely in memory.
- Read must return a stream that the consumer can pipe.

### 4. Document failure modes

- R2 unavailable → retry with exponential backoff, then fail the Cycle and record the failure in DO health.
- Key collision → deterministic key generation prevents this; document the key format.

## Non-Goals

- Do not implement encryption at rest (deferred to v1).
- Do not implement multi-region replication.
- Do not implement lifecycle policies (e.g., auto-delete old backups).
- Do not create generic object-store abstraction for S3/GCS.
- Do not create derivative task-status files.

## Acceptance Criteria

- [ ] Adapter compiles and exports correctly.
- [ ] Path conventions are documented and enforced.
- [ ] Write/read/delete round-trip works in tests.
- [ ] Streaming write does not buffer large bodies in memory.
- [ ] List returns correct keys for a given prefix.

## Suggested Verification

```bash
pnpm --filter <worker-package> typecheck
pnpm test:focused "pnpm --filter <worker-package> exec vitest run test/unit/r2-adapter.test.ts"
```

Mock R2 using `miniflare` or an in-memory R2 substitute for unit tests.
