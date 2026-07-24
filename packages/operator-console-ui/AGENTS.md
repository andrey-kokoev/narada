# AGENTS.md - @narada2/operator-console-ui

The browser Operator Console UI: cross-Site observation and audited-control pages served by the Narada CLI console server. Package metadata in `package.json` (`narada` block) is authoritative: `package_role: private_operator_surface_ui`, `surface: operator_console`, `presentation_only: true`, `authority_owner: @narada2/cli`.

For kernel and workspace rules, read the parent authorities first:

- `../../AGENTS.md` (narada-root) — invariants, verification ladder, task contract
- `../operator-console-contract/AGENTS.md` — the shared surface catalog and v3 route directory this UI consumes

## Package Role

It owns:

- Vue rendering of the console pages: Site registry (`/console/registry`), registry add/manage, Site Runtime (`/console/launch`), and the read-only Agent Sessions inventory;
- per-domain browser plumbing under `src/{site-registry,agent-sessions,launcher}/` (adapter, transport, composables, projections);
- the per-site launch/ensure action on the registry detail panel (`src/site-registry/composables/useSiteLaunch.ts` → `POST /console/registry/api/sites/:id/launch`, plan-first dry-run, apply behind an operator confirm);
- route-directory consumption and navigation (`src/console/routes.ts`, `src/console/route-directory.ts`).

It does not own:

- the surface catalog, route directory contract, or wire records — `@narada2/operator-console-contract` owns those; never keep a second surface list here;
- the HTTP API, Site Registry, or any mutation authority — `@narada2/cli` (`console-server*.ts`) owns those;
- Site, session, or artifact state; this package is presentation-only.

## Boundary Rules

- Read-only observation: GET responses from the console server are projections; rendering must not synthesize or repair missing authority fields.
- Mutations (registry add/manage, control actions) cross to the server through the contract-bound endpoints only; no direct Site or session writes from UI code.
- Navigation targets come from the v3 route directory and are same-origin, workspace-relative paths; reject external or protocol-relative URLs rather than following them.
- The Agent Sessions page renders the redacted `OperatorSessionWireRecord`; session authority stays in the NARS session-authority registry, while the session index is an inventory/projection — no lifecycle control from this UI.

## Verification

```text
pnpm --filter @narada2/operator-console-ui test
pnpm --filter @narada2/operator-console-ui typecheck
```

`test` runs `vue-tsc` first, then node:test suites including `test/architecture-boundary.test.ts`, which enforces the presentation-only boundary. Build (`vite build`) produces the `operator-console` launch artifact in `dist/`; `postbuild` writes the launch-artifact record via `../layers/cli/scripts/write-launch-artifact.mjs`.
