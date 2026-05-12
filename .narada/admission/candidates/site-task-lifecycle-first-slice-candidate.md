# @narada/site-task-lifecycle First Slice Candidate

Status: candidate_packet_pending_implementation
Source Site: narada-andrey
Source packet: `C:\Users\Andrey\Narada\kb\proposals\site-task-lifecycle-first-slice-handoff.md`
Source task: `#436`
Source plan: `#435`
Prepared in Narada proper from external evidence: 2026-05-10

## Goal

Create a small Narada proper package candidate for `@narada/site-task-lifecycle` that can later become a receiving-Site task lifecycle initializer, API, MCP entrypoint, fixture suite, and admission contract.

This candidate is not an implementation and not a bulk import. It exists to define the boundary before any code or state is copied.

## Included Source Artifacts

External source artifacts to inspect as evidence:

- `C:\Users\Andrey\Narada\kb\proposals\site-task-lifecycle-first-slice-handoff.md`
- `C:\Users\Andrey\Narada\tools\task-lifecycle\`
- `C:\Users\Andrey\Narada\tools\task-lifecycle\tests\`
- `C:\Users\Andrey\Narada\tools\task-lifecycle\vendor\task-governance\`
- `C:\Users\Andrey\Narada\tools\task-lifecycle\vendor\control-plane\`
- `C:\Users\Andrey\Narada\tools\task-lifecycle\vendor\charters\`
- `C:\Users\Andrey\Narada\tools\task-lifecycle\vendor\intent-zones\`

Potential helper evidence:

- `C:\Users\Andrey\Narada\tools\incubation\write-file-utf8.mjs`

`tools\inbox\admission-log.mjs` is not included in the first slice unless a lifecycle-only evidence formatter is needed. Inbox bridge behavior belongs in a later `@narada/site-inbox` or integration package.

## Excluded Narada-Andrey State

Do not import or copy:

- `.ai\task-lifecycle.db`
- `.ai\task-lifecycle.db-shm`
- `.ai\task-lifecycle.db-wal`
- `.ai\db\task-lifecycle.db`
- `.ai\do-not-open\tasks\`
- `.ai\state\agent-context.sqlite`
- `.ai\inbox.db`
- `.ai\inbox-envelopes\`
- `.ai\agents\roster.json`
- narada-andrey task history as Narada proper authority
- narada-andrey inbox history as Narada proper authority
- narada-andrey checkpoints
- narada-andrey operator-surface bindings
- PC-locus runtime state under `C:\ProgramData\Narada`
- YASB, Komorebi, HWND, PID, display topology, or overlay runtime evidence
- secrets, tokens, credentials, or private operator preferences

Fixtures may use synthetic task specs and synthetic rosters only. Neutral fixture identities should look like `site-alpha.Ada`, `site-alpha.BuilderOne`, or `site-beta.Reviewer`, not `narada-andrey.*`.

## Expected MCP / Tool Boundary

The eventual package may expose:

- package API: `@narada/site-task-lifecycle`
- MCP entrypoint: `@narada/site-task-lifecycle/mcp`
- optional CLI surface: `narada-task`

Expected responsibilities:

- initialize a receiving Site's task lifecycle store from empty local authority;
- create or validate a local task spec projection directory;
- provide lifecycle mutation services: claim, continue, unclaim, defer, reopen, finish, review, close;
- provide evidence admission and criteria proof plumbing;
- expose workboard and next-action projections;
- expose MCP tool schemas and representative response shapes;
- refuse source-Site runtime DBs and task-history imports by default.

Out of boundary for the first slice:

- inbox admission and read-path authority;
- inbox-to-task bridge materialization;
- agent-context hydration and checkpoints;
- operator-surface carriers and labels;
- shell/test MCP servers;
- PC-locus repair scripts or runtime bindings.

## Verification Shape

Before implementation can be admitted, the candidate needs a focused verification plan proving:

- empty receiving Site lifecycle initialization;
- task spec creation/projection using neutral identities;
- claim, unclaim, continue, defer, reopen, finish, review, and close transitions;
- evidence admission gates and criteria proof behavior;
- workboard or `next` projection;
- preferred-agent mismatch behavior with explicit authority basis;
- migration away from `narada_andrey_task_role_preferences` to a neutral table name;
- MCP tool list and input schema coverage;
- refusal when a caller attempts to import narada-andrey runtime DBs or task history.

Narada-andrey compatibility regression should remain narada-andrey-side evidence: existing narada-andrey task DB and task specs must remain local authority and must not be copied into Narada proper.

## Missing Capability Before Implementation

Narada proper still lacks a full admitted local task lifecycle substrate and a package implementation task surface. Implementation should wait until Narada proper admits a concrete package scaffold task or equivalent code-change locus. The current `D:\code\narada` path is temporary seed/intake evidence scope only unless separately admitted for package implementation.
