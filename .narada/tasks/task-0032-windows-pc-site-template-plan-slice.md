# narada-proper.task-0032: Deepen Windows PC Site Template Plan Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0027`
- Source evidence:
  - `C:\Users\Andrey\Narada\templates\pc-sites\windows-komorebi-yasb\README.md`
  - `C:\Users\Andrey\Narada\kb\proposals\shared-windows-site-machinery-extraction-plan.md`
  - `C:\Users\Andrey\Narada\kb\proposals\windows-operator-surface-first-slice-source-inventory.md`
  - `C:\Users\Andrey\Narada\kb\komorebi\windows-komorebi-yasb-portable-template.md`

The source files are external orientation evidence only. Narada proper admits descriptor/contracts/tests for greenfield PC Site template planning, not any live PC Site or desktop runtime state.

## Goal

Deepen `@narada2/windows-pc-site-template` with:

- typed greenfield template plan descriptors;
- slice selection for operator surface, shell MCP, test MCP, OSL, and Komorebi/YASB;
- planned directory and local admission outputs;
- refusal guards for runtime state and credential imports;
- source inventory documentation;
- neutral tests proving no filesystem creation.

## Non-Goals

- No PC Site materialization.
- No filesystem creation under `C:\ProgramData`.
- No Windows profile mutation.
- No display/HWND/Komorebi/YASB/log/PID/socket/operator preference import.
- No secrets or credentials.

## Verification

- `pnpm --dir packages/windows-pc-site-template test`
- `pnpm --dir packages/windows-pc-site-template typecheck`
- `pnpm --dir packages/windows-pc-site-template build`

## Closeout

- Audit: `.narada/audit/task-0032-windows-pc-site-template-plan-slice-audit.json`
