# AGENTS.md - @narada2/operator-console-contract

Shared UI-neutral descriptors for the Narada Operator Console surface catalog: concepts, ownership, authority, projection, intent admission, routes, and default availability. Package metadata in `package.json` (`narada` block) is authoritative: `package_role: shared_operator_domain_and_wire_contract`, `surface: operator_console`, `authority_owner: @narada2/cli`.

For kernel and workspace rules, read `../../AGENTS.md` (narada-root) first.

## Package Role

It owns:

- the operator surface catalog (`operatorSurfaceDescriptors`) and availability/route projections;
- the `v3` route directory, authoritative for browser workspace handoff, including route path constants (`OPERATOR_CONSOLE_PATH`, registry/launch/sessions paths, `OPERATOR_WORKSPACE_ROUTE_DIRECTORY_PATH`);
- the redacted `OperatorSessionWireRecord` used by the read-only Agent Sessions inventory.

Consumers: `@narada2/cli` console server, `@narada2/operator-console-ui`, and the Cloudflare NARS projection (`/api/nars/workspace/routes`). No consumer may keep a second list of operator surfaces.

It does not own:

- HTTP serving or request handling (CLI console server);
- browser rendering (`operator-console-ui`);
- Cloudflare route publication lifecycle (bridge-owned);
- Site or session authority.

## Boundary Rules

- A surface entry must identify authority locus, projection owner, intent binding, and diagnostic/replacement status; consumers reject directories that omit those fields rather than inventing them from the URL.
- The directory and every route carry explicit host references — a route is never silently treated as local when its authority is Cloudflare-hosted.
- Route paths are constrained to same-origin, workspace-relative paths; consumers reject external and protocol-relative navigation targets at this contract boundary.
- The session wire record is redacted and read-only; it must not grow fields that grant lifecycle control.

## Verification

```text
pnpm --filter @narada2/operator-console-contract test
pnpm --filter @narada2/operator-console-contract typecheck
```

`test` runs the node:test suite (`test/index.test.ts`) via tsx; `build` is `tsc -p tsconfig.build.json`.
