---
status: confirmed
depends_on: [1433, 1463, 1474]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:03:47.314Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779051819712_1ba4mq
closed_at: 2026-05-17T21:04:01.958Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Audit hosted registry docs and routes for telemetry-registry naming smear

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1475-1481-separate-site-telemetry-from-site-registry.md

## Goal

Produce a bounded audit of docs, CLI, package names, route names, and UI labels that currently blur Site telemetry with Site Registry authority.

## Context

The Cloudflare package currently hosts `/webhook`, `/api/sites`, relation lifecycle, messages, communications, and a human UI. Some compatibility names must remain, but public-facing doctrine and operator labels should stop implying one service owns all concerns.

## Required Work

1. Inspect `packages/site-registry-cloudflare`, `docs/product/site-telemetry-*`, `docs/product/site-registry-*`, and deployment docs.
2. Classify each named route/doc/UI section as Site Operational Telemetry, Site Registry, Registry Operational Telemetry, Site Communication Candidate Exchange, or compatibility-only.
3. Identify overclaiming names, ambiguous UI text, and command labels that would mislead agents or operators.
4. Produce an audit artifact with must-fix, may-keep-for-compatibility, and future-split categories.

## Non-Goals

- Do not edit implementation in this task.
- Do not require package renaming where compatibility says names must remain.
- Do not remove routes.

## Execution Notes

- Inspected `packages/site-registry-cloudflare` README and Worker route table, plus adjacent Site telemetry, Site registry, and Site communication docs.
- Added `docs/product/site-telemetry-registry-boundary-audit-20260517.md`.
- Classified hosted route families: human shell, service health, telemetry event receiver, registry public read model, remote message candidates, relation lifecycle, and Site communication routes.
- Identified must-fix docs/UI labels, compatibility names that may remain, and future split candidates.
- Recorded command naming guidance so future work does not use `site-telemetry publish` for hosted registry relation activation.

## Verification

- `rg -n "Hosted Route Classification|Must Fix|May Keep For Compatibility|Future Split Candidates|GET /health|POST /webhook|/api/messages|/api/relations/transition|/api/site-communications|site-telemetry publish" docs/product/site-telemetry-registry-boundary-audit-20260517.md` confirmed required audit sections and route-family classifications.
- `git diff --check -- docs/product/site-telemetry-registry-boundary-audit-20260517.md .ai/do-not-open/tasks/20260517-1476-audit-hosted-registry-docs-and-routes-for-telemetry-registry.md` passed.

## Acceptance Criteria

- [x] Audit artifact exists.
- [x] Each current hosted route family is classified.
- [x] Compatibility names are distinguished from desired conceptual names.
