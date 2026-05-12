Memory status: external_orientation_pending_admission
Source Site: narada-andrey
Receiving Site: narada-proper
Authority: not admitted as Narada proper truth until recorded in admission ledger

# Narada Proper First Architect Site Exposure Handoff

Prepared by: narada-andrey.Kevin
Date: 2026-05-09
Audience: first `narada.architect` session in `D:\code\narada`
Status: local handoff packet; not itself Narada proper authority

## Handoff Intent

Give the first Narada proper architect session enough context to understand why `D:\code\narada` can look empty from Codex resume and why the absence of `D:\code\narada\.narada` matters.

This packet helps `narada.architect` initialize orientation without copying narada-andrey runtime state or treating narada-andrey as Narada proper authority.

## Situation

Observed from narada-andrey on 2026-05-09:

- `D:\code\narada` is expected to be the Narada proper repo/workspace.
- There was no `D:\code\narada\.narada` Site substrate before this seed.
- Codex resume in that repo could show an empty session.
- Prior WSL/Codex cache may contain context, but cache is not durable Narada proper Site authority.
- Narada proper identities were registered in narada-andrey operator-surface metadata: `narada.architect`, `narada.builder`, and `narada.observer`.
- Those identities were not portable roster authority for Narada proper.
- narada-andrey task history, inbox envelopes, checkpoints, rosters, and SQLite DBs must not be copied into Narada proper as authority.

## Core Interpretation

Narada proper is not merely another checkout to edit from narada-andrey. If it is to become a living Narada Site, it needs its own Site-local substrate under `.narada`.

That `.narada` directory belongs to Narada proper. It is not a mirror of `C:\Users\Andrey\Narada` and not a dump of cached agent memory.

## Authority Boundaries

Treat these as hard boundaries:

- `C:\Users\Andrey\Narada` is the narada-andrey User Site.
- `D:\code\narada` is admitted here only as temporary mutation authority for this seed after explicit operator selection.
- `D:\code\narada\.narada` is the resulting Narada proper seed substrate.
- `C:\ProgramData\Narada\sites\pc\desktop-sunroom-2` is PC-locus runtime state, not portable Narada proper authority.
- WSL/Codex cache is memory residue, not Site authority.
- narada-andrey task history, inbox envelopes, checkpoints, rosters, and SQLite DBs must not be copied into Narada proper as authority.

## First Session Posture For narada.architect

The first Narada proper architect should distinguish:

1. Repo orientation: understand what `D:\code\narada` already contains.
2. Site substrate decision: decide what minimal `.narada` shape Narada proper needs next.
3. Admission: choose which narada-andrey lift packets or upstream candidates are proposals worth admitting.

Do not copy the narada-andrey `.ai`, `.narada`, inbox, task lifecycle DBs, checkpoints, or operator-surface runtime state.

## Suggested First Moves

1. Verify identity and locus.
2. Inspect the repo without unrelated mutation.
3. Review `.narada/admission/pending-handoffs.json`.
4. Admit, defer, or reject one handoff packet with rationale.
5. Decide one missing capability to fill first.

## Current Upstream Candidate Queue From narada-andrey

The following are candidates for Narada proper review, not admitted upstream work:

- Recurring task lifecycle primitive and due-run automation from #519/#520.
- MCP finish/report changed-file evidence controls from #521.
- Closed complete task preflight read-model repair from #522.
- Site embodiment admission packet from #515.
- Pending MCP restart pressure surfacing from #523 after implementation.
- PC-locus MCP runtime registry from #508/#509 only after de-arbitrizing PC-specific paths and evidence.

## What Not To Do

Do not:

- Copy `C:\Users\Andrey\Narada\.ai` into `D:\code\narada`.
- Copy narada-andrey task markdown as Narada proper task authority.
- Copy SQLite DBs, inbox envelopes, checkpoints, or roster runtime state.
- Treat `narada-andrey.Kevin` checkpoints as Narada proper memory.
- Mutate PC-locus runtime state while initializing Narada proper.
- Publish or push Narada proper changes without explicit Narada proper authority.

## Useful Framing

Narada proper needs a first Site substrate because the next architect otherwise has only generic repo context and stale agent cache. The goal is not to make Narada proper a clone of narada-andrey. The goal is to give Narada proper its own durable place to admit proposals, remember decisions, expose capabilities, and host future extracted packages.
