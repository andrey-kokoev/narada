# Site Factorization

A Narada **Site** is a governed authority object with one or more concrete realizations and declared interfaces for admissible crossings.

This document separates the dimensions that often collapse into the word "Site."

The admissible-crossing language is grounded in Governed Crossing: arrival is not admission, capability is not authority, and crossing is governed before consequence. See [`../concepts/governed-crossing.md`](../concepts/governed-crossing.md).

## Ten-Part Factorization

| Dimension | Meaning | Not The Same As |
| --- | --- | --- |
| Authority object | The governed object that owns truth for declared transition classes. | Folder, process, registry row, or Git repo. |
| Realization / runtime locus | Concrete embodiment through which bounded Cycles execute: filesystem root, SQLite DB, Cloudflare Durable Object, WSL daemon, Windows scheduled task, hosted service. | The Site's authority by itself. |
| Operation binding | The Aim or Operation the Site currently hosts or supports. | The Site itself. |
| Interface | Admissible arrows into or out of the authority object: inbox submit, task lifecycle command, file-drop ingest, pub/sub receive, operator control API, effect queue. | Permission to mutate without crossing law. |
| Projection | Read-only or advisory representation: User Site awareness, operator console, dashboard, Git clone, Windows/WSL path view. | Authority source. |
| Crossing | Typed morphism with authority semantics: propose, publish, subscribe, absorb, clone, migrate, route, admit, execute, verify, refuse. | Raw data transfer. |
| Lineage | Durable append-only record of crossings that change object relationships or authority posture. | Decorative graph. |
| Sync posture | How portable handoff happens: local-only, git-backed, cloud-synced, projected, hybrid. | Ownership. |
| Execution surface | Where a command runs. | The target authority of the command. |
| Local governance materializations | Config, inbox, tasks, chapters, arcs, KB, traces, logs, runtime DBs, templates, and tools. | The definition of Site. |

## Core Rule

```text
Site authority is not inferred from location, process, visibility, registry membership, or convenience.
It is declared by the Site authority object and exercised only through declared interfaces and governed crossings.
```

## Runtime Locus

A runtime locus is a realization of a Site: the concrete place where bounded Cycles may execute and where local substrate bindings live.

The runtime locus can be:

- a filesystem root plus SQLite stores;
- a Git-backed ops repo;
- a Windows PC-locus runtime;
- a WSL daemon environment;
- a Cloudflare-backed hosted realization;
- a hosted service with a control API.

The runtime locus matters operationally, but it is not the full Site definition.

## Collapse Risks

| Collapse | Correction |
| --- | --- |
| Folder = Site | Folder is one possible realization. |
| Git repo = authority | Git repo can be sync posture, evidence store, or realization, not automatic owner. |
| Registry row = Site | Registry row is a projection or discovery record. |
| Runtime = authority | Runtime executes; authority comes from declared crossing law. |
| Inbox message = admitted knowledge | Inbox items are inert until promoted/admitted. |
| Subscription = trust | Subscription is influence-only delivery unless admitted. |
| Clone = second authority | Clone must declare read-only, forwarding, independent authority, or migration posture. |
| Console action = direct mutation | Console routes audited control requests to Site-owned interfaces. |

## Worked Example: `narada.sonar`

`narada.sonar` can be described without collapse:

| Dimension | `narada.sonar` Reading |
| --- | --- |
| Authority object | Sonar support operation locus governing its Site-local policies, evidence, and task/briefing posture. |
| Realization | WSL Git repo plus Site-local mailbox state root and local command surfaces. |
| Operation binding | Sonar support and mailbox/briefing Operations. |
| Interfaces | Repo-local CLI, config, drafts, supervisor/runtime commands, canonical inbox when present. |
| Projections | User Site awareness entry, possible operator console registry row, Git remote. |
| Crossings | Tool catalog binding, inbox proposals to Narada proper, User Site review notes, publication of observations. |
| Lineage | Currently implicit in docs/tasks; should become explicit Site relation and lineage records when relating to other Sites. |
| Sync posture | Git-backed project/Site repository plus local runtime state. |
| Execution surface | WSL shell and package scripts. |
| Local governance materializations | `.ai` task state, docs, KB, scripts, traces, runtime DBs. |

## Worked Example: Windows User / PC Sites

A Windows User Site and PC Site are related but not identical:

| Dimension | User Site | PC Site |
| --- | --- | --- |
| Authority object | Operator-profile locus for awareness, routing, preferences, and personal governance. | Machine-locus Site for PC-specific tools, schedules, diagnostics, and recovery authority. |
| Realization | User profile folder, Git-backed User Site, local config. | `C:\ProgramData\Narada\sites\pc\<pc-id>` or equivalent machine-root realization. |
| Operation binding | User-level coordination across Sites. | Machine maintenance and local automation Operations. |
| Interfaces | Inbox, task lifecycle, awareness registry, proposal routing. | Doctor, scheduler, machine tools, PC diagnostics, local runbooks. |
| Projections | Awareness of PC Site, project Sites, client Sites. | Machine health and tool availability projected to User Site. |
| Crossings | User proposal to PC Site, PC observation to User Site, tool admission, recovery request. | Observation publication, recovery execution, tool result handoff. |
| Lineage | Records that this User Site knows or routes to this PC Site. | Records machine-local template/materialization lineage. |

The User Site may know about the PC Site. It does not become the PC Site's mutation authority by knowing it.

## Relationship To Existing Surfaces

- Site bootstrap creates or discovers realizations for a Site authority object.
- Site registry and User Site awareness are projections and routing aids.
- Site lifecycle transformations are governed crossings over Site authority objects.
- Site provenance lineage records crossings that affect Site relationships or authority posture.
- Site pub/sub delivers inert signals; receiving Sites govern admission.
- Site relation ledger records durable relation evidence without moving authority.

## Migration Note

Existing docs, configs, and commands may still use `site_root` or "runtime locus" as shorthand. That is acceptable for CLI compatibility.

New doctrine and operator-facing explanations should preserve the factorization: `site_root` is a realization coordinate, not the Site's complete identity.

For client/business workspaces, the default realization coordinate is contained:

```text
workspace_root = visible client/business folder
site_root = workspace_root/.narada
```

The workspace may contain contracts, reports, PBIX files, spreadsheets, code, or other business artifacts. Those artifacts are not Narada knowledge, evidence, or authority merely because a Site inhabits the workspace.

For existing project repositories, use the same containment shape but with project authority language:

```text
workspace_root = existing project Git repo
site_root = workspace_root/.narada
site_kind = project
sync.posture = git_backed_project_repo
```

Project source code remains project-owned. The contained Site governs project-local construction memory and intake, not global Narada doctrine or external capabilities.
