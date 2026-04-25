# @narada2/intent-zones

This package owns Narada's reusable intent-zone contracts for local command and test execution.

## Owned Zones

| Zone | Owns |
| --- | --- |
| Testing Intent Zone | Verification request/result shapes, verification run row shape, timeout/scope helpers, output digest/excerpt helpers |
| Command Execution Intent Zone | Command run request/result shapes, side-effect classes, approval posture, output admission profile, execution regime helpers |

## Boundary Rule

Task governance may reference CEIZ/TIZ artifacts as evidence, but it does not own their authority grammar. CLI commands may execute commands or tests, but they do not define the durable zone contracts.

This package is intentionally small: it defines contracts and pure helpers, not process execution, terminal formatting, task lifecycle transitions, or operator approval UI.
