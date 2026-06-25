# Create-Site Options Model

This document designs an agent-ergonomic option model for future `narada cli create site` behavior. The current CLI family is `narada sites init`; this design should be implemented as an evolution or facade over that Site bootstrap path, not as a second authority model.

The primary model is greenfield Site creation from Narada proper templates/catalog. Reusable packages such as `@narada2/site-task-lifecycle` and `@narada2/agent-context-memory` are template components and capability slices, not source-Site exports.

Normal `create site` takes no source Site input. Existing Sites may provide learning or evidence for template design, but they are not runtime inputs to creation. Migration, lift, clone, absorb, import, or Site-to-Site transfer belongs to separate command/design families.

## Command Posture

Preferred user-facing shape:

```powershell
narada sites create --config .\site.create.json --dry-run --format json
narada sites create --preset task-lifecycle --site-id project-alpha --root D:\Sites\project-alpha --dry-run
narada sites create --template narada-proper.templates.site.task-lifecycle.v0 --site-id project-alpha --root D:\Sites\project-alpha --dry-run
narada sites create --config .\site.create.json --execute
```

Compatibility posture:

- `narada sites init` remains the canonical existing bootstrap command.
- `narada sites create` may become an agent-ergonomic planning facade over Narada proper templates/catalog that emits the same execution plan family as `sites init`.
- `--execute` is required for filesystem, DB, MCP, credential, profile, or adapter mutation.
- default mode is dry-run.

## Option Taxonomy

### Site Coordinates

Required or derived:

- `site_id`
- `site_kind`: `user`, `pc`, `project`, `client_service`, `data`, `elt`, `service`, `sandbox`
- `authority_locus`: `user`, `pc`, `project`, `client_service`, `data`, `elt`, `narada_proper`
- `site_root`
- `workspace_root`
- `substrate`: `windows-native`, `windows-wsl`, `macos`, `linux-user`, `linux-system`
- `execution_surface`: `windows_native`, `wsl_assisted`, `wsl_native`, `macos_native`, `linux_user`, `linux_system`
- `sync_posture`: `local_only`, `hybrid_capable_plain_folder`, `git_backed`, `cloud_synced_folder`, `hybrid`

Refusal rule: `authority_locus=pc` must not be inferred from a Windows path alone. PC-locus writes require explicit authority and permission posture.

### Package Slices

Package selection admits only template components: contracts, descriptors, docs, and tests:

- `@narada2/site-task-lifecycle`
- `@narada2/agent-context-memory`

Package slice options:

- `include_contracts`
- `include_docs`
- `include_schema_descriptors`
- `include_mcp_descriptors`
- `include_conformance_tests`

Denied by package selection alone:

- live SQLite mutation;
- runtime DB import;
- MCP transport registration;
- runtime hydration;
- capability grants;
- credential binding.

Package selection is not evidence import. It must not refer to a source Site root, runtime DB, task history, checkpoint history, roster, operator-surface runtime, PC state, secret, or credential.

### Template Catalog

Template/catalog options:

- `template_id`;
- `template_version`;
- `template_components[]`;
- `catalog_ref`;
- `template_evidence_ref`;
- `template_policy_ref`.

Rules:

- templates live in Narada proper docs/packages/catalog artifacts;
- templates may cite prior Sites as learning evidence only;
- templates must not package or depend on prior Site runtime state;
- generated Site plans must record template refs separately from local execution admissions.

### Agent Identities And Roles

Options:

- `named_agents[]`: durable Site-local agent identities.
- `role_assignments[]`: current assignments to roles such as `architect`, `builder`, `resident`, `observer`.
- `role_compatibility_identities[]`: explicit compatibility names such as `site-alpha.architect`, only with admission evidence.
- `claimed_identity_evidence[]`: runtime claims or surface labels, never authority.
- `mechanical_verification_basis`: operator admission, capability grant, runtime binding readback, or test fixture evidence.

Rules:

- named agent identity is not role assignment;
- claimed identity is data, not authority;
- role-name compatibility identities must carry explicit admission refs;
- mechanical verification basis is required when identity affects Site creation output.

### Storage Adapters

Options:

- `storage.intent`: `none`, `descriptor_only`, `local_adapter_planned`, `local_adapter_admitted`
- `storage.driver_preference`: `sqlite3-cli`, `better-sqlite3`, `node:sqlite`, `external`
- `storage.adapter_id`
- `storage.mutation_mode`: `none`, `plan_only`, `execute_with_admitted_adapter`

