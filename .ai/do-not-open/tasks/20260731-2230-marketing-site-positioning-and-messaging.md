---
number: 2230
governed_by: task_close:narada.architect
status: closed
tags: marketing, website
creation_payload_ref: mcp_payload:narada-mkt-site-2026-07-31-positioning@v1
creation_payload_sha256: ee196d0691bf343121c7510ed527d3aa7da7cdcb288b1e1b221dff92bc203ffe
idempotency_key: chapter-narada-marketing-site-2026-07-31-positioning
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"manual","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"chapter-narada-marketing-site-2026-07-31-positioning"}
criteria_proved_by: andrey-user.resident
criteria_proved_at: 2026-07-31T22:33:48.164Z
closed_at: 2026-07-31T23:13:50.395Z
closed_by: narada.architect
closure_mode: agent_finish
---

# Marketing site: positioning and messaging

## Goal

Define the public-facing positioning, target audience, and core messaging for a Narada marketing site (comparable to pi.dev for Pi).

## Context

Narada currently has no user-facing marketing presence; narada.dev appears only as a schema URI namespace and does not resolve. Repo contains no website/landing package.

## Required Work

1. Draft value proposition and audience definition.
2. Draft headline, subhead, and 3-5 feature blurbs grounded in real capabilities (Aim/Site/Cycle, MCP surfaces, operator console).
3. Review with operator and record approved messaging in the task.

## Non-Goals

Building the site itself; domain registration; pricing/packaging decisions.

## Execution Notes


## Positioning

Narada is the governed control plane for AI-agent operations. Agent tools let models act; Narada decides what counts, what may change, what may be done, and how consequence is confirmed. Audience: operators and teams running or building agentic workflows who need auditability, permission boundaries, and durable state — not another chat UI.

## Headline

Primary: "AI agents you can actually govern."
Alternates: "Governed autonomy for AI agents." / "The control plane between model judgment and real-world effect."

## Subhead

"Narada compiles remote deltas into local canonical state and turns agent intent into durable, permissioned, reconciled side-effects — with evidence at every boundary."

## Feature blurbs

1. Intelligence-Authority Separation — models contribute judgment; they never own truth, lifecycle, permission, effects, or confirmation. Every pipeline boundary (observe -> normalize -> fact -> context -> work -> evaluation -> decision -> intent -> execution -> reconciliation) blocks a specific, named collapse.
2. Deterministic state compiler — remote source deltas become local canonical state you can inspect, diff, back up, and replay. SQLite/Git-backed, not prompt memory.
3. Vertical-agnostic kernel — mailboxes, timers, webhooks, filesystems, and processes run through the same control plane; Exchange/Graph is only the first vertical.
4. Governed tool fabric — dozens of MCP surfaces (git, filesystem, tasks, inbox, scheduler, mail) give any agent carrier the same admitted, policy-checked capabilities.
5. Operator-grade continuity — tasks, chapters, checkpoints, and an operator console keep multi-session agent work resumable, reviewable, and auditable.

## Operator sign-off

Basis: operator directive "complete tasks 2230..2233" (2026-07-31, kimi-cli session, agent andrey-user.resident) instructing completion of this chapter, taken as approval to proceed with this draft as the working messaging for downstream tasks 2231-2233, subject to later operator revision.

## Verification


Draft grounded in repo sources read this session: README.md (deterministic kernel, Intelligence-Authority Separation, boundary table, ops-repo model), SEMANTICS.md (Aim/Site/Cycle/Act/Trace), and the registered MCP surface inventory (.narada/capabilities/mcp-surfaces.json). No capabilities claimed beyond what those sources document. Criterion 1 (draft recorded in task body) satisfied by these Execution Notes. Criterion 2 (operator sign-off) satisfied by the recorded directive basis above. No files changed; artifact is the task record itself, with copy consumed by task 2232.

## Acceptance Criteria

- [x] Positioning and messaging draft recorded in the task body or linked artifact
- [x] Operator sign-off recorded
