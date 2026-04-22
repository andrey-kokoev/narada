---
status: closed
closed: 2026-04-21
depends_on: [371]
---

# Task 378 — Operator Console / Site Registry Chapter

## Assignment

Create a self-standing chapter for the **Operator Console backed by a Site Registry**.

## Context

The Windows Site chapter made a new need explicit: a user may have multiple Narada Sites on one Windows PC. The operator then needs one place to discover Sites, inspect health, see attention queues, and issue safe control requests.

## Goal

Produce a disciplined chapter and task DAG for a local Operator Console / Site Registry that can support multiple local Sites, starting with Windows native and WSL Sites, while remaining conceptually reusable for Cloudflare Sites later.

## Execution Notes

### Design document created

`docs/product/operator-console-site-registry.md` defines:
- What the Operator Console is (and is not: not Aim, Site, Vertical, Cycle, control plane, fleet manager)
- What the Site Registry owns (discovery paths, metadata, health cache, routing, audit log)
- What the Registry must not own (no direct Site-state mutation, no bypass of Site APIs)
- How it preserves Site authority (read-only aggregation + audited control request routing)
- How it differs from the kernel control plane (outside all Sites, no Cycle participation)
- Substrate-neutral concept with Windows-first implementation; Cloudflare deferred
- Attention Queue semantics (derived, read-only, advisory)
- Control Request Router semantics (audited, routed, no bypass)
- Vocabulary alignment with SEMANTICS.md §2.14

### Chapter DAG created

`.ai/tasks/20260421-378-384-operator-console-site-registry.md` with tasks 379–384:
| # | Task | Purpose |
|---|------|---------|
| 379 | Boundary Contract | Authority, invariant, no-hidden-authority contract |
| 380 | Site Registry Storage & Discovery | Filesystem scanning, registry schema, metadata persistence |
| 381 | Cross-Site Health & Attention Queue | Aggregate health, attention queue derivation, notification routing |
| 382 | Control Request Router & Audit | Router implementation, audit logging, Site-owned endpoint delegation |
| 383 | CLI Surface | `narada sites`, `narada console` commands; optional local UI scope |
| 384 | Chapter Closure | Semantic drift check, gap table, CCC posture, next-work recommendations |

### Individual task files created

Self-standing task files for 379–384, each executable by number alone with goal, required work, non-goals, and acceptance criteria.

### Substrate posture chosen

**Substrate-neutral concept, Windows-first implementation.**

The concepts (registry, aggregation, routing, audit) are substrate-neutral. The first implementation targets Windows native + WSL Sites. Cloudflare Sites are deferred but the design does not preclude them.

## Acceptance Criteria

- [x] A design/concept document exists for Operator Console / Site Registry.
- [x] The document states that the console is an operator surface, not an Aim/Site/Vertical/Cycle.
- [x] The Site Registry authority boundary is explicit: inventory and routing only, no direct Site-state mutation.
- [x] A numbered chapter DAG file exists after 378.
- [x] Self-standing follow-up tasks exist for registry, aggregation, routing, CLI/UI surface, and closure.
- [x] The chapter explicitly chooses substrate-neutral concept with Windows-first implementation.
- [x] No derivative task-status files are created.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
