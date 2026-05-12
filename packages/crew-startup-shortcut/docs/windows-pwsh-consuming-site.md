# Windows PowerShell Consuming Site Guidance

Future Windows PowerShell Narada Sites should consume `@narada2/crew-startup-shortcut` from the Narada repo package, not by copying shortcut files or runtime state from an existing Site.

The package provides descriptor contracts only:

- startup shortcut request
- startup plan/status result
- source import refusals
- MCP-only missing capability behavior

Local Sites must separately admit any carrier-specific action:

- Windows shortcut materialization
- operator-surface launch/focus/bind
- workboard hydration read
- role session start

Native PowerShell scripts, `.lnk` files, PC-locus runtime state, workboard state, checkpoint history, and User Site shortcut files are not portable package inputs.
