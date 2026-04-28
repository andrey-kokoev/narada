---
status: closed
closed_at: 2026-04-28T03:53:43.083Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

## Goal
Document typed capability metadata for canonical inbox envelopes without granting executable authority from envelope contents.

## Required Work
1. Extend canonical inbox doctrine with optional typed capability metadata fields for requirements, requests, claims, references, grant evidence, refusals, and revocations.
2. Explain that these fields are crossing metadata only: raw secrets are forbidden and actual power is resolved only through local admitted capability authority.
3. Add examples for repo.write requirement, operator grant evidence, receiver-local credential reference, and revocation/refusal notices.
4. Link the doctrine to capability consent registry, capability-governed secret management, verifiable envelope trust, and governed crossing.
5. Archive the source inbox observation after completion.

## Acceptance Criteria
- Canonical inbox docs define the capability metadata fields and their inert posture.
- Docs explicitly forbid raw secrets in normal inbox envelopes.
- Examples cover repo.write requirement, grant evidence, credential reference, and revocation/refusal.
- Related capability/trust docs link back or are linked coherently.
- Verification passes.

## Source Observation
Inbox envelope `env_ae9cee38-4cb3-4137-bb63-4dc313cc533b` requested typed capability metadata for inbox envelopes.

## Execution Notes

<!-- Record what was done, decisions made, and files changed. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->
