# @narada2/cloudflare-site

Cloudflare Worker entrypoint for Narada Site materialization and bounded Cycle execution.

## What This Package Owns

- **Worker fetch handler** (`src/index.ts`) — request routing, parsing, and response formatting.
- **Route definitions** — `POST /cycle`, `GET /status`, and 404 fallthrough.
- **Request validation** — lightweight validation of Cycle invocation payloads before handing off.
- **Cycle entrypoint boundary** (`src/cycle-entrypoint.ts`) — the typed interface between the Worker and the Cycle execution layer.

## What This Package Does NOT Own

| Concern | Owner | Task |
|---------|-------|------|
| Durable Object implementation | `@narada2/cloudflare-site` (future module) | Task 322 |
| Bounded Cycle execution logic | `@narada2/cloudflare-site` (future module) | Task 325 |
| R2 read/write adapters | `@narada2/cloudflare-site` (future module) | Task 323 |
| KV caching layer | `@narada2/cloudflare-site` (future module) | Task 324 |
| Deployment config (Wrangler.toml) | Ops / CI | Future |

## Cloudflare Bindings

The Worker receives Cloudflare-specific globals through the standard Worker handler signature:

```ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // request — standard Fetch API Request
    // env     — bound services (DO, R2, KV) declared in wrangler.toml
    // ctx     — ExecutionContext for waitUntil / passThroughOnException
  }
}
```

`Env` is currently a minimal interface. Future tasks will add typed bindings as they are implemented.

## Package Boundary Rules

1. **No DO logic in this directory.** Durable Object classes live in a separate module (Task 322).
2. **No Cycle execution logic in this directory.** The actual Cycle runner lives behind `cycle-entrypoint.ts` (Task 325).
3. **No R2 reads/writes in this directory.** R2 adapters are injected via `env` bindings (Task 323).
4. **No provider abstraction.** This package is Cloudflare-specific. A generic "sites" abstraction is out of scope.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cycle` | Trigger one bounded Cycle invocation |
| GET | `/status` | Operator status endpoint (stub) |
| * | *other* | 404 |

## Build

```bash
pnpm --filter @narada2/cloudflare-site typecheck
```

```bash
pnpm --filter @narada2/cloudflare-site build
```

## Status

Scaffold. Ready to receive DO bindings, Cycle logic, and R2 adapters in later tasks.