Rules:

- reusable packages do not own SQLite dependencies;
- DB init descriptors are inert until a local adapter is admitted;
- arbitrary SQL is refused;
- source DB import is refused.

### MCP Registrations

Options:

- `mcp.intent`: `none`, `descriptor_only`, `local_registration_planned`, `local_registration_admitted`
- `mcp.surfaces[]`
- `mcp.transport`
- `mcp.smoke_tests[]`

Rules:

- descriptor packages can supply MCP tool shapes;
- live registration requires Site-local admission and transport evidence;
- cross-Site mutation over MCP is refused unless a future governed crossing exists.

### Capability Policy

Options:

- `capabilities.policy`: `none`, `declare_required`, `admit_local`, `defer`
- `capabilities.required[]`
- `capabilities.denied[]`
- `capabilities.credential_refs[]`

Rules:

- raw secrets never appear in create-site config;
- credential refs are inert until a capability grant is admitted;
- package selection does not grant capability execution.

### Inbox And Task Lifecycle

Options:

- `inbox.enable`: `false`, `drop_only`, `canonical_envelope_intake`
- `task_lifecycle.enable`: `false`, `descriptor_only`, `local_adapter_planned`, `local_adapter_admitted`
- `task_lifecycle.package`: `@narada2/site-task-lifecycle`
- `task_lifecycle.role_enforcement`: `off`, `warn`, `strict`

Rules:

- enabling task lifecycle from the package creates descriptors/plans only by default;
- local DB mutation and MCP `admit_task` require separate adapter and MCP admission.
- `role_enforcement` controls claim/continuation semantics for task `target_role`: `off` treats it as advisory metadata, `warn` allows mismatches with diagnostics, and `strict` blocks mismatches.

### Agent Context Memory

Options:

- `agent_context.enable`: `false`, `descriptor_only`, `local_adapter_planned`, `local_adapter_admitted`
- `agent_context.package`: `@narada2/agent-context-memory`
- `agent_context.checkpoint_policy`: `none`, `manual_descriptor`, `local_persistence_admitted`

Rules:

- checkpoint memory starts as descriptors only;
- source checkpoint history and agent-context DB import are refused;
- runtime hydration execution is separate admission.

### Operator-Surface Relation

Options:

- `operator_surface.intent`: `none`, `declare_relation`, `plan_local_surface`, `admit_local_surface`
- `operator_surface.relation_refs[]`
- `operator_surface.pc_locus_required`: boolean

Rules:

- operator-surface relation declarations are not live runtime bindings;
- PC-locus authority is not assumed;
- HWND, PID, window title, terminal profile, and focus state are carrier evidence, not authority.

### Windows PowerShell Profile

Options:

- `windows_pwsh.profile`: `none`, `emit_example`, `plan_profile_fragment`, `admit_profile_write`
- `windows_pwsh.execution_surface`
- `windows_pwsh.path_style`: `windows`, `wsl_translated`, `mixed_refused`

Rules:

- profile writes require `--execute` and local admission;
- examples may show package consumption commands;
- profile examples must not embed secrets or live Site state paths from another Site.

### Interactive And Noninteractive Modes

Interactive mode:

- prompts for missing Site coordinates;
- offers presets;
- explains package boundaries;
- asks before any live execution;
- emits refusal messages when options imply runtime-state import.

Noninteractive mode:

- reads JSON config;
- requires all authority-bearing choices to be explicit;
- defaults to dry-run;
- exits with structured refusal on ambiguous locus, missing verification basis, source-state import, raw secret, or implied live capability.

## Presets

### minimal Site

Purpose: create Site coordinates and governance skeleton only.

Includes:

- Site identity and root;
- governance coordinates;
- inbox drop optional;
- no task lifecycle, no agent memory, no MCP, no live adapters.

### agent-memory Site

Purpose: Site can later admit agent-context checkpoint memory.

Includes:

- `@narada2/agent-context-memory` descriptors/docs/tests;
- named-agent registry fragment;
- session/checkpoint/hydration contracts;
- schema descriptors;
- MCP descriptor;
- capability fragment.

Excludes live storage, live MCP, runtime hydration, checkpoint import.

### task-lifecycle Site

Purpose: Site can later admit local task lifecycle.

Includes:

- `@narada2/site-task-lifecycle` descriptors/docs/tests;
- task lifecycle setup plan;
- adapter conformance contract;
- DB write request shape;
- MCP descriptor.

