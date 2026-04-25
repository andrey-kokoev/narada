# Task 167: Equip `narada.usc` With User Tools

## Context

`narada.usc` is now a usable public v0 substrate:

- templates
- protocols
- schemas
- full-cycle example
- CIS admissibility policy
- real schema validation through `pnpm validate`

It is ready for human/agent use, but starting a new USC construction session still requires manually copying templates and creating JSON files. That is unnecessary friction.

The repo should gain small user-facing tools that make it easy to initiate and validate a USC construction instance.

## Goal

Add minimal practical tooling to `narada.usc` for starting a USC session from templates.

This is not a runtime. It should not execute tasks, call agents, or manage durable work beyond creating local artifacts.

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Deliverables

### 1. Add `usc:init` command

Add a package script:

```json
{
  "scripts": {
    "usc:init": "node scripts/init-session.mjs"
  }
}
```

Keep existing `validate` script.

### 2. Add session init script

Add:

```text
scripts/init-session.mjs
```

Command shape:

```bash
pnpm usc:init -- --name <session-name> [--principal <name>] [--intent <text>] [--force]
```

Behavior:

- create `sessions/<session-name>/`
- refuse to overwrite existing session unless `--force`
- create subfolders:
  - `reviews/`
  - `residuals/`
  - `closures/`
- copy or render:
  - `construction-session.md`
  - `decision-surface.md`
  - `task.md` as an initial task template or `tasks/README.md` equivalent inside session
  - `review.md`
  - `residual.md`
  - `closure-record.md`
- create starter JSON files:
  - `task-graph.json`
  - `construction-state.json`

The generated JSON should validate with `pnpm validate` if the validator is extended to include generated sessions, or at minimum should parse as JSON and follow the same schema vocabulary.

### 3. Add optional CIS policy inclusion

Support:

```bash
pnpm usc:init -- --name <session-name> --cis
```

When `--cis` is present:

- include the required CIS policy object in `construction-state.json`
- add a note in `construction-session.md` that CIS governs admissibility

Default may be no policy or CIS; choose intentionally and document the choice.

### 4. Add list command if cheap

If straightforward, add:

```json
{
  "scripts": {
    "usc:list": "node scripts/list-sessions.mjs"
  }
}
```

It should list session folders and basic metadata if available.

Do not overbuild this. Skip if it causes complexity.

### 5. Update validation

Extend `scripts/validate-json-schemas.mjs` so it can validate generated session JSON where practical.

Minimum:

- continue validating canonical examples
- validate every `sessions/*/construction-state.json` against `construction-state.schema.json`
- validate every `sessions/*/task-graph.json` against `task-graph.schema.json`

If no sessions exist, validation should still pass.

### 6. Documentation

Update `README.md` with a short “Start a USC session” section:

```bash
pnpm install
pnpm usc:init -- --name my-session --principal "Alice" --intent "..."
pnpm validate
```

Update `AGENTS.md` to tell agents to use `pnpm usc:init` instead of manually copying templates when creating a new session.

## Non-Goals

- Do not create `narada.usc.<app>` repos.
- Do not add CI or GitHub Actions.
- Do not execute tasks.
- Do not call LLMs or agents.
- Do not add a database.
- Do not add TypeScript.
- Do not modify Narada.
- Do not create derivative task status files.

## Acceptance Criteria

- `pnpm usc:init -- --name smoke --principal "Test Principal" --intent "Test intent"` creates a valid session directory.
- Running the command again without `--force` refuses to overwrite.
- `pnpm validate` passes after creating the smoke session.
- Generated JSON uses the same field names as schemas.
- `README.md` documents startup flow.
- `AGENTS.md` directs agents to the tool.
- Working tree is clean after commit.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
pnpm usc:init -- --name smoke --principal "Test Principal" --intent "Test intent"
pnpm validate
node scripts/init-session.mjs --name smoke
rm -rf sessions/smoke
pnpm validate
git status --short
```

The second init command should fail/refuse overwrite. Do not leave `sessions/smoke` committed unless intentionally using it as a fixture. Prefer not committing smoke sessions.

## Output

### Commit

- **Hash:** `f5ea201bdba34c5fd300058e11873d32609acca2`
- **Message:** `Equip narada.usc with user tools`

### Files Added/Changed

**New:**
- `scripts/init-session.mjs` -- creates sessions/<name>/ with templates, starter JSON, subfolders
- `scripts/list-sessions.mjs` -- lists sessions with principal/intent metadata

**Modified:**
- `package.json` -- added `usc:init` and `usc:list` scripts
- `scripts/validate-json-schemas.mjs` -- extended to validate `sessions/*/` JSON
- `README.md` -- documented startup flow with `pnpm usc:init`
- `AGENTS.md` -- directed agents to use `pnpm usc:init`

### Verification

```bash
pnpm usc:init -- --name smoke --principal "Test Principal" --intent "Test intent"
# Session 'smoke' created

pnpm validate
# PASS sessions/smoke/construction-state
# PASS sessions/smoke/task-graph
# All validations passed.

pnpm usc:init -- --name smoke
# Session 'smoke' already exists. Use --force to overwrite.
# Exit code 1 (expected)

rm -rf sessions/smoke
pnpm validate
# All validations passed (no sessions left)
```

Also verified:
- `pnpm usc:init -- --name smoke-cis --cis` creates session with CIS policy included
- `pnpm usc:list` shows both smoke and smoke-cis with metadata
- Generated JSON validates against schemas

### Residual Work

None. All 6 deliverables completed.
