---
status: closed
closed_at: 2026-05-12T18:28:36.761Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Verify operator-surface label style inheritance

## Chapter

Canonical Inbox Promotions

## Goal

Confirm named-agent identity migrations preserve role/site label affinity through inherited projection style or diagnostic fallback.

## Context

Source inbox envelope: env_0d0e1658-50cd-470e-a954-f50c9c276521

Source: agent_report:narada-andrey:capa-identity-style-migration-loss

Envelope kind: incident

Summary: After the Kevin identity migration from narada-andrey.architect to narada-andrey.Kevin, the newer identity_id/site_id/role record lacked label_projection.style. Build-WindowLabelsFromIdentities.ps1 accepted the newer schema for identity and role extraction but silently fell back to default grey role_text_hex D1D5DB, causing the architect role line to render white/grey instead of fuchsia E879F9. This is a migration/projection defect: semantic role was preserved, but visual role-affinity projection was lost without diagnostic.

## Required Work

0. Source summary: After the Kevin identity migration from narada-andrey.architect to narada-andrey.Kevin, the newer identity_id/site_id/role record lacked label_projection.style. Build-WindowLabelsFromIdentities.ps1 accepted the newer schema for identity and role extraction but silently fell back to default grey role_text_hex D1D5DB, causing the architect role line to render white/grey instead of fuchsia E879F9. This is a migration/projection defect: semantic role was preserved, but visual role-affinity projectio
1. Read source inbox envelope env_0d0e1658-50cd-470e-a954-f50c9c276521 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Target locus: Narada proper operator-surface identity/label projection read model in `D:\code\narada`.
- Preserved source envelope `env_0d0e1658-50cd-470e-a954-f50c9c276521` as external CAPA incident evidence.
- Verified current `operator-surface-registry` resolves label style by explicit identity style first, then role affinity color, then Site affinity color, then default with diagnostic.
- Verified default fallback includes `operator_surface_label_style_defaulted` diagnostics rather than silently emitting a generic grey projection.
- No source change was needed for this task.

## Verification

- `pnpm --dir packages/layers/cli test test/commands/operator-surface.test.ts -t "affinity colors|default label style fallback|explicit identity label style"` passed: 3 tests, 68 skipped.
- `pnpm --dir packages/layers/cli typecheck` passed.

## Acceptance Criteria

- [x] Role/site affinity colors project into label style when identity style is absent.
- [x] Explicit identity label style wins over inherited role/site color.
- [x] Default label style fallback emits diagnostic instead of silent grey fallback.