Excludes DB mutation, live MCP registration, source task DB/history import.

### site-machinery Site

Purpose: Site can later admit Canonical Inbox, Site configuration awareness, and Site-lift/adoption machinery.

Includes:

- `@narada2/site-inbox` descriptors/docs/tests;
- `@narada2/site-config` descriptors/docs/tests;
- `@narada2/site-lift` descriptors/docs/tests;
- inbox admission request and portable artifact contracts;
- known-Site registry and probe descriptor contracts;
- adoption plan and command packet contracts.

Excludes inbox DB mutation, target Site config mutation, live probe execution, file copy/install/bootstrap, source Site runtime import, and cross-Site mutation.

### full operator-surface-aware User Site

Purpose: user-locus Site with declared operator-surface relation and both package slices.

Includes:

- user authority locus;
- no PC authority assumption;
- task lifecycle descriptors;
- agent-context memory descriptors;
- operator-surface relation declaration;
- Windows PowerShell examples.

Excludes PC runtime mutation, focus/window binding, profile writes, secrets, credential grants, live MCP, and DB mutation unless separately admitted.

## Config Shape

See fixtures:

- [`create-site-minimal.json`](fixtures/create-site-options/create-site-minimal.json)
- [`create-site-agent-memory.json`](fixtures/create-site-options/create-site-agent-memory.json)
- [`create-site-task-lifecycle.json`](fixtures/create-site-options/create-site-task-lifecycle.json)
- [`create-site-site-machinery.json`](fixtures/create-site-options/create-site-site-machinery.json)
- [`create-site-user-surface-aware.json`](fixtures/create-site-options/create-site-user-surface-aware.json)
- [`create-site-refusal-runtime-state-import.json`](fixtures/create-site-options/create-site-refusal-runtime-state-import.json)

Top-level shape:

```json
{
  "schema": "narada.create_site.options.v0",
  "mode": "dry_run",
  "preset": "task-lifecycle",
  "site": {},
  "packages": [],
  "identity": {},
  "storage": {},
  "mcp": {},
  "capabilities": {},
  "inbox": {},
  "task_lifecycle": {},
  "agent_context": {},
  "operator_surface": {},
  "windows_pwsh": {},
  "evidence": {}
}
```

## Dry-Run Plan Output

Dry-run output should include:

- normalized Site coordinates;
- selected preset and expanded options;
- package descriptors selected;
- execution steps classified as `descriptor_only`, `planned`, `requires_admission`, `refused`, or `ready_for_execute`;
- evidence/audit paths that would be written;
- explicit non-import proof;
- refusal list;
- next admitted command, if any.

## Evidence And Audit Output

Create-site execution should emit:

- plan artifact;
- admission decisions for live steps;
- mutation evidence for filesystem writes, DB writes, MCP registration, and profile writes;
- readback evidence;
- package versions and descriptor checksums;
- refusal evidence for denied runtime-state imports.

## Refusal Messages

Refusals should be structured and agent-readable:

- `source_runtime_state_import_refused`
- `raw_secret_in_config_refused`
- `pc_locus_authority_missing`
- `claimed_identity_not_authority`
- `role_compatibility_admission_missing`
- `package_selection_does_not_grant_live_capability`
- `live_adapter_admission_missing`
- `live_mcp_registration_admission_missing`
- `runtime_hydration_admission_missing`
- `cross_site_mutation_not_admitted`

## Windows PowerShell Examples

Descriptor-only task lifecycle:

```powershell
narada sites create --preset task-lifecycle --site-id project-alpha --root D:\Sites\project-alpha --dry-run --format json
```

Descriptor-only agent memory:

```powershell
narada sites create --preset agent-memory --site-id user-alpha --root $env:USERPROFILE\Narada --dry-run --format json
```

Descriptor-only reusable Site machinery:

```powershell
narada sites create --config .\site-machinery.create.json --dry-run --format json
```

Full user-locus plan without PC authority:

```powershell
narada sites create --config .\user-site.create.json --dry-run --format json
```

If the config asks to copy `C:\Users\Andrey\Narada\.ai\state\agent-context.sqlite`, the command must refuse with `source_runtime_state_import_refused` and explain that migration/lift/import is outside `create site`.

## First Implementation Slice

Implemented first slices:

