# User Site PC Template Materialization Workflow

This workflow materializes User Site PC templates into concrete local PC-locus Sites.

## Source

- Inbox envelope: env_80475d4f-5064-465d-a0ee-8c2dad4a9c50
- Original branch envelope: env_bb496f3f-5d3a-49f6-b4df-9a6a7d5c1060
- Source ref: agent_report:branch:inbox-pc-template-materialization-proposal:env_bb496f3f-5d3a-49f6-b4df-9a6a7d5c1060

## Goal

Proposal to materialize GitHub-backed User Site PC templates into concrete local PC Sites.

## Workflow

1. Select the User Site template that describes the PC-facing capability.
2. Resolve the target PC identity from explicit Site configuration, not from hostname guesswork alone.
3. Create or update the PC-locus Site under the authority-locus root policy:
   - Windows native PC locus: `%ProgramData%\Narada\sites\pc\{site_id}`
   - WSL or other substrate loci must use their documented Site roots.
4. Materialize the template into the PC Site using sanctioned Site commands and checked-in artifacts.
5. Run `narada sites doctor <site-id> --authority-locus` to validate root policy, registry entry, config identity, and lifecycle schema.
6. Record residuals as Canonical Inbox envelopes or task-governance tasks instead of editing Site state directly.

## Authority Rules

- User-locus Sites own operator memory, preferences, and user-scoped tool policy.
- PC-locus Sites own machine/session state such as display topology, services, scheduled tasks, drivers, and recovery actions.
- Template materialization is a Site configuration crossing; it must leave a durable artifact and a validation trace.
- A hostname / COMPUTERNAME mismatch is an observation, not corruption by itself. The configured Site identity remains the authority.

## Completion Signal

The crossing is complete when the concrete PC Site can pass:

```bash
narada sites doctor <site-id> --authority-locus
```
