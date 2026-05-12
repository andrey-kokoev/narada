# narada-proper.task-0029: Deepen Windows OSL Panel Payload Slice

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Builds on: `narada-proper.task-0027`
- Source evidence:
  - `C:\Users\Andrey\Narada\kb\operator-surface\osl-webview2-panel-payload-contract.md`
  - `C:\Users\Andrey\Narada\tools\window-surface-overlay\osl-panel-payload-contract.test.mjs`
  - `C:\Users\Andrey\Narada\tools\window-surface-overlay\panel-payload-contract.test.mjs`
  - `C:\Users\Andrey\Narada\tools\window-surface-overlay\src\main.rs`
  - `C:\Users\Andrey\Narada\tools\osl-webview2-panel-host\README.md`

The source files are external orientation evidence only. Narada proper admits package-local descriptor/contracts/tests for read-only OSL panel payloads, not live panel runtime state.

## Goal

Deepen `@narada2/windows-osl` with:

- typed OSL WebView2 panel payload contracts;
- neutral payload builder;
- validation/refusal behavior for read-only compatibility projections;
- source inventory documentation;
- package-local tests for no-import and no-authority-smearing guards.

## Non-Goals

- No WebView2 host implementation.
- No OSL panel launch/stop/status execution.
- No HWND, display, process, label, log, Komorebi, YASB, or PC runtime import.
- No shell, lifecycle, SQLite, binding mutation, or future controls authority.
- No narada-andrey identity authority.

## Verification

- `pnpm --dir packages/windows-osl test`
- `pnpm --dir packages/windows-osl typecheck`
- `pnpm --dir packages/windows-osl build`

## Closeout

- Audit: `.narada/audit/task-0029-windows-osl-panel-payload-slice-audit.json`