1. Add `narada sites create --dry-run --config <path> --format json`.
2. Parse and validate the config shape.
3. Support descriptor-only presets: `minimal`, `agent-memory`, `task-lifecycle`, and `site-machinery`.
4. Expand Narada proper template/catalog selections to descriptor surfaces.
5. Emit structured dry-run plan and refusal messages.
6. Support shorthand dry-run:
   `narada sites create --preset <preset> --site-id <id> --root <path> --dry-run --format json`.
7. Support shorthand skeleton creation:
   `narada sites create --preset <preset> --site-id <id> --root <path> --format json`.
8. Support task-lifecycle live-carrier orchestration:
   `narada sites create --preset task-lifecycle --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`.
9. Support agent-memory live-carrier orchestration:
   `narada sites create --preset agent-memory --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`.
10. Support site-machinery inbox/config/lift live-carrier orchestration:
   `narada sites create --preset site-machinery --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`.
11. Add tests for preset expansion, template/catalog refs, identity doctrine refusals, source-state refusals, Windows PowerShell path examples, skeleton materialization, and task-lifecycle / agent-memory / site-machinery carrier orchestration.

Current agent-ergonomic shorthand:

```powershell
narada sites create --preset task-lifecycle --site-id project-alpha --root D:\Sites\project-alpha --dry-run --format json
```

Preset discovery:

```powershell
narada sites create-presets --format json
```

The shorthand builds an inline create-site options object from Narada proper templates/catalog. It is still descriptor-only and refuses missing Site coordinates, source Site state, live grants, and runtime imports.

Current capability state:

| Capability | State | Exposure | Operational command |
| --- | --- | --- | --- |
| create-site config dry-run | implemented/trialed | descriptor_only | `narada sites create --dry-run --config <path> --format json` |
| create-site shorthand dry-run | implemented/trialed | descriptor_only | `narada sites create --preset <preset> --site-id <id> --root <path> --dry-run --format json` |
| create-site shorthand skeleton | implemented/trialed | mutating_guarded | `narada sites create --preset <preset> --site-id <id> --root <path> --format json` |
| task-lifecycle live carriers | implemented/trialed | mutating_guarded | `narada sites create --preset task-lifecycle --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json` |
| agent-memory live carriers | implemented/trialed | mutating_guarded | `narada sites create --preset agent-memory --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json` |
| site-machinery inbox/config/lift carriers | implemented/trialed | mutating_guarded | `narada sites create --preset site-machinery --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json` |
| create-site preset catalog | implemented/trialed | read_only | `narada sites create-presets --format json` |

Terminal assessment after `narada-proper.task-0052`: the current first greenfield create-site objective is claimable for target-local Site creation from Narada proper templates/catalog. It covers preset discovery, descriptor dry-run, shorthand skeleton creation, and admitted target-local live carriers for `task-lifecycle`, `agent-memory`, and `site-machinery`.

Task-lifecycle live carrier orchestration creates target-root local artifacts for local DB init, storage hydration, MCP registration descriptor/manifest, and Windows profile binding artifact. It does not mutate private MCP client config or a real Windows profile outside the target Site.

Agent-memory live carrier orchestration creates target-root local artifacts for local DB init, storage hydration, an empty `@narada2/agent-context-memory` store, hydration policy, MCP registration descriptor/manifest, and Windows profile binding artifact. It does not import checkpoint history, execute runtime hydration, persist secrets, mutate private MCP client config, or mutate a real Windows profile outside the target Site.

Site-machinery inbox/config/lift live carrier orchestration creates target-root local artifacts for local DB init, storage hydration, an empty `@narada2/site-inbox` index, inbox publication policy, empty `@narada2/site-config` known-Site registry, site-config probe policy, empty `@narada2/site-lift` adoption catalog, site-lift materialization policy, and Windows profile binding artifact. It does not import inbox history, scan external roots, mutate another Site, admit trust records, copy files, install packages, write portable envelope files, promote tasks, publish Git artifacts, register MCP, mutate private MCP client config, or mutate a real Windows profile outside the target Site.

Blockers before broader live execution:

- capability/secret grant admission;
- operator-surface and PC-locus authority admission.
- real private MCP client registration transport;
- real Windows profile mutation outside target-root artifacts;
- site-config live probe/write beyond target-local empty registry and probe policy artifacts;
- site-lift materialization beyond target-local empty adoption catalog and policy artifacts;
- site-inbox portable envelope publication and task promotion carriers;
- agent-context-memory runtime hydration beyond target-local empty store/policy artifacts.

Non-goal for this slice: any migration/lift/import path from an existing Site. That belongs to separate command design.
