---
status: opened
depends_on: [2188]
---

# Make the WebUI handoff durable, visible, and latency-tolerant

## Goal

The pending projection window drives itself to the session route, waits well beyond normal startup, and never dies silently

## Context

Covers finding 4 from the Site-and-Agent overview review. waitForSessionRoute in packages/operator-console-ui/src/pages/SiteAgentsPage.vue (lines 65-79) polls about 20 times at 500ms then abandons, and startAgent closes the pending window on timeout (lines 105-108). Discovery stops after roughly 10 seconds, shorter than normal runtime startup, and the handoff dies with the console tab.

## Required Work

Make the pending projection window self-driving: its document polls the console route or session endpoint (about:blank inherits the console origin) until the agent-web-ui route exists, then redirects itself. Extend the wait budget well beyond normal startup with an explicit terminal failure state instead of a silent close. Keep a visible starting state on the console page that survives reload (server-side pending record or equivalent) and clears when the session route appears. On terminal failure leave a visible path to the scoped Agent Sessions view.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] UI test: the pending window receives the self-polling document and redirects on success
- [ ] Terminal timeout produces the explicit failure state with the scoped sessions path; no silent window.close abandonment
- [ ] Pending or route endpoint changes covered by console-server tests
- [ ] UI and console-server suites plus tsc green
