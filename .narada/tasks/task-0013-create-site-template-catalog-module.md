# narada-proper.task-0013

Title: Extract create-site template catalog and config normalization module

Goal:
- Move create-site preset/package expansion and validation into reusable CLI-local modules so dry-run and execution paths share one template catalog.

Acceptance:
- Minimal, agent-memory, and task-lifecycle presets normalize through one catalog surface.
- Tests prove dry-run and execute use the same normalized descriptors.
- No runtime state import or live execution.

Blocked by:
- None after task-0012, but should preserve task-0012 behavior.
