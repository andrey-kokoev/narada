---
status: closed
closed_at: 2026-05-16T16:21:41.293Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Specify Cloudflare hosted Site Registry projection chapter

## Chapter

Cloudflare hosted Site Registry projection

## Goal

Define the bounded deployment chapter for a Cloudflare-hosted Site Registry projection surface.

## Context

Narada has @narada2/site-config contracts for Site Registry projection, typed Site events, read models, and human peek posture. Staccato's Cloudflare Worker provides inhabited source evidence for how the hosted surface should be shaped: wrangler config, bearer capability tokens, guarded /webhook, KV latest projections, D1 message/audit tables, read APIs, and local pull/finalize scripts. This chapter must lift that setup as Narada proper infrastructure without making the hosted registry Site authority.

## Required Work

1. Inspect the existing Narada Site Registry contracts, Cloudflare Site package, and Staccato Worker source/readme/wrangler/migrations as read-only source evidence. 2. Write the chapter boundary and task graph for a hosted Site Registry projection Worker. 3. State in-scope routes, storage, capability bindings, deployment artifacts, smoke proof, and live-deploy residuals. 4. Record explicit non-goals: no Site mutation authority, no task lifecycle mutation authority, no inbox admission authority, no identity certification, no capability grants, and no live Cloudflare deployment without separate operator capability grant.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Inspected existing Narada contracts and docs for Site Registry projection, hosted Cloudflare Site runtime, and prior Site Registry typed webhook contract.
- Inspected Staccato Cloudflare Worker source evidence read-only: `D:\code\staccato-elt\workers\staccato\src\index.mjs`, `wrangler.jsonc`, D1 migration `0001_surface_inbox.sql`, Worker tests, and `runbooks\cloudflare-published-surface.md`.
- Created task range 1377-1384 under chapter `Cloudflare hosted Site Registry projection`.
- Chapter lifts Staccato setup as high-level shape: Worker route table, `POST /webhook`, read APIs, KV latest projections, D1 durable inbox/audit rows, bearer capability splits, local publish/pull/finalize scripts, deploy/runbook posture, and smoke verification.
- Chapter does not authorize live Cloudflare mutation or deployment. Live deploy remains gated behind separate Operator instruction, capability grant, secret binding plan, and post-deploy evidence.
- Added chapter handoff artifact `.ai/handoffs/20260516-cloudflare-hosted-site-registry-projection.json`.

## Verification

- `narada task allocate --count 8 --format json` passed: allocated task numbers 1377-1384.
- `narada task create ...` passed for tasks 1377-1384.
- `narada task read 1377` passed: task 1377 is opened and actionable.
- `narada task read 1384` passed: task 1384 depends on 1383 and records readiness/closure scope.
- `narada task graph --format json` passed and emitted observation `.ai\observations\obs_task_graph_1778948378479_yuxkzj.mmd`.

## Acceptance Criteria

- [x] Chapter boundary names Staccato-derived reusable setup patterns without importing Staccato-specific authority.
- [x] Task graph covers Worker scaffold, storage, receiver, read API, message exchange, publisher/puller clients, deployment config, smoke proof, and closure.
- [x] Live deployment is explicitly residualized behind a separate operator capability grant.
