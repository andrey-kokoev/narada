# Task 1230 Cross-Site Operator Surface Delivery Admission

## Decision

Admitted: bounded Operator Surface delivery from `narada-andrey.Kevin` to `narada.architect` through the existing Narada proper operator-surface send surface.

## Authority Basis

- Target work substrate: Narada proper, Windows embodiment `D:\code\narada`.
- Target runtime locus: `narada`.
- Receiving surface: `narada.architect`, resolved locally to identity `architect`.
- Sender evidence: `narada-andrey.Kevin` as external sender identity. This admission allows delivery to the receiving Operator Surface; it does not admit sender authority over Narada proper state.

## Admitted Route

- Source/current Site: `narada-andrey`.
- Target Site: `narada`.
- From identity: `narada-andrey.Kevin`.
- To address: `narada.architect`.
- Resolved recipient: `architect`.
- Resolution mode: `scoped_role_alias_exact_one`.
- Runtime locus: `narada`.
- Required binding posture: target identity must be bound at runtime locus.

## Admitted Command Shape

```powershell
narada operator-surface send `
  --from narada-andrey.Kevin `
  --to narada.architect `
  --current-site narada-andrey `
  --runtime-locus narada `
  --text <bounded-message> `
  --dry-run|--execute `
  --format json
```

Execution mode is admitted only for bounded operator-surface messages that carry coordination/status/request text and preserve existing delivery policy checks.

## Evidence

- Dry-run proof: `narada operator-surface send ... --dry-run --format json` returned `status=success`, `mutation_performed=false`, `resolved_to=architect`, `target_site=narada`, `binding_status=bound`, and `send.status=validated_dry_run`.
- Execute smoke artifact: `.ai/operator-surface-events/ose_1778618675673_78f13fef0a5e.json`.
- Delivery promise artifact: `.ai/operator-surface-delivery-queue/osdq_ose_1778618675673_78f13fef0a5e.json`.
- Execute smoke result: `delivery_result.status=delivered`, `serialization.admitted=true`, `fallback_inbox=null`.

## Not Admitted

- Source Site runtime import.
- Runtime DB, task, inbox, roster, checkpoint, operator-surface runtime, PC-locus state, source history, secrets, or credentials import from `narada-andrey`.
- Sender authority to mutate Narada proper task, chapter, inbox, package, capability, or Site state.
- Arbitrary cross-Site mutation.
- Native shell fallback.
- Direct substrate shortcut execution.
- PC-locus mutation beyond the existing operator-surface delivery serialization/evidence path.
- Operator-surface runtime copying.
- Cross-desktop or urgent interrupt delivery outside existing policy gates.

## Closeout

The named blocker is resolved for `narada-andrey.Kevin -> narada.architect` bounded OSM delivery. Broader sender sets, mutating instructions delivered over OSM, cross-desktop delivery, or runtime carrier changes require separate admission.
