---
status: closed
depends_on: [309]
---

# Task 321 — Cloudflare Worker Scaffold and Package Boundary

## Context

Task 308 designed a Cloudflare-backed Site materialization. The Cloudflare Worker is the entrypoint for Cycle execution and operator requests. It needs a dedicated package with a clear boundary.

## Goal

Create the Cloudflare Worker package structure. The package must compile, have a clean boundary, and be ready to receive DO bindings, Cycle logic, and R2 adapters in later tasks.

## Required Work

### 1. Create the package

Create `packages/sites/cloudflare/` (or an equivalent path) containing:

- `package.json` — minimal deps, build scripts
- `tsconfig.json` — TypeScript config targeting Worker runtime
- `src/index.ts` — Worker fetch handler entrypoint
- `src/cycle-entrypoint.ts` — Cycle invocation handler (stub)
- `README.md` — package boundary and ownership

### 2. Define the Worker fetch handler

The handler must route:

- `POST /cycle` — trigger one bounded Cycle (called by Cron Trigger or operator)
- `GET /status` — operator status endpoint (stub for Task 327)
- All other routes → `404`

### 3. Document the package boundary

Explain:
- What this package owns (Worker entrypoint, routing, request parsing)
- What it does NOT own (DO implementation → Task 322; Cycle logic → Task 325; R2 adapter → Task 323)
- How it binds to Cloudflare-specific globals (`env`, `ctx`)

## Non-Goals

- Do not implement Durable Object logic.
- Do not implement Cycle execution logic.
- Do not implement R2 reads/writes.
- Do not add Wrangler.toml or deployment config.
- Do not create a generic "sites" abstraction that works for non-Cloudflare providers.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Package exists at a consistent path.
- [x] `pnpm build` (or equivalent) compiles the Worker TypeScript.
- [x] Fetch handler routes `/cycle` and `/status` correctly.
- [x] README documents ownership and non-ownership boundaries.
- [x] No implementation code for DO, Cycle, or R2 is added.

## Suggested Verification

```bash
pnpm --filter <worker-package> typecheck
```

No tests required for scaffolding; manual inspection of package structure and build output is sufficient.

## Execution Notes

Task completed prior to Task 474 closure invariant. The `packages/sites/cloudflare/` package was created with `package.json`, `tsconfig.json`, `src/index.ts` (fetch handler), `src/cycle-entrypoint.ts`, and `README.md`. The fetch handler routes `/cycle` and `/status` correctly. No DO, Cycle, or R2 implementation code was added.

## Verification

Verified by inspecting `packages/sites/cloudflare/src/index.ts` and `packages/sites/cloudflare/README.md`. Package compiles with `pnpm --filter @narada2/cloudflare-site build`.
