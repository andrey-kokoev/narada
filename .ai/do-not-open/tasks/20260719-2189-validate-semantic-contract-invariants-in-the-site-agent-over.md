---
status: opened
depends_on: [2187]
---

# Validate semantic contract invariants in the site-agent overview

## Goal

The overview contract enforces semantic invariants between Site, agent, runtime, and session state, not only field shapes

## Context

Covers finding 6 from the Site-and-Agent overview review. packages/operator-console-contract/src/index.ts parseSiteAgentRuntime, parseSiteAgent, parseSiteAgentSite and parseOperatorSiteAgentOverviewWireResponse (lines 257-324) validate shapes only; nothing enforces invariants across Site, agent, runtime, and session state.

## Required Work

Add semantic invariant validation to the contract: running implies exactly one healthy session and a selected_session_id; stopped implies zero sessions, no selected id, and actions.start true; actions.inspect if and only if runtime.state is running; ambiguous implies more than one healthy session id; agent_id equals site_id plus local_agent_id; agent_id unique per site; group_id consistent with site_kind. Export the validator, wire it into the console-server response path so violations become explicit diagnostics or refusals, and into the UI adapter parse path.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Contract tests cover each invariant positive and negative
- [ ] Server surfaces invariant violations as diagnostics or refusals
- [ ] UI adapter flags invariant-violating payloads
- [ ] Contract and console-server suites plus tsc green
