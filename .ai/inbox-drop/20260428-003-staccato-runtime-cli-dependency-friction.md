# Staccato Runtime CLI Dependency Friction

Kind: observation
Source: codex-user-site
Authority: agent_reported
Principal: codex

## Observation

The Staccato Narada mailbox runtime state is healthy enough when inspected directly:

- runtime state root: `C:/Users/Andrey/Narada/runtime/staccato/mailboxes/staccato-narada`
- last run: `2026-04-28T20:06:03Z`
- Kimi runtime health: healthy
- synced messages: 3
- one governed `draft_reply` outbound handoff was confirmed as an Outlook draft
- no pending outbound handoffs
- no stuck outbound items
- one `failed_retryable` work item remains due to `Charter declared clarification_needed`

However, Staccato's operator commands fail because its `.narada/package.json` delegates to `D:/code/narada/packages/layers/cli/dist/main.js`, and that built CLI currently fails at module load:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@narada2/task-governance'
imported from D:\code\narada\packages\layers\cli\dist\commands\site-immune-scan.js
```

This means a downstream Site can have valid runtime state while losing its ergonomic operator surface because Narada proper's current Windows CLI embodiment is not loadable.

## Why This Matters

This is an embodiment/factorization issue, not merely a package error:

- Staccato is a client-service Site.
- Its runtime state is separate and coherent.
- Its operator command surface is delegated to Narada proper's Windows clone.
- When the delegated CLI embodiment is broken, the Site appears unhealthy from ordinary commands even though the mailbox runtime substrate is inspectable and mostly healthy.

## Suggested Follow-Up

When implementing embodiment-aware authority routing and preflight, include delegated toolchain health:

- report whether the Site's configured Narada CLI embodiment can load
- distinguish runtime health from operator-surface health
- expose a fallback direct-state inspection path where safe
- prevent downstream Sites from silently depending on a broken Narada proper build without a clear diagnostic

This should likely be considered alongside the active task-governance package split/reconciliation work.
