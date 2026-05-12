# narada-proper.task-0023: Implement Crew Startup Shortcut Descriptor Package First Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Preceding candidate: `.narada/admission/candidates/task-0022-crew-startup-shortcut-capability-candidate.md`
- Capability: `narada-proper.capability.crew-startup-shortcut.v0`
- Source evidence: `env_f2c20035-bec3-4790-b223-3fccebc6de24`

## Goal

Create the first reusable repo package slice for governed crew startup shortcuts as descriptor/contracts/docs/tests only.

## Changed-File Scope

- `packages/crew-startup-shortcut/**`
- `.narada/capabilities/crew-startup-shortcut-capability-candidate.json`
- `.narada/tasks/task-0023-crew-startup-shortcut-package-first-slice.md`
- `.narada/audit/task-0023-crew-startup-shortcut-package-first-slice-audit.json`
- `.narada/admission/admission-ledger.jsonl`

## Non-Goals and Refusals

- Do not copy User Site shortcut files, `.crew` state, workboard state, task/inbox state, checkpoint history, operator-surface runtime state, PC-locus runtime state, secrets, or credentials.
- Do not execute startup, launch shells, mutate PC state, register live MCP surfaces, hydrate runtime context, grant capabilities, or provide native shell fallback.
- Do not treat claimed identity, role names, or shortcut labels as authority.

## Verification Checklist

- `pnpm --dir packages\crew-startup-shortcut test`
- `pnpm --dir packages\crew-startup-shortcut typecheck`
- `pnpm --dir packages\crew-startup-shortcut build`
- `.narada/admission/admission-ledger.jsonl` remains valid JSONL.

## Closeout Evidence

- Audit path: `.narada/audit/task-0023-crew-startup-shortcut-package-first-slice-audit.json`
- Terminal claim: descriptor package first slice implemented for MCP-only crew startup planning and refusal guards.
