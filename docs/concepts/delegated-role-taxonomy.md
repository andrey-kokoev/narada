# Delegated Role Taxonomy

Delegated role taxonomy disambiguates inhabited delegation from low-level effect machinery.

Narada currently admits the inhabited self-build roles `Operator`, `Resident`, `Architect`, `Builder`, and trace substrate. Those remain the stable role set. `builder-worker`, `resident-worker`, and `effect-worker` are admitted here as delegated role categories, not as new default top-level bootstrap roles.

This distinction was earned by inhabited work in the Windows User Site, Staccato Site, and Narada proper build work: a generic `worker` label blurred construction delegation, resident/use delegation, and mechanical effect execution.

## Role Admission Decision

| Category | Decision | Rationale |
| --- | --- | --- |
| `builder-worker` | Admitted as a delegated construction category. | Builder work has repeatedly needed bounded subtask execution without granting Architect posture or whole-task ownership. |
| `resident-worker` | Admitted as a delegated Site-use category. | Resident/use work can require bounded cognitive assistance above mechanical effects while remaining below Site construction authority. |
| `effect-worker` | Admitted as an effect machinery category. | Narada already has outbound workers, process runners, executors, and Cloudflare effect workers; these are runtime effect actors, not inhabited construction roles. |

The plain word `worker` should remain generic prose or low-level runtime vocabulary unless the surrounding context qualifies it. In doctrine and task/bootstrap surfaces, prefer one of the qualified names.

## Definitions

### `builder-worker`

A `builder-worker` is a bounded construction delegate acting under Builder direction for a specific subtask.

Authority posture:

- May implement within an explicitly assigned work slice.
- May run allowed verification for that slice.
- Must report changed files, verification, residuals, and blockers back to Builder.
- Must not widen scope, create doctrine, admit evidence, close tasks, or present itself as Architect or Operator.

Messaging path:

```text
Architect or Operator admits work package
-> Builder owns execution/integration
-> Builder may delegate bounded slice to builder-worker
-> builder-worker reports field evidence to Builder
-> Builder integrates and reports through the governed task path
```

### `resident-worker`

A `resident-worker` is a bounded Site-use delegate acting under Resident direction for ordinary value-producing work inside a Site charter.

Authority posture:

- May perform bounded cognitive or operational use-work, such as organizing observations, drafting local artifacts, preparing campaign materials, or inspecting ordinary Site outputs.
- May surface friction as an observation or proposal through the Site inbox path.
- Must not mutate Site governance, grant capabilities, or execute external effects by role alone.
- Must route construction pressure to Architect or Builder instead of silently becoming them.

Messaging path:

```text
Resident encounters ordinary Site work
-> resident-worker performs bounded use-work or prepares observation
-> Resident or Operator admits any authority-bearing consequence
-> Architect/Builder path is used only when Site structure or implementation must change
```

### `effect-worker`

An `effect-worker` is low-level runtime machinery that performs mechanical effects after a governed intent or command is admitted.

Authority posture:

- Executes only admitted effects such as sending, drafting, moving items, running processes, syncing data, or invoking external APIs.
- Must preserve idempotency, retry, confirmation, and audit boundaries.
- Does not reason about doctrine, interpret Operator pressure, or admit work.
- Is not an inhabited AI role unless a future doctrine pass explicitly creates a separate wrapper role around it.

Messaging path:

```text
Governance admits an Intent or effect command
-> effect-worker executes the mechanical effect
-> confirmation/reconciliation records observed result
-> Trace substrate preserves evidence
```

## Non-Symmetry Rule

The relation can be remembered as:

```text
Architect -> Builder -> builder-worker
Resident -> resident-worker -> effect-worker
```

This is not a claim that every role needs a worker, inspector, manager, or symmetric counterpart. The taxonomy exists only to protect three boundaries already exposed by operations:

- construction delegation under Builder;
- use-work delegation under Resident;
- mechanical effect execution under admitted runtime authority.

Additional roles such as inspector, receptionist, clerk, superintendent, or project manager remain deferred until they satisfy the Role Admission Rule in [`inhabited-evolution.md`](inhabited-evolution.md).

`dharma_observer` is a separate observer role, not an inspector. It observes Narada-law and telos coherence in read-only posture and may submit observations, proposals, or appeals. It must not build, review, close, assign, or mutate implementation state. See [`Dharma Observer Role`](dharma-observer-role.md).

## Relationship To Bootstrap Contracts

Default fresh AI thread bootstrap remains limited to `architect` and `builder` unless a Site explicitly declares a more specific contract.

`builder-worker` and `resident-worker` may appear in Site-local contracts only when:

- the delegating role is named;
- the bounded work slice is named;
- authority limits are explicit;
- handoff expectations are explicit;
- the role cannot close or admit its own work unless a separate configured review path allows it.

`effect-worker` belongs in runtime worker registries, executor code, and effect machinery. It should not be offered as a normal chat bootstrap role.

## Generic Worker Disambiguation

Use these conventions:

- Use `builder-worker` for bounded construction delegation.
- Use `resident-worker` for bounded ordinary Site-use delegation.
- Use `effect-worker` for low-level mechanical effect execution.
- Use `runtime worker` when referring generally to executor machinery such as outbound workers or process runners.
- Avoid unqualified `worker` in doctrine unless the ambiguity is harmless or the surrounding section is explicitly about runtime worker registries.

## Admission Evidence

The admission evidence for this taxonomy is:

- Windows User Site work surfaced resident/architect/builder handoff needs during local PC and operator-surface work.
- Staccato Site work surfaced resident-side operational delegation and routing pressure.
- Narada proper build work used Builder-owned execution with bounded subtask and handoff pressure.
- Existing control-plane/runtime code already uses worker terminology for mechanical effect machinery, including outbound workers, process executors, and Cloudflare effect workers.

The taxonomy narrows ambiguity without adding a new autonomous role loop.
