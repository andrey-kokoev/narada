---
status: opened
---

# Define typed MCP surfaces starting with Inbox MCP and EE-MCP

## Goal

Update Narada MCP doctrine so Sites expose typed MCP surfaces by purpose, authority boundary, and runtime embodiment instead of implying one monolithic MCP surface.

## Context

Source inbox envelope env_ed940ea1-6351-4422-ab36-b76141e99b78 in commit 03e52a3 proposes typed Narada MCP surfaces. Review verdict: coherent and worth admitting as Narada proper doctrine work before User/PC Sites build broader MCP machinery. Existing narada-mcp-facade doctrine already states MCP is a facade/control channel and not a second authority surface; this task should refine that into typed surface categories.

## Required Work

1. Update docs/concepts/narada-mcp-facade.md to state that a Site may expose zero, one, or many MCP surfaces, each typed by purpose, authority boundary, and runtime embodiment. 2. Define Inbox MCP as the smallest governance-oriented MCP surface for canonical inbox envelope submission plus schema, doctor, readiness, and read-only inspection. 3. Define Embodiment Execution MCP, abbreviated EE-MCP, as a bounded execution surface for a declared embodiment such as windows-pwsh or wsl-bash, with command class restrictions, cwd policy, environment policy, timeout, output limits, authority posture, and evidence logging. 4. State the anti-collapse rule: Inbox MCP admits messages or proposals into target Site inbox authority; EE-MCP requests embodied execution through CEIZ or equivalent command-execution law; neither bypasses target Site admission. 5. Preserve runtime-locus policy: MCP process launch and supervision belongs to the execution-machine User or PC Site, while target Site policy owns admission and consequence. 6. Define capability announcement posture: typed MCP surfaces must be capability-announced and inspectable, not assumed from the mere presence of an MCP server. 7. Link to related doctrine: Command Execution Intent Zone, Site Governance Coordinates, Operator Surface, and Canonical Inbox where relevant. 8. Add a small operator-facing example showing a User or PC Site launching separate Inbox MCP and EE-MCP surfaces for Narada proper or another target Site. 9. If implementation work is discovered, create follow-up tasks rather than smearing implementation into this doctrine task.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] MCP facade docs define typed MCP surfaces and explicitly reject monolithic MCP-by-presence assumptions.
- [ ] Inbox MCP is defined with scope, authority posture, and allowed initial capabilities.
- [ ] EE-MCP is defined with embodiment, command-execution, timeout, output-admission, and evidence boundaries.
- [ ] Docs preserve execution-machine runtime locus policy and target Site admission authority.
- [ ] Capability announcement and inspection are required before clients assume a typed MCP surface exists.
- [ ] Related doctrine links are updated or clearly referenced.
