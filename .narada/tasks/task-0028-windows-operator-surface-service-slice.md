# narada-proper.task-0028: Deepen Windows Operator Surface Service Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0027`
- Source evidence:
  - `C:\Users\Andrey\Narada\docs\concepts\operator-surface-identity-ledger.md`
  - `C:\Users\Andrey\Narada\docs\concepts\operator-surface-task-activity.md`
  - `C:\Users\Andrey\Narada\tools\operator-surface\operator-surface-binding-services.mjs`

The source files are orientation evidence only. Narada proper admits fixture-safe pure service logic and source inventory classification, not local runtime state.

## Goal

Deepen `@narada2/windows-operator-surface` beyond seed descriptors with:

- source inventory classification;
- fixture-safe binding liveness classification;
- binding diagnosis assembly from receiving-Site supplied rows;
- compatibility runtime-binding projection from receiving-Site supplied evidence.

## Non-Goals

- No live HWND import.
- No operator-surface SQLite DB import.
- No generated projection import from `C:\ProgramData\Narada`.
- No narada-andrey identity authority.
- No PC-locus repair scripts or native Windows API mutation.

## Verification

- `pnpm --dir packages/windows-operator-surface test`
- `pnpm --dir packages/windows-operator-surface typecheck`
- `pnpm --dir packages/windows-operator-surface build`

## Closeout

- Audit: `.narada/audit/task-0028-windows-operator-surface-service-slice-audit.json`
