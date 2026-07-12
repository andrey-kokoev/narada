# @narada2/workspace-launch-contract

Shared wire types and bounded validators for the launcher session dashboard.

This package owns no launch planning, persistence, process handoff, or browser
rendering. The CLI remains the authority; Vue consumers use the contract to
decode the CLI-owned HTTP projection without importing CLI implementation code.
