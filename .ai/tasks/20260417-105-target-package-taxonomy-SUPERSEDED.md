# Target Package Taxonomy — SUPERSEDED

**Date**: 2026-04-17
**Status**: SUPERCEDED by `20260417-106-target-package-taxonomy-corrections.md`

---

## Why Superseded

The initial taxonomy (this file) contained several incorrect mapping decisions that were too broad or blurred architectural boundaries:

1. `src/persistence/` treated as entirely generic — mailbox-specific stores (`messages.ts`, `tombstones.ts`, `views.ts`, `blobs.ts`) were incorrectly mapped to `layers/kernel`
2. `intent/` and `executors/` placed under `layers/foreman` — contradicts the kernel pipeline (`Policy → Intent → Execution → Confirmation`)
3. `facts/` placed in `verticals/mailbox` — generic fact store/types belong in kernel
4. `workers/` placed under `layers/outbound` — worker registry is generic execution infrastructure
5. `logging/`, `metrics.ts`, `tracing.ts` conclusively placed in `layers/observation` — not yet proven
6. `sources/` left ambiguous — deserves its own layer package

## See Also

- **Corrected taxonomy**: `20260417-106-target-package-taxonomy-corrections-EXECUTED.md`
