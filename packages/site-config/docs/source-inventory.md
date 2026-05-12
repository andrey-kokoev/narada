# Site Config Source Inventory

Task: `narada-proper.task-0037`

This inventory records external orientation evidence used for the package-local Site config first slice. The evidence is not Narada proper truth and does not admit target Site mutation authority.

## Considered Evidence

- `narada-andrey:docs/site-config/site-registry-capability-current-state-contract.md`
- `narada-andrey:docs/site-config/registered-site-probe-protocol.md`
- `narada-andrey:tools/site-config/validate-site-config.mjs`
- `narada-andrey:tools/site-config/site-registry-awareness-contract.test.mjs`
- `narada-andrey:tools/site-probe/site-probe-mcp-server.mjs`
- `narada-andrey:tools/site-probe/site-probe-mcp-server.test.mjs`
- `narada-proper:docs/product/site-governance-coordinates.md`

## Lifted

- Local Site registry awareness entry shape.
- Explicit capability edge and capability denial accounting.
- Read-only registered Site probe request/report contracts.
- Refusal guards for unregistered roots without basis, target mutation, arbitrary client-file scans, runtime state import, and credentials.

## Refused

- Target Site config mutation.
- Arbitrary client/project data scanning.
- Target task/inbox DBs, histories, deployments, secrets, credentials, trust records, or runtime state.
- Relationship labels as capability inheritance.

## Package Claim

`@narada2/site-config` now carries descriptor/contracts/tests for Site registry awareness and read-only registered Site probe posture. Receiving Sites still own local config writes, live probe execution, trust records, MCP registration, and any target-rooted mutation authority.
