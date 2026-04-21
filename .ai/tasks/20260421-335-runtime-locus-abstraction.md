---
status: deferred
depends_on: [330, 331]
---

# Task 335 — Runtime Locus Abstraction (Deferred)

> **Status: Deferred.** Task 330's ontology closure review explicitly deferred generic `Site` abstraction: "One Site materialization is not sufficient evidence to justify a generic `Site` abstraction." This task is kept on file for reference but is **not in the active backlog**. It will be revived when a second substrate (e.g., local container, AWS Lambda, Fly.io) is proven.

## Context

Task 330 deferred a generic `Site` abstraction until a second substrate is proven. The Cloudflare prototype revealed mechanical structure that any Site materialization will need: lock acquisition, health read/write, trace persistence, and Cycle runner boundaries.

The question is not "should we build a generic deployment framework?" (no). The question is "what is the minimal shared interface that any Runtime Locus must satisfy?"

**This task is deferred because one substrate is insufficient evidence.** The criteria for extracting a generic interface (from Task 330):
1. At least two materially different substrate implementations
2. Both share enough mechanical structure that a shared interface reduces duplication
3. The shared interface does not force either substrate into unnatural shapes

## Goal

When revived, define the common interface across local WSL/systemd/Cloudflare without building a large deployment framework prematurely. Document what is substrate-specific vs. shared.

## Required Work

### 1. Identify shared mechanical structure

From the Cloudflare prototype, extract the mechanical structure that any Runtime Locus needs:

| Mechanism | Cloudflare Realization | Local Realization |
|-----------|----------------------|-------------------|
| Cycle scheduler | Cron Trigger + HTTP endpoint | systemd timer + CLI |
| Coordination lock | Durable Object SQLite | local SQLite coordinator |
| Health storage | DO SQLite | local SQLite / filesystem |
| Trace storage | R2 + DO SQLite | local filesystem |
| Bounded execution | Sandbox / Container | subprocess / local runtime |
| Secret binding | Worker Secrets | OS keychain + env |
| Operator surface | Worker HTTP endpoint | CLI + local HTTP daemon |

### 2. Define the minimal shared interface

Produce a type/interface sketch (not an implementation) that captures:

- `RuntimeLocus` — minimal capabilities: schedule Cycle, resolve Site, bind secrets
- `SiteState` — what every Site must store: lock, health, trace, context records, work items
- `CycleRunner` — what every Cycle runner must do: acquire lock, run bounded steps, release lock, persist trace
- `OperatorSurface` — what every operator surface must expose: status, (eventually) mutations

Each interface must be **minimal** — it should not force any substrate into unnatural shapes.

### 3. Document substrate-specific vs. shared boundary

Create a table that classifies every prototype mechanism as:
- **Shared** — all substrates must implement this
- **Shared with variation** — all substrates implement this, but the realization differs
- **Substrate-specific** — only Cloudflare needs this; local runtime does not

### 4. Update design docs

Update `docs/deployment/cloudflare-site-materialization.md` with the Runtime Locus abstraction boundary. Ensure the doc does not present Cloudflare as the only valid Runtime Locus.

## Non-Goals

- Do not build a generic deployment framework.
- Do not abstract before a second substrate exists.
- Do not rename existing packages or move files.
- Do not create implementation code.
- Do not create derivative task-status files.

## Acceptance Criteria

- [ ] Common interface documented with type sketches.
- [ ] Substrate-specific vs. shared boundary table exists and is complete.
- [ ] No premature abstraction forced on the Cloudflare package.
- [ ] Design docs updated to reflect the abstraction boundary.
- [ ] No implementation code was added.

## Suggested Verification

```bash
pnpm --filter @narada2/cloudflare-site typecheck
# Typecheck passes; no implementation changes.
```

Manual inspection: verify that the shared interface is minimal and does not force Cloudflare into unnatural shapes.
