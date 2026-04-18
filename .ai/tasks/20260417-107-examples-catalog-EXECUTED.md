# Examples Catalog — EXECUTED

**Date**: 2026-04-17
**Status**: Complete

---

## Deliverables

### 1. Top-Level Directory Structure

```
examples/
  README.md
  context-cases/
  sequences/
  mailbox-scenarios/
  playgrounds/
```

Created at repo root, beside `packages/`.

### 2. Catalog Index (`examples/README.md`)

Explains:
- Why examples are top-level (cross-cutting, not owned by any single package)
- Scenario folders (`context-cases/`, `sequences/`, `mailbox-scenarios/`) as fixture buckets
- `context-cases/` is kernel-neutral — a context may be mail-backed, timer-backed, filesystem-backed, or webhook-backed
- `playgrounds/` is a **runner surface**, not a fixture classification (exploration tools vs assertable scenarios)
- Examples should be **executable/assertable fixtures where possible**, not just documentation
- Naming convention (concept-first, kebab-case)

### 3. Seed Examples

#### Context Cases (`context-cases/`)

| File | Description |
|------|-------------|
| `direct-support-resolution.yaml` | Self-service support context — resolves without outbound action |
| `support-with-commitment-extraction.yaml` | SLA obligation extracted from urgent message |
| `conflicting-charter-recommendations.yaml` | Fraud-detection vs customer-retention conflict, foreman arbitrates |
| `obligation-centric-follow-up.yaml` | Synthetic obligation trigger causes outbound follow-up |

#### Sequences (`sequences/`)

| File | Description |
|------|-------------|
| `support-escalation.yaml` | Three-step evolution: self-service → escalation → engineering resolution |

#### Mailbox Scenarios (`mailbox-scenarios/`)

| File | Description |
|------|-------------|
| `morning-queue.yaml` | Four-context morning queue with priority-based scheduling and arbitration notes |

#### Playgrounds (`playgrounds/`)

| File | Description |
|------|-------------|
| `foreman-routing-sandbox.md` | Operator-facing guide for manually testing foreman routing decisions |

---

## Definition of Done

- [x] top-level `examples/` exists
- [x] examples catalog subfolders exist (`context-cases/`, `sequences/`, `mailbox-scenarios/`, `playgrounds/`)
- [x] `examples/README.md` explains the taxonomy, kernel-neutral naming, and fixture philosophy
- [x] seed set of example files exists (4 context-cases, 1 sequence, 1 mailbox-scenario, 1 playground)
- [x] examples are clearly treated as cross-cutting, not package-local
- [x] `thread-cases/` renamed to kernel-neutral `context-cases/`
- [x] `playgrounds/` distinguished as runner surface, not scenario classification
- [x] README states examples should be executable/assertable fixtures where possible
