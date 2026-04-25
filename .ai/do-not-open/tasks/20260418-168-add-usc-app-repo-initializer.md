# Task 168: Add USC App Repo Initializer

## Context

Task 167 equips `narada.usc` with `pnpm usc:init` for starting a construction session inside the substrate repo.

That solves session initiation, but a brand-new user who wants to create a concrete USC app still needs to manually create a separate app repo.

The intended repository split is:

```text
narada.usc              # reusable USC substrate
narada.usc.<app-name>   # concrete system constructed under USC discipline
```

Manual app repo creation is unnecessary friction and risks inconsistent structure.

## Goal

Add a user-facing app repo initializer to `narada.usc`.

The tool should create a new concrete app repo scaffold while preserving the semantic boundary:

- `narada.usc` remains reusable substrate
- `narada.usc.<app-name>` contains product/app work and app-specific USC artifacts

This is not a runtime. It should not execute tasks, call agents, or create GitHub repositories unless explicitly documented as out of scope for v0.

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Deliverables

### 1. Add `usc:init-app` command

Add package script:

```json
{
  "scripts": {
    "usc:init-app": "node scripts/init-app.mjs"
  }
}
```

Keep existing scripts.

### 2. Add app initializer script

Add:

```text
scripts/init-app.mjs
```

Command shape:

```bash
pnpm usc:init-app -- --name <app-name> --target <path> [--principal <name>] [--intent <text>] [--cis] [--git] [--force]
```

Behavior:

- refuse missing `--name`
- refuse missing `--target`
- refuse to overwrite existing non-empty target unless `--force`
- create target directory
- create app repo scaffold:
  - `README.md`
  - `AGENTS.md`
  - `usc/`
  - `usc/construction-session.md`
  - `usc/decision-surface.md`
  - `usc/task-graph.json`
  - `usc/construction-state.json`
  - `usc/reviews/`
  - `usc/residuals/`
  - `usc/closures/`
  - `usc/policies/` if `--cis`
- optionally initialize git when `--git` is passed
- do not create a GitHub repo

### 3. App scaffold semantics

Generated `README.md` must explain:

- this is a concrete USC app repo
- reusable USC substrate lives in `narada.usc`
- app-specific construction state lives under `usc/`
- product code should live outside `usc/`

Generated `AGENTS.md` must tell agents:

- use `usc/` artifacts for construction discipline
- do not create derivative task status files
- preserve authority, evidence, review, residual distinctions
- do not place private secrets in public artifacts

### 4. Validation support

Generated app repos need a minimal validation story.

Choose one:

#### Option A: Copy validator

Copy enough schemas and validator script into the app repo so it can run locally:

```bash
pnpm validate
```

#### Option B: Reference substrate

Generate a clear note that validation is performed from `narada.usc` and requires a path argument.

If choosing Option B, extend `scripts/validate-json-schemas.mjs` to validate an external app repo path:

```bash
pnpm validate -- --app ../narada.usc.my-app
```

Recommendation: choose Option B for v0 to avoid duplicating schemas.

### 5. App repo naming policy

Document expected naming:

```text
narada.usc.<app-name>
```

Do not enforce this too hard. Warn if target basename does not match, but allow explicit override.

### 6. Documentation

Update `README.md` with a “Create a USC app repo” section:

```bash
pnpm usc:init-app -- --name my-app --target ../narada.usc.my-app --principal "Alice" --intent "Build app X" --cis --git
pnpm validate -- --app ../narada.usc.my-app
```

Explain when to use `usc:init` versus `usc:init-app`:

- `usc:init`: session inside substrate repo
- `usc:init-app`: new concrete app repo

Update `AGENTS.md` to tell agents to use `usc:init-app` rather than hand-rolling app repos.

## Non-Goals

- Do not create GitHub repositories.
- Do not push to remotes.
- Do not add CI or GitHub Actions.
- Do not execute construction tasks.
- Do not call LLMs or agents.
- Do not add a database.
- Do not add TypeScript.
- Do not modify Narada.
- Do not create derivative task status files.

## Acceptance Criteria

- `pnpm usc:init-app -- --name smoke-app --target /tmp/narada.usc.smoke-app --principal "Test Principal" --intent "Test app" --cis --git` creates a coherent app repo scaffold.
- Generated app repo has `README.md`, `AGENTS.md`, and `usc/` artifacts.
- Running the command again without `--force` refuses overwrite.
- App construction JSON validates either directly or through substrate validation.
- `pnpm validate` still passes for substrate examples.
- If external app validation is implemented, `pnpm validate -- --app /tmp/narada.usc.smoke-app` passes.
- Working tree is clean after commit.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
pnpm usc:init-app -- --name smoke-app --target /tmp/narada.usc.smoke-app --principal "Test Principal" --intent "Test app" --cis --git
pnpm validate
pnpm validate -- --app /tmp/narada.usc.smoke-app
node scripts/init-app.mjs --name smoke-app --target /tmp/narada.usc.smoke-app
rm -rf /tmp/narada.usc.smoke-app
git status --short
```

The second init command should fail/refuse overwrite.

## Output

### Commit

- **Hash:** `20292f607038b0000e7907aa6bf28e8fe28d4e32`
- **Message:** `Add USC app repo initializer`

### Files Added/Changed

**New:**
- `scripts/init-app.mjs` -- creates app repo scaffold with README.md, AGENTS.md,
  usc/ directory, templates, starter JSON, optional CIS policy, optional git init

**Modified:**
- `package.json` -- added `usc:init-app` script
- `scripts/validate-json-schemas.mjs` -- added `--app <path>` support for validating
  external app repo JSON
- `README.md` -- documented app repo creation flow
- `AGENTS.md` -- directed agents to use `usc:init-app`

### Verification

```bash
pnpm usc:init-app -- --name smoke-app --target /tmp/narada.usc.smoke-app --principal "Test Principal" --intent "Test app" --cis --git
# App repo created with CIS policy and git init

pnpm validate
# All substrate validations pass

pnpm validate -- --app /tmp/narada.usc.smoke-app
# PASS app/narada.usc.smoke-app/usc/construction-state
# PASS app/narada.usc.smoke-app/usc/task-graph

node scripts/init-app.mjs --name smoke-app --target /tmp/narada.usc.smoke-app
# refuses overwrite (expected)

rm -rf /tmp/narada.usc.smoke-app
```

### Residual Work

None. All 6 deliverables completed.
