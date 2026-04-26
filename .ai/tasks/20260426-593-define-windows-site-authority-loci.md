---
status: closed
depends_on: []
closed_at: 2026-04-26T19:36:04.392Z
closed_by: codex
governed_by: task_close:codex
---

# Task 593 - Define Windows Site authority loci

## Context

Part of the Windows Site Authority Loci chapter (Tasks 593–593).

Narada's Windows Site model currently distinguishes substrate variants (`native` and `wsl`) but not Windows' own authority loci. The workstation Site discussion exposed a real split:

- a Windows **user** locus owns profile-local state, user credentials/preferences, operator KB, task governance, and per-user tools;
- a Windows **PC** locus owns machine/display/device/service state and whole-machine recovery actions.

Without a first-class type/config distinction, local Sites can accidentally encode this split through paths or names, which makes future migration and runtime policy harder to preserve.

## Goal

Add a narrow Windows Site authority-locus model to Narada proper without changing runtime behavior yet.

## Acceptance Criteria

- [x] `@narada2/windows-site` exports explicit `WindowsUserSiteLocus`, `WindowsPcSiteLocus`, and `WindowsAuthorityLocus` types.
- [x] Windows Site configs can optionally carry a `locus` field, preserving backward compatibility for existing configs.
- [x] The package provides small validation/defaulting helpers for omitted, user, and PC loci.
- [x] Windows Site docs explain the `user` vs `pc` authority split and root-posture implications.
- [x] Product Site bootstrap docs mention that Windows substrate (`windows-native`/`windows-wsl`) is separate from authority locus (`user`/`pc`).
- [x] Focused Windows Site tests cover locus defaulting and validation.

## Execution Mode

Proceed directly. Keep the change bounded to type/schema/docs/test surface; do not implement daemon behavior, migration, registry redesign, or new CLI flags in this task.

## Execution Notes

- Added optional Windows Site `locus` config vocabulary with `user` and `pc` authority loci.
- Added exported helper functions for defaulting and validating Windows Site loci.
- Documented that substrate variants (`native`/`wsl`) and authority loci (`user`/`pc`) are separate axes.
- Preserved backward compatibility: omitted `locus` means legacy user-locus behavior.

## Verification

- `pnpm --filter @narada2/windows-site build`
- `pnpm --filter @narada2/windows-site exec vitest run test/unit/authority-locus.test.ts`

## Outcome

Task implementation is complete and ready for review/closure. Runtime behavior, path resolution, CLI flags, registry schema, and daemon behavior were intentionally left unchanged.
