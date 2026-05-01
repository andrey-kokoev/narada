---
status: opened
---

# Add mechanical sender identity to operator-surface messages

## Goal

Ensure delivered operator-surface typed messages mechanically carry sender identity so recipients do not infer source from conversational context or focus state.

## Context

Source inbox envelope env_c9e356a6-b7cb-4d12-b039-7c4fc2315b92 reports operator-surface send records metadata but delivered text lacks a sender header, causing ambiguity when asking another agent to reply via the same channel.

## Required Work

1. Distinguish typed operator-surface message delivery from raw input injection. 2. For typed messages, prepend or wrap a compact sender header in delivered text using the resolved sender identity. 3. Record the same sender identity in operator-surface event artifacts. 4. For operator-mediated sends from a live surface, resolve sender from previous foreground binding where available, with explicit fallback. 5. Allow raw input delivery to suppress rendered sender header only when explicitly requested. 6. Add tests covering typed message header, raw input suppression, and event artifact sender consistency.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Typed operator-surface messages visibly include sender identity in delivered text.
- [ ] Event artifacts record the same resolved sender identity.
- [ ] Raw input mode can omit sender header only by explicit raw/keystroke posture.
- [ ] Sender resolution from current or previous foreground binding is documented or implemented with bounded fallback.
- [ ] Tests cover message versus raw input behavior.
