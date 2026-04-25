# Task 169: Pivot `narada.usc` to Executable Constructor Codebase

## Context

`narada.usc` was initially populated as a public protocol substrate:

- concepts
- protocols
- schemas
- templates
- examples
- validation
- `usc:init`
- planned `usc:init-app`

That is useful, but the intended semantic role is stronger:

```text
narada.usc = code of the Universal Systems Constructor
```

The repo should not merely document USC discipline. It should contain the executable constructor that initializes, validates, and eventually compiles USC-governed system repositories.

The existing protocols/schemas/templates should be preserved as constructor grammar/spec fixtures, not treated as the product itself.

## Correct Semantic Target

```text
thoughts              # theory of USC
narada.usc            # executable USC constructor implementation
narada.usc.<app>      # concrete system constructed/governed by USC
narada                # optional runtime target for compiled operations/charters
```

`narada.usc` must be understood as:

> an executable constructor whose CLI initializes, validates, and eventually compiles USC-governed system repositories.

## Goal

Reframe and restructure `narada.usc` around executable constructor code while preserving existing useful artifacts.

The outcome should make it obvious that:

- the CLI is the front door
- schemas/templates are constructor grammar inputs
- protocols are docs/specs for the constructor
- app repos are generated/governed outputs
- Narada is an optional compile/runtime target, not required

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Target Structure

Move toward:

```text
narada.usc/
  packages/
    core/
      src/
      schemas/
      package.json
    compiler/
      src/
      templates/
      package.json
    cli/
      src/
      package.json
    policies/
      src/
      examples/
      package.json
  docs/
    concepts/
    protocols/
  examples/
  package.json
  pnpm-workspace.yaml
```

This does not need to be a large implementation. It does need to establish the right executable architecture.

## Required Deliverables

### 1. Convert repo to pnpm workspace

Add:

```text
pnpm-workspace.yaml
```

Root `package.json` should remain the user-facing entry for now, but package structure should exist.

### 2. Create `packages/core`

Create `packages/core` as the home of USC construction model and schemas.

Move or copy schemas into:

```text
packages/core/schemas/
```

Add minimal source files:

```text
packages/core/src/index.js
packages/core/src/schema-registry.js
```

Exports should provide at least:

- schema path discovery
- known schema IDs
- validation target definitions used by CLI/compiler

Do not overbuild domain logic yet.

### 3. Create `packages/policies`

Create `packages/policies` as the home of admissibility policy definitions.

Move or copy CIS example/policy into:

```text
packages/policies/examples/cis-required.json
```

Add:

```text
packages/policies/src/index.js
```

Exports should provide at least:

- `cisRequiredPolicy`
- policy IDs/constants

### 4. Create `packages/compiler`

Create `packages/compiler` as the home of artifact generation.

Move or copy templates into:

```text
packages/compiler/templates/
```

Add:

```text
packages/compiler/src/index.js
packages/compiler/src/init-session.js
packages/compiler/src/init-app.js
```

Existing `scripts/init-session.mjs` logic should move here or delegate here.

If Task 168 has not yet executed, add `init-app` as a stub with clear TODO or implement the minimal expected behavior from Task 168 if practical.

### 5. Create `packages/cli`

Create `packages/cli` as the executable entrypoint.

Add:

```text
packages/cli/src/usc.js
```

Command surface should include:

```bash
usc validate
usc init-session --name ...
usc list-sessions
usc init-app --name ... --target ...
```

Root package scripts may call this CLI:

```json
{
  "scripts": {
    "validate": "node packages/cli/src/usc.js validate",
    "usc:init": "node packages/cli/src/usc.js init-session",
    "usc:list": "node packages/cli/src/usc.js list-sessions",
    "usc:init-app": "node packages/cli/src/usc.js init-app"
  }
}
```

The CLI may be JavaScript for now. Do not introduce TypeScript unless justified.

### 6. Move docs under `docs/`

Move top-level conceptual/protocol docs into:

```text
docs/concepts/
docs/protocols/
```

Update links in `README.md` accordingly.

Keep `AGENTS.md`, `README.md`, `LICENSE`, root package metadata at root.

### 7. Preserve compatibility for existing commands

Existing user commands must continue to work:

```bash
pnpm validate
pnpm usc:init -- --name smoke --principal "Test Principal" --intent "Test intent"
pnpm usc:list
```

If `usc:init-app` exists from Task 168, preserve it. If it does not, add it in this task.

