# First-Time Operator Success Path

This is the canonical path for a first-time Operator to move from fresh materialization to usable Narada work without documentation spelunking.

The path is deliberately explicit about authority-affecting crossings. Each crossing has a command family that should own the mutation or observation. Later ergonomics work should expose this path as one front door, but not hide the crossings.

## Success Definition

A first-time Operator succeeds when they can:

1. declare the work Aim as an Operation Specification;
2. materialize or select the Site/runtime locus that will host the work;
3. instantiate a role identity and receive bounded bootstrap text;
4. bind or route the Operator Surface without pretending the surface grants authority;
5. admit first intake through Canonical Inbox or a declared source;
6. ask `work-next` for the next governed action;
7. run one representative loop through readiness proof and trace;
8. see residual blockers and next commands without reading raw SQLite, task files, or full lifecycle snapshots.

## Canonical Path

| Step | Operator intent | Governed crossing | Command family | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Declare what Narada should do | Operator pressure -> Operation Specification | `narada init`, `narada want-mailbox`, `narada want-workflow` | operation config, preflight result |
| 2 | Choose where it runs | Operation Specification -> Site/runtime locus | `narada sites init`, `narada sites bootstrap-*`, `narada sites doctor` | Site config, Site doctor result |
| 3 | Prove substrate can host work | Site realization -> readiness posture | `narada doctor --bootstrap`, `narada sites doctor`, `narada preflight` | bounded readiness report |
| 4 | Start an AI role | Operator request -> role identity contract | `narada operator-surface agent instantiate`, `narada sites agent-bootstrap` | role identity record, bootstrap text |
| 5 | Bind the surface if possible | role identity -> Operator Surface / runtime binding | `narada operator-surface bind-focused --as self` | binding record or runtime-locus deferral |
| 6 | Admit first input | outside message/file/report -> Canonical Inbox or source facts | `narada inbox submit`, `narada inbox ingest-files`, source-specific sync | inbox envelope or fact admission |
| 7 | Select next work | Site posture -> next governed action | `narada work-next`, `narada task work-next`, `narada inbox work-next` | selected action packet or no-work reason |
| 8 | Execute representative loop | action intent -> Act / Trace | `narada task claim`, `narada test-run`, `narada command-run`, operation commands | reports, verification runs, command runs |
| 9 | Publish readiness | trace -> readiness proof | `narada sites doctor`, `narada task evidence`, `narada publication`, docs artifact | readiness state and residuals |

## Boundary Distinctions

| Boundary | Must not collapse into |
| --- | --- |
| Operation Specification | Site folder, runtime, mailbox, chat request |
| Site/runtime locus | current shell, clone, CLI binary, Operator Surface |
| Role identity | model session, terminal title, task authority |
| Operator Surface binding | effect capability, review authority, Operator consent |
| Inbox intake | task creation, command execution, truth admission |
| Work-next | autonomous assignment loop, hidden recommendation |
| Readiness proof | green build alone, docs alone, chat confidence |

## Failure Posture

Failures must return bounded repair commands instead of pushing the Operator toward raw state inspection.

| Failure | Bounded posture | Preferred command |
| --- | --- | --- |
| Missing dependencies or stale build | Report bootstrap readiness and repair plan | `narada doctor --bootstrap --format json` |
| Missing native SQLite binding | Report delegated CLI/native binding health | `narada inbox doctor --format json` or `narada doctor --bootstrap --format json` |
| Stale clone or embodiment mismatch | Name authority locus and clone posture | `narada task preflight --format json`, `narada inbox doctor --format json` |
| Absent Operator Surface transport | Return runtime-locus deferral, not guessed handles | `narada operator-surface bind-focused --as self` |
| No admitted work | Return no-work reason with blockers | `narada task workboard --format json`, `narada work-next --format json` |
| Deferred dependency | Require explicit unblock evidence | `narada task unblock <n> --agent <id> --evidence <text> --rationale <text>` |

## Ergonomic Front Door Target

Later tasks should expose one first-time Operator front door:

```bash
narada operator start --site <site-id-or-root> --operation <operation-id>
```

The command is the orchestrated guide over the crossings above. It is read-only by default and must not become a hidden authority shortcut. Its output is bounded:

- current Site and Operation coordinates;
- missing prerequisite checks;
- exact next command;
- bootstrap text or Operator Surface handoff when appropriate;
- readiness proof or residual blockers.

## Verification Rule

Verification for this path uses sanctioned read surfaces only:

```bash
narada doctor --bootstrap --format json
narada task preflight --format json
narada sites doctor <site-id-or-root> --format json
narada operator-surface labels build --site <site-id-or-root> --format json
narada task workboard --format json
```

Do not verify first-time Operator readiness by opening `.ai/task-lifecycle.db`, directly reading task projection files, or inspecting full lifecycle snapshots.
