# Task 1241 `.narada` Site Doctrinal Review

## Scope

Review target: `D:\code\narada\.narada`.

Source plan: `.narada/audit/task-1239-doctrinal-review-plan.md`.

Sampling method:

- Parsed `.narada/site.json`.
- Parsed `.narada/capabilities/mcp-surfaces.json`.
- Searched `.narada/` for doctrine-sensitive terms: admitted/non-admitted boundaries, native shell, raw WSL, source Site state, runtime state, operator-surface runtime, PC-locus, shortcuts, credentials, secrets, capability state, blocked/deferred posture.
- Reviewed representative admission decisions, audit records, crew descriptors, bootstrap policy, hydration/storage descriptors, inbox protocol, and live-carrier audit entries.

## Doctrine Lenses

- Authority-homogeneous zones and governed crossings.
- Intelligence-Authority Separation.
- Plural Embodiment, Singular Authority.
- Inhabited Evolution.
- Canonical Mutation Evidence.
- Capability Lifecycle.
- Governed Crossing.

## Findings

### P1: `mcp-surfaces.json` Native Shell Policy Is Stale Relative To Site Authority

`.narada/site.json` now records the Windows-native Narada proper authority root and explicitly denies native shell by default except break-glass operator authorization:

- `agent_execution_policy.default_posture = mcp_only`
- `agent_execution_policy.native_shell.granted = false`
- `agent_execution_policy.shell_like_operations.direct_native_shell = denied_by_default`

However, `.narada/capabilities/mcp-surfaces.json` still records:

- `native_shell_policy = unknown_until_admitted`

Risk: agents may read the capability projection as less settled than the Site authority seed and continue to report native shell posture as unknown rather than denied-by-default with recorded break-glass exception.

Recommended follow-up: reconcile `.narada/capabilities/mcp-surfaces.json` so the capability projection derives from `.narada/site.json` and states denied-by-default native shell posture.

## Coherent Postures Observed

- `.narada/site.json` clearly declares `D:\code\narada` as the Windows-native Narada proper authority root and demotes `/home/andrey/src/narada` from prior canonical authority.
- `.narada/site.json` preserves non-admissions for narada-andrey mutation authority, source Site runtime state import, runtime DB/task/inbox/roster/checkpoint/operator-surface/PC/secrets state import, raw WSL mutation authority, and unrecorded native shell fallback.
- `.narada/crew/README.md` correctly frames crew entries as launch intents/templates rather than `.lnk` files or process-start side effects, and explicitly refuses direct substrate shortcut execution, native shell fallback, PC-locus mutation, operator-surface runtime copying, Windows shortcut creation, source Site runtime import, secrets, credentials, and implicit capability grants.
- `.narada/inbox/README.md` and `.narada/inbox/external-handoff-protocol.md` preserve external packets as pending evidence rather than local truth.
- `.narada/admission/live-carrier-audit.jsonl` provides append-only evidence for prior local live-carrier mutations.
- `.narada/capabilities/mcp-surfaces.json` accurately records admitted first-slice task lifecycle MCP live tools: `site_task_lifecycle.plan_init`, `site_task_lifecycle.admit_task`, and `site_task_lifecycle.read_task`.
- `.narada/agent-context/doctrinal-corpus.json` points to Windows-native doctrine sources and explicitly refuses narada-andrey/operator-surface/PC/secrets state import.

## Non-Findings

- No reviewed `.narada` artifact silently grants narada-andrey mutation authority over Narada proper.
- No reviewed `.narada` artifact treats copied source Site runtime state as Narada proper truth.
- No reviewed crew descriptor creates a Windows `.lnk`, starts a process, or mutates PC-locus state.
- No live runtime state, credentials, PC-locus state, or operator-surface runtime was mutated by this review.

## Residual Risks

- `.narada` contains many historical audit and task artifacts; this review sampled posture-bearing records and did not formally prove every historical audit entry.
- The site-local agent-context/checkpoint/hydration MCP path remains intentionally incomplete as capability state, not a review defect.

## Verification

- `Get-Content .narada/site.json -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 20`
- `Get-Content .narada/capabilities/mcp-surfaces.json -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 20`
- `rg "not admitted|not_admitted|native shell|raw WSL|source Site|runtime state|operator-surface runtime|PC-locus|shortcut|\\.lnk|credential|secret|capability|mcp_surfaces|status|blocked|deferred" .narada -n`
