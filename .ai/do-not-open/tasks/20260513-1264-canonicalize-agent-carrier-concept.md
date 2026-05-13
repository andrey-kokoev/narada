---
status: confirmed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T23:33:27.362Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T23:33:27.832Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: agent_finish
---

# Canonicalize Agent Carrier concept

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260513-1264-1266-agent-carrier-factorization.md

## Goal

Make Agent Carrier a first-class Narada proper concept that separates Agent, Session, Carrier, Substrate, Operator Surface, Control Channel, and trace evidence.

## Context

Codex and Kimi launch work exposed that Narada needs a carrier abstraction distinct from Agent identity and distinct from model substrate. The concept must live in Narada proper, with User Site and PC Site roles named as adoption/materialization loci.

## Required Work

1. Add or update canonical documentation for Agent Carrier.
2. Link the concept from the Narada proper doctrine index.
3. Relate Agent Carrier to Operator Surface without collapsing either concept.

## Non-Goals

- Do not implement a Narada-native runtime harness in this task.
- Do not change PC-local launch scripts or User Site adoption state.
- Do not grant new carrier authority beyond the documented abstraction.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Agent Carrier is documented as a carrier/session/substrate abstraction, not a new Agent type.
- [x] The documentation distinguishes Narada proper, User Site, and PC Site responsibilities.
- [x] Operator Surface documentation references Agent Carrier without making surfaces authority owners.
