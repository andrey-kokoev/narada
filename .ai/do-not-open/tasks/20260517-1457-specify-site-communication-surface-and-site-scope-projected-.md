---
status: confirmed
depends_on: [1440]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T00:23:42.659Z
criteria_proof_verification:
  state: unbound
  rationale: Verified contract artifact and fixtures directly through JSON parsing, invariant scan, and diff whitespace check recorded in .ai/tmp/task-1457-report.json.
closed_at: 2026-05-17T00:29:09.702Z
closed_by: narada.builder2
governed_by: chapter_close:narada.builder2
closure_mode: peer_reviewed
---

# Specify Site Communication Surface and site-scope projected chat contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1457-1463-site-communication-surface.md

## Goal

Define the communication surface that lets an operator message a selected Site and chat about that Site's published projection without granting direct mutation authority.

## Context

Site Registry and Site Operational Dashboard now expose Site projections. The next coherence gap is user communication: each Site tile should eventually support direct inbox messaging and a Site-scope chat assistant. Chat must be scoped to one selected Site's published projection and may only compose or send a normal inbox envelope through the same governed crossing as the direct message form.

## Required Work

1. Ground the contract in Intelligence-Authority Separation, governed crossing, canonical inbox/outbox, Site factorization, verifiable envelope trust, capability-governed secret management, and Site Registry relation lifecycle posture.
2. Define the Site Communication Surface components: selected-Site message composer, Site-scope projected chat, delivery/admission receipt display, and relation/capability guard posture.
3. Define allowed chat read context: selected Site registry record, freshness/projection payloads, relation lifecycle, dashboard rows if published or explicitly fetched through projection, and public receipt metadata.
4. Define forbidden chat context: private task DBs, raw inbox payloads, secrets, raw logs, unexported filesystem state, and other Site projections unless explicitly selected or relation-visible.
5. Define the only permitted chat action path: compose a typed inbox envelope and send it through the normal inbox-message crossing, with token/capability guard and receipt tracking.
6. Define direct message envelope shape, idempotency posture, delivery receipt versus admission receipt, audit/event rows, and no-direct-mutation invariants.
7. Produce a versioned product artifact and fixtures sufficient for API/UI implementation tasks.

## Non-Goals

- Do not implement Cloudflare routes or UI in this task.
- Do not implement an LLM provider or prompt runtime.
- Do not let chat execute tasks, mutate registry relations, mutate Site state, or bypass inbox admission.
- Do not define registry-wide chat as the default product shape.

## Execution Notes

- Added `docs/product/site-communication-surface.v0.md`.
- Defined the Site Communication Surface as per-Site direct messaging plus Site-scope projected chat, with shared inbox-message crossing semantics.
- Specified allowed and forbidden chat context, including the rule that chat reads only the selected Site's published projection.
- Specified the shared message candidate shape, idempotency posture, delivery/admission receipt distinction, capability/trust posture, hosted route semantics, and UI constraints.
- Added normative fixtures under `docs/product/fixtures/site-communication-surface/` for message candidate, chat request, private-context refusal, and remote-preserved receipt.

## Verification

- `Get-ChildItem docs/product/fixtures/site-communication-surface -Filter *.json | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null; $_.Name }` passed: all four JSON fixtures parsed.
- `rg -n "Site-scope projected chat|registry-wide|Shared Message Send Path|remote_preservation_is_not_local_inbox_admission|Delivery is not local admission|forbidden context|Forbidden context|idempotency|Capability And Trust Posture" docs/product/site-communication-surface.v0.md` passed: required contract invariants found.
- `git diff --check -- docs/product/site-communication-surface.v0.md docs/product/fixtures/site-communication-surface .ai/tmp/site-communication-surface-chapter.json` passed.

## Acceptance Criteria

- [x] A versioned Site Communication Surface contract artifact exists.
- [x] The contract makes direct inbox messaging the shared send path for human compose and chat compose.
- [x] The contract distinguishes Site-scope projected chat from registry-scope chat.
- [x] Allowed and forbidden chat context are explicit.
- [x] Delivery, receipt, capability, idempotency, and no-direct-mutation invariants are specified.
