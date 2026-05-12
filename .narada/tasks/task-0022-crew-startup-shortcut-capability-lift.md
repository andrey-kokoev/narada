# narada-proper.task-0022

Title: Lift crew startup shortcut mechanics into Narada proper capability contract

Source:
- Envelope: `env_f2c20035-bec3-4790-b223-3fccebc6de24`
- Source ref: `codex-chat:2026-05-11:operator-propose-narada-proper-lift-crew-startup-shortcuts`

Authority basis:
- Operator-confirmed proposal targeted at `narada-proper`.
- Narada proper admits this as a capability-lift candidate and planning task, not as runtime shortcut implementation.

Problem:
- Local crew startup shortcut mechanics are useful but appear Site-local.
- They may encode direct execution, shortcut paths, agent convenience state, or carrier-specific launch assumptions.
- Narada proper should own the portable capability boundary if these mechanics become standard operator practice.

Goal:
- Define governed Narada proper contract for crew startup shortcuts.
- Separate portable semantics from User Site convenience paths and carrier-specific launch details.
- Ensure startup shortcuts align with MCP-only operation posture.

First slice:
- Descriptor/design first slice.
- No live shortcut creation.
- No native shell fallback.
- No carrier-specific shortcut path copying.
- No User Site runtime state import.

Contract topics:
- admissible triggers
- authority boundaries
- supported target loci
- rehydration/workboard evidence
- MCP-only constraints
- stop-on-missing-MCP-capability behavior
- startup/checkpoint continuity requirements
- Inbox/task-lifecycle handoff shape

Expected artifacts:
- `.narada/admission/candidates/task-0022-crew-startup-shortcut-capability-candidate.md`
- `.narada/capabilities/crew-startup-shortcut-capability-candidate.json`
- `.narada/audit/task-0022-crew-startup-shortcut-capability-lift-audit.json`

Acceptance:
- Candidate names the portable capability boundary.
- Candidate refuses direct substrate shortcuts as the normal model.
- Candidate requires admitted MCP/Inbox/lifecycle surfaces for future implementation.
- Candidate preserves no-import posture for User Site runtime state, shortcut files, process state, workboard state, checkpoint history, secrets, and operator-surface runtime.

Non-goals:
- No implementation of CLI/MCP shortcut surfaces.
- No Windows shortcut creation.
- No shell/native process launch.
- No User Site shortcut copying.
- No PC-locus mutation.
