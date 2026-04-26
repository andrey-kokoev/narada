---
status: accepted
closes_tasks: [593]
range: 593-593
accepted_at: 2026-04-26T19:36:04.392Z
accepted_by: codex
---

# Chapter Closure: Windows Site Authority Loci

## Decision

Accept Task 593 and close the Windows Site Authority Loci chapter.

## Basis

- `@narada2/windows-site` now has explicit user/PC authority-locus types.
- Windows Site configs can carry an optional `locus` field while preserving compatibility for omitted legacy configs.
- Defaulting and validation helpers cover omitted, user, and PC loci.
- Windows Site docs and product bootstrap docs explain that Windows substrate variant and authority locus are separate axes.
- Focused package build and unit tests passed.

## Residuals

- Runtime behavior, registry materialization, path resolution, daemon behavior, and CLI flags remain intentionally unchanged.
