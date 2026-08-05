# AGENTS.md - @narada-core/operator-console-ui

The browser Operator Console UI: cross-Site observation and audited-control pages served by the Narada CLI console server. Package metadata in `package.json` (`narada` block) is authoritative: `package_role: private_operator_surface_ui`, `surface: operator_console`, `presentation_only: true`, `authority_owner: @narada-core/cli`.

For kernel and workspace rules, read the parent authorities first:

- `../../AGENTS.md` (narada-root) — invariants, verification ladder, task contract
- `../operator-console-contract/AGENTS.md` — the shared surface catalog and v3 route directory this UI consumes

## Package Role

It owns:

- Vue rendering of the console pages: Site registry (`/console/registry`), registry add/manage, Site Runtime (`/console/launch`), the read-only Agent Sessions inventory, and the read-only Host Fleet inventory (`/console/fleet`);
- per-domain browser plumbing under `src/{site-registry,agent-sessions,launcher,host-fleet}/` (adapter, transport, composables, projections);
- the per-site launch/ensure action on the registry detail panel (`src/site-registry/composables/useSiteLaunch.ts` → `POST /console/registry/api/sites/:id/launch`, plan-first dry-run, apply behind an operator confirm);
- route-directory consumption and navigation (`src/console/routes.ts`, `src/console/route-directory.ts`).

It does not own:

- the surface catalog, route directory contract, or wire records — `@narada-core/operator-console-contract` owns those; never keep a second surface list here;
- the HTTP API, Site Registry, or any mutation authority — `@narada-core/cli` (`console-server*.ts`) owns those;
- Site, session, or artifact state; this package is presentation-only.
- Host Fleet membership or discovery; `@narada-core/host-fleet` owns the strict host-only read contract.

## Boundary Rules

- Read-only observation: GET responses from the console server are projections; rendering must not synthesize or repair missing authority fields.
- Mutations (registry add/manage, control actions) cross to the server through the contract-bound endpoints only; no direct Site or session writes from UI code.
- Navigation targets come from the v3 route directory and are same-origin, workspace-relative paths; reject external or protocol-relative URLs rather than following them.
- The Agent Sessions page renders the redacted `OperatorSessionWireRecord`; session authority stays in the NARS session-authority registry, while the session index is an inventory/projection — no lifecycle control from this UI.
- The Host Fleet page renders only validated `HostFleetSnapshot` records and must not infer or expose Sites, agents, sessions, or runtimes inside a host.

## Verification

```text
pnpm --filter @narada-core/operator-console-ui test
pnpm --filter @narada-core/operator-console-ui typecheck
```

`test` runs the existing Node-based `vue-tsc` check first, then the Bun test
suite including `test/architecture-boundary.test.ts`, which enforces the
presentation-only boundary. `test:node` retains the complete Node path. Build
uses Bun Vite and its existing Node `postbuild` artifact writer produces the
`operator-console` launch artifact in `dist/`; `build:node` retains the full
Node Vite plus artifact path.
