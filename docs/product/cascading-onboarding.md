# Cascading Onboarding

Cascading Onboarding is the structured Site-local route from substrate existence to inhabited readiness.

The canonical artifact is a cascade, not this prose. For client-service Sites, the initial artifact is [`narada.onboarding_cascade.v0.client-service.json`](narada.onboarding_cascade.v0.client-service.json).

## Purpose

Structural Site readiness means the Site root, config, `.ai` surface, and operator surface can be found.

It does not mean the Site is ready to perform client work. Capability configuration, credential binding, dry-run proof, activation, runtime installation, and live health are separate readiness layers.

## Readiness Layers

1. `structural_site_ready`
2. `capability_configured`
3. `credentials_bound`
4. `dry_run_proven`
5. `activated`
6. `runtime_installed`
7. `live_health_proven`

Each layer must be projected separately. Later layers cannot be inferred from earlier layers.

## Site-Local Projection

A Site records:

- selected cascade version;
- answers;
- deferred choices;
- readiness projection.

Recommended projection path:

```json
{
  "onboarding": {
    "selected_cascade_version": "narada.onboarding_cascade.v0",
    "cascade_answers": {},
    "deferred_choices": [],
    "readiness_projection": {}
  }
}
```

## Deferred Choices

Deferral is allowed when a choice is not yet earned or cannot be answered at the current locus.

A deferral records the choice id, reason, principal, timestamp, and review trigger. It does not prove capability configuration, credential binding, runtime installation, or live health.

## Relationship To Commands

The cascade contains command templates. Commands execute or record the next governed crossing:

- `narada want-mailbox` for mailbox/intake capability configuration;
- `narada capability bind-credential` for credential reference and local-material posture;
- `narada runtime windows-startup install` for runtime posture dry-run or deferral;
- `narada runtime windows-startup status` for startup/runtime reconciliation.

Docs explain this artifact. They do not replace it.
