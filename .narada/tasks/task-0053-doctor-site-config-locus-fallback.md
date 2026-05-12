# narada-proper.task-0053 - Doctor Site config locus fallback

## Status

completed

## Authority Basis

- authority root: `D:\code\narada`
- posture: Narada proper CLI diagnostic repair after operator identified root `config.json` as the wrong Site config locus

## Goal

Make `narada doctor` recognize Narada proper `.narada/site.json` when the legacy operation `config.json` is absent.

## Scope

- Preserve legacy operation config behavior when `config.json` exists or is explicitly supplied.
- Add a Narada Site-seed doctor report for `.narada/site.json`.
- Verify Site id, Site root, repo root, authority admission, runtime-state non-import posture, and create-site capability record presence.

## Non-Goals

- Do not create `D:\code\narada\config.json`.
- Do not move or rewrite `.narada/site.json`.
- Do not change operation config semantics for mailbox/control-plane operations.
- Do not import source Site runtime state.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/doctor.test.ts` passed, 11 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `narada doctor --format json` passed and reported `config_path=D:\code\narada\.narada\site.json`.
- `narada --version` passed.

## Closeout

`narada doctor --format json` no longer fails by looking for `D:\code\narada\config.json` in this Narada proper Site seed. It reports the `.narada/site.json` locus instead.
