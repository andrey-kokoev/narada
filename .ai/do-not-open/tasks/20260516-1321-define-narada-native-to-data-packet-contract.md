---
status: closed
depends_on: [1307]
closed_at: 2026-05-16T01:12:17.476Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Define Narada-native to-data packet contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1321-1326-narada-native-to-data-adapter-foundation.md

## Goal

Define the shared read-only packet contract used by Narada-native to-data adapters.

## Context

The Narada-native carrier needs bounded, attributed data packets that can feed intelligence and orchestration without becoming mutation authority.

## Required Work

1. Specify shared packet envelope fields: schema, read_family, carrier_session_id, agent_id, source_surface, capability_ref, attribution, freshness, bounded_summary, raw_values_recorded=false, and authority_mutation_performed=false.
2. Define packet families for task_packet, work_next_peek, inbox_summary, readiness_snapshot, evidence_ref_summary, and bounded_file_excerpt.
3. Add schema fixtures and tests proving each family has attribution, capability posture, bounded evidence, and explicit no-mutation flags.

## Non-Goals

- Do not implement live Narada reads in this task.
- Do not grant task, inbox, outbox, command, publication, repository, or credential mutation authority.
- Do not record raw secrets, raw transcripts, or raw provider outputs.

## Execution Notes

- Added `tools/narada-native-carrier/to-data-packet.mjs` as the shared read-only packet contract for Narada-native to-data adapters.
- Defined the packet schema id and required read families: `task_packet`, `work_next_peek`, `inbox_summary`, `readiness_snapshot`, `evidence_ref_summary`, and `bounded_file_excerpt`.
- The fixture builder emits the shared envelope fields: `schema`, `read_family`, `carrier_session_id`, `agent_id`, `source_surface`, `capability_ref`, `attribution`, `freshness`, `bounded_summary`, `raw_values_recorded=false`, and `authority_mutation_performed=false`.
- The validator rejects unsupported families, missing required envelopes, raw-value summaries, `raw_values_recorded=true`, and `authority_mutation_performed=true`.
- Added `tools/narada-native-carrier/to-data-packet.test.mjs` covering all admitted read families and explicit refusal of raw values/mutation flags.
- Files changed for this task: `tools/narada-native-carrier/to-data-packet.mjs`, `tools/narada-native-carrier/to-data-packet.test.mjs`, `.ai/do-not-open/tasks/20260516-1321-define-narada-native-to-data-packet-contract.md`.

## Verification

- `node --test tools\narada-native-carrier\to-data-packet.test.mjs` passed: 2 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 46 tests.

## Acceptance Criteria

- [x] A shared to-data packet contract exists with explicit read family, attribution, capability, freshness, bounded summary, and no-mutation fields.
- [x] All required packet families are represented by fixtures or tests.
- [x] Tests prove raw_values_recorded is false and authority_mutation_performed is false for every packet family.
