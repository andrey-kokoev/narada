# Narada Proper Crew Startup Descriptors

This directory contains repo-local launch intent descriptors for Narada proper crew startup.

These are not Windows `.lnk` files and do not start processes. They are durable requests/templates that a separately admitted local carrier may read when preparing an agent role session.

## Current Posture

- Exposure: `descriptor_only`.
- Default execution posture: MCP-only.
- Target locus: Narada proper.
- Startup requests must preserve identity doctrine: named agent identity, role assignment, and mechanical verification basis are separate fields.
- Missing MCP or hydration capability is a blocker to report, not a reason to fall back to shell startup.

## Not Admitted

- Direct substrate shortcut execution.
- Native shell fallback.
- PC-locus mutation.
- Operator-surface runtime copying.
- Process launch side effects.
- Windows shortcut creation.
- Source Site runtime state import.
- Workboard state import from another Site.
- Checkpoint history import from another Site.
- Secrets, credentials, or implicit capability grants.

## Files

- `architect.startup-request.json`: Narada proper architect startup request descriptor.
- `templates/agent-startup-request.template.json`: reusable template for future role/agent startup descriptors.

Local execution still requires a separate admitted carrier/surface for operator-surface launch/focus/bind, workboard hydration read, and role session start.
