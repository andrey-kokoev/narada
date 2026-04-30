---
status: opened
---

# Define runtime plurality and runtime-invariant adapter contracts

## Goal

Make Narada distinguish execution surface, runtime substrate, authority locus, storage substrate, and adapter contract so Node remains an admitted implementation runtime, not Narada's privileged ontology.

## Context

Inbox proposal `env_2f59666b-c034-4ba1-a1b0-05531d61fed9` argues that Node/TypeScript is currently important for Narada proper, but should be modeled as one runtime substrate among possible equals: Node, PowerShell, Rust, Python, browser runtime, daemon process, and serverless workers.

Follow-up proposal `env_92bcfb58-acf0-44fe-a53b-510482972bf3` clarifies the invariant: runtime substrates may vary, but adapter contracts must remain stable. Narada should govern runtime-invariant adapter surfaces: invocation, capability declaration, authority binding, evidence, dry-run semantics, error taxonomy, idempotency, secret handling, observability, and version compatibility.

This follows recent CPY and Windows onboarding friction where Node CLI assumptions, PowerShell carriers, Windows startup, and client-service runtime posture had to be reasoned about separately.

## Required Work

1. Document canonical definitions for execution surface, runtime substrate, authority locus, storage substrate, runtime-invariant adapter surface, and adapter protocol.
2. Define initial adapter protocol schema or example artifact covering invocation contract, capability declaration, authority binding, evidence contract, dry-run contract, error taxonomy, idempotency, secret handling, observability, and version compatibility.
3. Update onboarding/runtime-substrate docs so runtime selection always references the invariant adapter contract the chosen runtime must satisfy.
4. Update doctor/preflight language so Node absence is not treated as universal Narada failure unless the current embodiment explicitly requires Node.
5. Ensure command guidance avoids hardcoded Node binary paths across embodiments and instead uses declared shims or exact delegated-runtime repair guidance.
6. Audit existing adapters or representative command surfaces for implicit Node assumptions and classify them by adapter protocol compliance or residual gap.
7. Add tests, fixtures, or doc examples showing one adapter contract satisfied by multiple runtime substrates where feasible.
8. Route both source inbox envelopes to this task with durable evidence.

## Non-Goals

- Do not rewrite Narada proper out of TypeScript/Node.
- Do not implement Rust, Python, PowerShell, Cloudflare, or browser adapters beyond the minimal examples or schema needed for the contract.
- Do not make runtime substrate choice override authority locus.
- Do not hide runtime requirements; declare them precisely.
- Do not permit raw secrets in adapter config, logs, traces, or output.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Docs define execution surface, runtime substrate, authority locus, storage substrate, runtime-invariant adapter surface, and adapter protocol
- [ ] Initial adapter protocol schema or example artifact covers invocation, capability, authority, evidence, dry-run, error, idempotency, secret, observability, and version fields
- [ ] Onboarding/runtime docs separate runtime substrate selection from authority locus and storage substrate
- [ ] Doctor/preflight language treats Node as embodiment-specific, not universal Narada substrate
- [ ] Existing adapter or command surfaces are audited for implicit Node assumptions and classified by compliance or residual gap
- [ ] Tests, fixtures, or examples show the same adapter contract across at least two runtime substrate postures where feasible
- [ ] Both source inbox envelopes are promoted or recorded pending to this task with durable evidence
