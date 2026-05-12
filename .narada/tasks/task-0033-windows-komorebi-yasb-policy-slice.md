# narada-proper.task-0033: Deepen Windows Komorebi/YASB Policy Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0027`
- Source evidence:
  - `C:\Users\Andrey\Narada\kb\komorebi\windows-komorebi-yasb-portable-template.md`
  - `C:\Users\Andrey\Narada\templates\pc-sites\windows-komorebi-yasb\README.md`
  - `C:\Users\Andrey\Narada\templates\pc-sites\windows-komorebi-yasb\policy\tiling-surface-desktop-policy.json`
  - `C:\Users\Andrey\Narada\templates\pc-sites\windows-komorebi-yasb\kb\yasb-authority-projection.md`

The source files are external orientation evidence only. Narada proper admits descriptor/contracts/tests for Komorebi/YASB materialization posture, not live PC Site runtime state or repair authority.

## Goal

Deepen `@narada2/windows-komorebi-yasb-kit` with:

- typed materialization request/decision descriptors;
- surface distinction between operator-surface MCP, PC Site local fallback, and refused live runtime directory;
- local admission requirements;
- refusal guards for live runtime/monitor/preference/credential import;
- source inventory documentation;
- neutral tests proving descriptor-only/no-mutation behavior.

## Non-Goals

- No Komorebi/YASB restart or repair.
- No runtime config copy.
- No live monitor, display, process, log, PID, socket, or workspace import.
- No user preference authority import.
- No credentials or secrets.

## Verification

- `pnpm --dir packages/windows-komorebi-yasb-kit test`
- `pnpm --dir packages/windows-komorebi-yasb-kit typecheck`
- `pnpm --dir packages/windows-komorebi-yasb-kit build`

## Closeout

- Audit: `.narada/audit/task-0033-windows-komorebi-yasb-policy-slice-audit.json`
