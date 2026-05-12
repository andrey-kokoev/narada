# Missing Capabilities

Narada proper does not yet have admitted Site-local machinery for these surfaces:

- inbox admission and read-path MCP;
- task lifecycle initialization, claim, finish, review, close, and work-next MCP;
- agent context hydration and checkpoints;
- checkpoint/resume history;
- native shell policy for Narada proper runtime work.

Until those capabilities are admitted or installed, do not treat narada-andrey MCP surfaces, rosters, inboxes, checkpoints, or task lifecycle databases as Narada proper authority.

Recommended first capability decision: review the pending `@narada/site-task-lifecycle` handoff as a package scaffold candidate, while continuing to reject runtime database or task-history imports.
