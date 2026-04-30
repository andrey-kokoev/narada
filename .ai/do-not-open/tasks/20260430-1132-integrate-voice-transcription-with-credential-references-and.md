---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T15:45:25.096Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777563860931_n94q5r
closed_at: 2026-04-30T15:45:50.649Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Integrate voice transcription with credential references and capability consent

## Chapter

Credential Governance and Voice Intake Safety

## Goal

Make operator-surface voice transcription resolve a governed credential reference and capability grant instead of relying only on inherited environment variables.

## Context

Inbox envelope env_e9f0794f-39fe-42f0-b8aa-eac12dd5d332 reports that live microphone capture works, but the Harmonia/Cloudflare transcription adapter blocks unless HARMONIA_VOICE_TRANSCRIPTION_TOKEN is present in the process environment. Narada already has credential reference and capability-consent doctrine; the voice adapter must use that authority path before sending remote audio.

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Voice transcription can use a credential reference rather than only HARMONIA_VOICE_TRANSCRIPTION_TOKEN from inherited env.
- [x] The supported reference model includes env and Windows Credential Manager backed resolution, or a documented extension point if platform access is Site-local.
- [x] Remote audio transcription requires an admitted capability/consent record before audio is sent.
- [x] Missing credential output distinguishes microphone availability from transcription credential availability and gives exact repair guidance.
- [x] No raw token appears in config, logs, traces, YASB state, recognition artifacts, or task evidence.
- [x] Mic-only capture remains available for debugging without remote transcription.
