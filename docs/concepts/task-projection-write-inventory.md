# Task Projection Write Inventory

## Owner

`writeTaskFile()` is the named compatibility projection writer for markdown task artifacts.

It is not an authority primitive. Command code may call it only after one of these has happened:

- A sanctioned SQLite lifecycle, assignment, report, review, evidence, roster, or reconciliation mutation has already occurred.
- A sanctioned task specification command is explicitly amending authored task specification.

## Current Write Classes

| Class | Commands | Authority Before Projection |
|---|---|---|
| Lifecycle projection | `task claim`, `task release`, `task continue`, `task report`, `task review`, `task close`, `task confirm`, `task reopen`, `chapter close` | `task_lifecycle` plus command-specific admission record |
| Specification amendment | `task amend`, `task evidence prove-criteria` | task specification command or evidence proof command |
| Reconciliation repair projection | `task reconcile repair` | recorded reconciliation finding and repair record |
| Roster compatibility projection | `task roster assign` compatibility path | assignment intent and roster authority |
| Dispatch/recommend helper projection | `task next` compatibility path | assignment or recommendation authority |

## Residual Debt

The write calls are still physically scattered across command files. The semantic owner is now explicit, but a later mechanical cleanup should wrap direct imports so command code calls a more visibly projection-named helper.

That cleanup is mechanical only; it must not change authority semantics.