### 8. Reframe README

Update `README.md` so the first claim is executable:

```text
narada.usc is the executable implementation of the Universal Systems Constructor.
```

It should explain:

- CLI-first usage
- constructor code vs app repos
- current commands
- future compile target
- relationship to Narada

Avoid describing the repo as merely a substrate.

### 9. Reframe AGENTS.md

Update `AGENTS.md` so agents understand:

- this repo is constructor code
- protocols/schemas/templates are part of constructor grammar
- new behavior should go through packages, not ad hoc scripts
- do not create derivative task status files

### 10. Keep validation real

`pnpm validate` must still perform real schema validation using Ajv.

It should validate:

- examples in `examples/`
- generated `sessions/*` if present
- app repos if `--app` support exists

Schema paths must be updated for the new package layout.

## Non-Goals

- Do not build full USC compiler semantics yet.
- Do not connect to Narada runtime yet.
- Do not create GitHub repositories.
- Do not add CI or GitHub Actions.
- Do not call LLMs or agents.
- Do not add a database.
- Do not create derivative task status files.

## Acceptance Criteria

- Repo structure clearly reflects executable constructor architecture.
- `packages/core`, `packages/compiler`, `packages/cli`, and `packages/policies` exist.
- Existing commands still work:
  - `pnpm validate`
  - `pnpm usc:init -- --name smoke --principal "Test Principal" --intent "Test intent"`
  - `pnpm usc:list`
- If `usc:init-app` is implemented, it works and validates as specified in Task 168.
- `pnpm validate` passes after creating a smoke session.
- Temporary smoke session is removed before commit.
- README no longer frames repo as only protocol substrate.
- Working tree is clean after commit.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
pnpm validate
pnpm usc:init -- --name smoke --principal "Test Principal" --intent "Test intent"
pnpm validate
pnpm usc:list
rm -rf sessions/smoke
pnpm validate
git status --short
```

If `usc:init-app` is implemented:

```bash
pnpm usc:init-app -- --name smoke-app --target /tmp/narada.usc.smoke-app --principal "Test Principal" --intent "Test app" --cis --git
pnpm validate -- --app /tmp/narada.usc.smoke-app
rm -rf /tmp/narada.usc.smoke-app
```

## Output

### Commit

- **Hash:** `1eda66c52732a85a6753958796222a05478a25a0`
- **Message:** `Pivot narada.usc to executable constructor codebase`

### Files Moved/Added/Changed

**Architecture changes:**
- Added `pnpm-workspace.yaml` -- pnpm workspace with 4 packages
- `packages/core/` -- schema registry, validator, construction model
  - `src/schema-registry.js`, `src/validator.js`, `src/index.js`
  - `schemas/` (moved from root)
- `packages/compiler/` -- artifact generation, templates
  - `src/init-session.js`, `src/init-app.js`, `src/index.js`
  - `templates/` (moved from root)
- `packages/cli/` -- executable entrypoint
  - `src/usc.js` -- command dispatcher for validate, init-session, list-sessions, init-app
- `packages/policies/` -- admissibility policy definitions
  - `src/index.js`
  - `examples/cis-required.json` (moved from examples/policies/)
- `docs/concepts/` and `docs/protocols/` -- moved from root concepts/ and protocols/

**Removed:**
- Old `scripts/` directory (init-session.mjs, init-app.mjs, list-sessions.mjs, validate-json-schemas.mjs)
- Root `schemas/`, `templates/`, `concepts/`, `protocols/` directories

**Updated:**
- `package.json` -- scripts now call CLI entrypoint
- `README.md` -- reframed as executable constructor
- `AGENTS.md` -- directed agents to use packages/, not ad hoc scripts
- Example JSON $schema references updated for new paths

### Verification

```bash
pnpm validate                    # all substrate examples pass
pnpm usc:init -- --name smoke --principal "Test Principal" --intent "Test intent"
pnpm validate                    # smoke session validates
pnpm usc:list                    # shows smoke
rm -rf sessions/smoke

pnpm usc:init-app -- --name smoke-app --target /tmp/narada.usc.smoke-app --principal "Test Principal" --intent "Test app" --cis --git
pnpm validate -- --app /tmp/narada.usc.smoke-app   # app validates
rm -rf /tmp/narada.usc.smoke-app
```

All commands pass. Working tree clean.

### Residual Work

None. All 10 deliverables completed.
