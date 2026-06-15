# narada-andrey MCP Lift Evidence Freshness Audit

Task: 20260516-1364-audit-narada-andrey-mcp-lift-evidence-freshness

Source Site inspected read-only: `C:/Users/Andrey/Narada`

## Source Evidence Refs

- `C:/Users/Andrey/Narada/.narada/capabilities/mcp-surfaces.json` - registry mtime `2026-05-13 20:01:08`, advisory Site-local registry for `narada-andrey`.
- `C:/Users/Andrey/Narada/site-lift/lift-catalog.json` - catalog mtime `2026-05-09 19:35:01`, advisory export manifest.
- `C:/Users/Andrey/Narada/.ai/mcp/*.json` - generated client transport snippets, mtimes `2026-04-30` through `2026-05-08`.
- `C:/Users/Andrey/Narada/tools/mcp-payload-file.mjs` and `.test.mjs` - payload/output-ref helper, mtimes `2026-05-14`.
- Server/test source under `tools/typed-mcp`, `tools/task-lifecycle`, `tools/mcp-servers`, `tools/operator-surface`, `tools/capability-lifecycle`, `tools/site-lift`, `tools/site-probe`, `tools/site-connectivity`, `tools/site-identity`, and `tools/agent-context`.
- Git evidence: latest relevant commit `7e9794b6ffb07f4154550ea1afdec16023f43445` at `2026-05-14T16:45:02-05:00`, `Define MCP ref composition contract`.

## Classification

- Current enough for Narada proper adoption candidates:
  - `tools/mcp-payload-file.mjs` and `tools/mcp-payload-file.test.mjs`: current bounded payload/output-ref pattern, with inline payload limits and staged payload refs.
  - Actual MCP server files and colocated tests with `2026-05-14` mtimes: current implementation evidence for tool surfaces, subject to receiving-Site review.
  - `tools/site-lift/site-lift-mcp-server.mjs`, `tools/site-probe/site-probe-mcp-server.mjs`, `tools/site-connectivity/site-connectivity-mcp-server.mjs`, `tools/site-identity/site-identity-mcp-server.mjs`: current pattern evidence for facade-style MCP servers.

- Stale-but-instructive:
  - `.narada/capabilities/mcp-surfaces.json`: useful declaration of intended surfaces and authority posture, but stale as an exact exposed-tool contract. Examples: inbox server exposes `inbox_acknowledge`, `inbox_dismiss`, `inbox_export_disposition_ledger`, and `capa_related`; task lifecycle server exposes additional lifecycle/search/test tools; site identity exposes signing/verification tools; operator-surface and agent-context expose many more tools than the registry lists.
  - `site-lift/lift-catalog.json`: useful as an adoption manifest and non-portability checklist, but stale as a complete lift contract because current server surfaces changed after its `2026-05-09` mtime.

- Non-portable:
  - `.ai/mcp/*.json`: generated client transport projections carrying `narada-andrey` names and local paths.
  - `config.json` local Site awareness, registered roots, runtime paths, and cross-Site observations.
  - `.ai/task-lifecycle.db`, `.ai/do-not-open/tasks/`, `.ai/inbox-envelopes/`, runtime/checkpoint/log directories, `registry.db`, and local SQLite state.
  - Operator-surface runtime state, PC paths, Windows handles, process state, checkpoints, and generated runtime projections.
  - Source-local identities: `narada-andrey`, `andrey`, `narada-andrey.*`, and task/inbox histories.

- Rejected for Narada proper adoption:
  - Secrets, credential stores, raw payload/output bodies, runtime DBs, task histories, inbox histories, checkpoints, and generated client configs as authority.
  - Dirty worktree state as a global freshness claim. The source worktree has unrelated modified/untracked files, including `tools/task-lifecycle/task-read.mjs`; use named file refs and mtimes, not whole-repo cleanliness.

## Follow-On Evidence Rule

Follow-on Narada proper MCP facade tasks should cite actual server/test files as implementation evidence, use the registry only for declared authority posture, and use the lift catalog only as advisory adoption guidance. No follow-on task should copy source Site runtime state or identities as receiving-Site authority.
