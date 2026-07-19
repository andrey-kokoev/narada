---
status: opened
depends_on: [2187]
---

# Scope ambiguous inspection to the site agent

## Goal

Ambiguous inspection lands on an Agent Sessions view scoped to the site and agent, not the unscoped global list

## Context

Covers finding 7 from the Site-and-Agent overview review. inspectAgent in packages/operator-console-ui/src/pages/SiteAgentsPage.vue (lines 125-127) redirects choose-session to /console/sessions unscoped, and AgentSessionsPage has no site or agent query filter support.

## Required Work

Redirect ambiguous inspection to the sessions view scoped by site_id and agent identity query parameters. AgentSessionsPage honors the scope: filters the list to matching sessions, shows the active scope, and offers clear-scope. Deep links with the scope reproduce the filtered view.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] UI test: ambiguous inspection navigates to the scoped URL
- [ ] Sessions page filters to exactly the matching site and agent sessions
- [ ] Clearing the scope restores the full list
- [ ] UI suites plus tsc green
