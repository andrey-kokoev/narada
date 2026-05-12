# Windows-Native Setup Posture

Decision: Narada proper proceeds on a Windows-native setup path for current work.

Authority basis:
- Operator instruction on 2026-05-12: migrate fully to a Windows-native setup.
- Current admitted embodiment root is `D:\code\narada`.
- `.narada/site.json` records this Windows path as the active admitted path for the seed/intake/buildout work already performed here.

Consequences:
- Windows-native carriers, CLI shims, MCP surfaces, configuration, and Site setup paths are preferred for current Narada proper execution.
- WSL-to-Windows EE-MCP is not a prerequisite for current Windows-native work.
- Task 1211 (`20260512-1211-admit-wsl-to-windows-ee-mcp-implementation-locus`) is superseded for current work by this Windows-native posture.
- Future WSL runtime work must be admitted separately and must not use raw WSL-to-Windows shell fallback.

Non-goals:
- This decision does not import runtime state from narada-andrey, Narada proper live Site state, PC-locus state, task/inbox histories, rosters, checkpoints, operator-surface runtime, secrets, or credentials.
- This decision does not claim complete Windows-native implementation.
- This decision does not grant arbitrary native shell, raw SQL, cross-Site mutation, or live capability grants.

Next smallest implementation slice:
- Create a Windows-native Site setup carrier/task surface that uses Narada repo package descriptors and admitted Windows transports for greenfield Site creation, with dry-run first and live mutation behind explicit apply authority.
