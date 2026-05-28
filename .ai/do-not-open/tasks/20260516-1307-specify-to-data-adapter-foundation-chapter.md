---
status: confirmed
depends_on: [1301, 1302, 1303, 1304, 1305]
closed_at: 2026-05-16T00:40:26.669Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify to-data adapter foundation chapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1306-1313-narada-native-carrier-future-chapter-commissioning.md

## Goal

Create a structured build chapter for the Narada-native carrier to-data side: bounded read access to Narada and local Site data without authority mutation.

## Context

The carrier can be factored as to-data, to-intelligence, and an orchestration wrapper. The to-data side should provide governed reads of task packets, inbox/work-next, readiness, evidence, and bounded local files.

## Required Work

1. Inspect existing task-handoff, readiness, adapter-registration, and supervisor read surfaces.
2. Define a to-data interface for bounded task, inbox, work-next, readiness, evidence, and file read packets.
3. Specify capability and attribution requirements for each read family.
4. Include tests proving no raw secret values, unbounded transcripts, or authority-bearing mutations are recorded.
5. Submit structured chapter input with ordered implementation and verification tasks.

## Non-Goals

- Do not grant task, inbox, outbox, command, publication, or repository mutation authority to to-data adapters.
- Do not make direct SQLite reads the normal to-data interface.
- Do not collapse local file readability into Narada authority.

## Execution Notes

- Inspected current read surfaces:
  - `task-handoff.mjs` already reads bounded task packets through `narada task read --format json` and records read-surface attribution.
  - `readiness.mjs` reconstructs session evidence from carrier-session JSON files and reports operational readiness without direct SQLite inspection.
  - `adapter-registration.mjs` exposes sanitized provider registration/readiness metadata without raw provider config values or secret material.
  - `supervisor.mjs` exposes bounded lifecycle/doctor readbacks and no-authority flags.
- Owning boundary: a Narada-native to-data adapter should be a read-only projection boundary. It may request and summarize bounded packets from canonical Narada surfaces, but it does not own task lifecycle, inbox, outbox, command, publication, repository, credential, or external Site mutation authority.

## Structured Chapter Input

Chapter: `narada-native-to-data-adapter-foundation`

Goal: Define and implement the Narada-native to-data side as a set of bounded read adapters that feed carrier intelligence/orchestration with attributed packets while preserving canonical mutation authority outside the carrier.

Ordered implementation tasks:

1. `Define Narada-native to-data packet contract`
   - Specify shared packet envelope fields: `schema`, `read_family`, `carrier_session_id`, `agent_id`, `source_surface`, `capability_ref`, `attribution`, `freshness`, `bounded_summary`, `raw_values_recorded=false`, `authority_mutation_performed=false`.
   - Families: `task_packet`, `work_next_peek`, `inbox_summary`, `readiness_snapshot`, `evidence_ref_summary`, `bounded_file_excerpt`.
   - Verification: schema fixture tests prove each family has attribution, capability posture, bounded evidence, and no mutation flags.

2. `Implement task and work-next to-data readers`
   - Route task reads through `narada task read --format json` and work selection through a no-claim/peek read surface when available; if no no-claim work-next is available, return a refusal packet instead of claiming work.
   - Capabilities: `task_read_packet`, `work_next_peek`.
   - Attribution: command, cwd/Site root, requested task/agent, timestamp, bounded fields present.
   - Verification: tests prove no task claim/report/close mutation occurs and raw task markdown is not recorded.

3. `Implement inbox summary to-data reader`
   - Read inbox state only through canonical inbox list/pending/read surfaces or injected test readers, not direct SQLite as the normal path.
   - Capabilities: `inbox_summary_read`.
   - Attribution: envelope ids, statuses, source refs, summary/key fields only.
   - Verification: tests prove payload summaries omit raw secret-like values and no inbox status transition occurs.

4. `Implement readiness and evidence reference readers`
   - Use `operationalReadiness`, `reconstruct`, supervisor doctor, and registration readiness as the source surfaces.
   - Capabilities: `carrier_readiness_read`, `carrier_evidence_ref_read`.
   - Attribution: evidence file refs and schema/status summaries; no raw transcript or provider output payloads.
   - Verification: tests prove provider and fixture sessions both reconstruct with bounded evidence refs and no raw provider output.

5. `Implement bounded local file excerpt reader`
   - Provide an explicitly capability-gated file excerpt reader for local text artifacts under an admitted Site root.
   - Capabilities: `site_file_excerpt_read`.
   - Admission rules: reject secret-like paths, binary files, oversized excerpts, traversal outside Site root, and files requiring a stronger canonical reader.
   - Verification: tests prove path containment, size limits, secret-path refusal, and excerpt redaction posture.

6. `Add integrated to-data adapter reconstruction proof`
   - Build an end-to-end mocked carrier session that reads task, readiness, evidence refs, and a bounded file excerpt into a single to-data bundle.
   - Verification: bundle has no raw secrets, no unbounded transcripts, no direct SQLite requirement, and all mutation flags are false.

Residuals:

- This chapter should not grant live credential/secret access. Capability consent binding remains separate and should consume the to-data capability names later.
- The work-next reader should refuse rather than claim until a no-claim work-next/peek surface is confirmed available.

## Verification

- Inspected `tools\narada-native-carrier\task-handoff.mjs`.
- Inspected `tools\narada-native-carrier\readiness.mjs`.
- Inspected `tools\narada-native-carrier\adapter-registration.mjs`.
- Inspected `tools\narada-native-carrier\supervisor.mjs`.

## Acceptance Criteria

- [x] The chapter proposal defines a clear to-data contract and adapter set.
- [x] Every read surface has capability, attribution, and bounded evidence posture.
- [x] Mutation authority remains outside the carrier.
- [x] The proposed tasks are ready for governed chapter commission.
