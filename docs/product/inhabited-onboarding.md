# Inhabited Onboarding

Inhabited Onboarding is the Site lifecycle phase between bootstrap and operational steady state.

```text
bootstrap -> inhabited onboarding -> operational steady state
```

Bootstrap creates a Site realization. Inhabited Onboarding proves that the Site can carry real or representative operations through its authority boundaries without smearing responsibility across chat, agents, folders, runtimes, or external systems.

This phase applies Inhabited Evolution to Site maturation. See [`../concepts/inhabited-evolution.md`](../concepts/inhabited-evolution.md).

## Purpose

A Site is not mature merely because its folders, config, inbox, tasks, and runtime state exist.

A Site exits Inhabited Onboarding only after real or representative situations have passed through it and the Site has recorded:

- what it is for;
- which authority classes it owns;
- which loci own adjacent authority;
- which intake routes are admitted;
- which operation charters are needed;
- which runtime dependencies are required;
- which effects are allowed, draft-only, forbidden, or deferred;
- which frictions became local fixes, upstream proposals, or residuals;
- which first loops were proven by trace.

## Non-Goals

Inhabited Onboarding does not authorize autonomous effects.

It does not imply that every possible workflow must be complete. It proves that common first workflows are routable, observable, bounded, and safe enough for the declared readiness posture.

It does not turn conversation into Site authority. Operator pressure must enter through governed inbox, task, decision, config, or evidence artifacts.

## Required Checklist

1. Declare Site Aim.
   Record what the Site is for, what authority it owns, and what it must not own.

2. Declare loci.
   Name User, PC, Project, Client Service, Data, ELT, runtime, and subordinate-operation loci that participate. For each locus, record owned mutation classes.

3. Install minimum substrate.
   Ensure `AGENTS.md`, config, inbox, KB, task/chapter surfaces, runtime-state policy, and credential references exist in the declared Site root.

4. Run first real situations.
   Admit actual or representative mail, files, task requests, data questions, runtime failures, or client events.

5. Observe friction.
   Classify each stumble as Site-local fix, upstream Narada proposal, or deliberate residual.

6. Classify boundaries.
   Record intake routes, authority limits, effect permissions, privacy/credential rules, sync posture, runtime-state locations, and publication posture.

7. Create operation charters.
   Promote recurring work into an Operation, subordinate Site, or charter candidate only when the originating situation earned it.

8. Prove first loops.
   At least one common workflow must run through admission, classification, charter/evaluation, governed output, human review or effect boundary, and trace.

9. Publish readiness state.
   State what is live, what is draft-only, what is pending router/tooling, and what remains a manual bridge.

10. Record exit criteria.
    The Site can exit only when common first workflows are routable, observable, and safe under declared authority.

## Client-Service Capability Choices

Structural readiness is not inhabited readiness for a `client_service` Site. A client-service Site may have config, `.ai`, an admitted operator surface, and no pending inbox while still missing material business-capability choices.

Before declaring client-service inhabited readiness, answer or explicitly defer these numbered choices:

1. Mailbox/intake posture: `none_for_now`, `bind_existing_mailbox`, or `provision_or_request_mailbox`.
2. Allowed correspondents or domains: `none_declared`, `specific_correspondents`, or `domain_predicates`.
3. Runtime behavior: `manual_only`, `scheduled_polling`, or `continuous_background`.
4. Sync posture: `metadata_only`, `headers_and_bodies`, or `attachments_with_bounds`.
5. Source data loci: `none_declared`, `mailbox`, `filesystem`, or `external_system`.
6. Affiliated Data/ELT Sites: `none_for_now`, `existing_site_refs`, or `request_new_site`.
7. Reporting surfaces: `operator_console_only`, `site_inbox_observations`, or `external_report_artifacts`.
8. Operator-surface roles: `architect_only`, `architect_builder_observer`, or `custom_declared_roles`.

Record these under `capability_choices` or an onboarding governance surface. `narada operator start` and Site readiness output must distinguish structural posture from unresolved business-capability readiness instead of silently treating an uninhabited client-service Site as fully ready.

## Canonical Artifact

Each Site should record an Inhabited Onboarding artifact under its governance surface, for example:

```text
{site_root}/.narada/chapters/inhabited-onboarding.md
```

or, for Sites whose governance root is already `.ai`:

```text
{site_root}/.ai/chapters/inhabited-onboarding.md
```

Use this template:

```markdown
# Inhabited Onboarding

## Site Aim

- Owns:
- Must not own:
- Operator:
- Authority locus:

## Loci

| Locus | Owns | Must Not Own | Crossing |
| --- | --- | --- | --- |

## Minimum Substrate

- [ ] AGENTS.md
- [ ] config
- [ ] inbox
- [ ] KB
- [ ] tasks/chapters
- [ ] runtime-state policy
- [ ] credential references

## First Real Situations

| Situation | Source | Expected Route | Actual Route | Evidence |
| --- | --- | --- | --- | --- |

## Friction Ledger

| Friction | Classification | Disposition | Evidence |
| --- | --- | --- | --- |

## Boundary Classification

| Boundary | Admission Rule | Effect Rule | Evidence |
| --- | --- | --- | --- |

## Operation Charters

| Operation | Charter | Intake | Outputs | Forbidden Effects |
| --- | --- | --- | --- | --- |

## First Loop Proofs

| Workflow | Trace | Result | Residual |
| --- | --- | --- | --- |

## Readiness State

- Live:
- Draft-only:
- Pending:
- Manual bridge:
- Residual:

## Exit Decision

- [ ] Common first workflows are routable.
- [ ] Common first workflows are observable.
- [ ] Effect authority is bounded.
- [ ] Residuals are recorded.
- [ ] Operator accepts readiness posture.
```

## Staccato Example

Staccato showed why mailbox sync proof is not enough.

The Site also needed:

- mailbox runtime proof;
- delegated CLI embodiment health;
- operation placement;
- operation-intake routing;
- missing-information draft behavior;
- no-send, no-Klaviyo, no-list-import effect boundary;
- reply identity posture (`Staccato Narada`, not a generic support team);
- local dependency/runtime repair posture.

Delegated CLI embodiment health is not the same as runtime substrate health. A Site may have valid local state, inbox directories, and daemon configuration while its operator command surface points to a stale or broken Narada CLI build. During onboarding, run both the Site doctor and inbox doctor so command-surface failures are surfaced as repairable embodiment problems rather than mistaken for authority or mailbox failures.

Onboarding should prefer a declared delegated CLI invocation contract over remembered shell repair. If a fresh agent cannot load `narada` through the declared wrapper or shim, it should stop at the doctor/preflight result and report the exact repair command. It should not paste machine-specific Node/NVM/WSL paths into task or inbox guidance.

That evidence earned the operation-intake routing bridge and the explicit Inhabited Onboarding lifecycle phase. The concept remains generic: any Site may use the phase when real operation pressure exposes missing boundaries or readiness criteria.

## Exit Posture

After exit, the Site may enter operational steady state only for the workflows and effect classes proven during onboarding.

Unproven workflows remain draft-only, manual, pending, or residual. They do not inherit authority from the fact that the Site itself is live.
