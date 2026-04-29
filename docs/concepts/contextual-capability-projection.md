# Contextual Capability Projection

Contextual Capability Projection separates a canonical capability family from the operator-facing labels, buttons, and controls that project it in a specific situation.

An Operator Surface should not multiply buttons merely because a capability has multiple contextual modes. It should also not overpromise a capability by labeling a local helper as the full operator-visible work outcome.

## Core Distinction

| Layer | Meaning | Authority posture |
| --- | --- | --- |
| Canonical capability family | The stable work ability, independent of current UI labels. | Governed by capability, command, evidence, and Site authority rules. |
| Contextual operator projection | The label/control shown for the current context. | Presentation and request surface; never authority by itself. |
| Operator-visible invariant | The work outcome the Operator expects from the projection. | Must be proven by tests or evidence before the projection can claim readiness. |

Projection is allowed to rename or narrow a capability for clarity. Projection is not allowed to hide missing behavior.

## Monitor Content Transfer Example

Canonical capability family:

```text
monitor_content_transfer
```

Operator-facing projections:

| Context | Projection label | Required behavior |
| --- | --- | --- |
| 0 or 1 monitor available | Unavailable / refuse | Explain that transfer requires at least two available monitors; do not pretend work happened. |
| 2 monitors available | Exchange Monitor Contents | Swap the contents between the two monitors without asking for a target. |
| 3 or more monitors available | Transfer Monitor Contents | Require explicit source and target selection before moving or exchanging content. |

The labels differ because the Operator's decision surface differs. The capability family remains one.

This prevents two opposite failures:

- over-lowered decomposition: separate `swap-monitor`, `move-monitor`, `choose-monitor`, and `display-toggle` controls that hide one capability family;
- overpromising label: `Transfer Monitor Contents` when the implementation only runs a manual helper, fixture, or local display script without proving the operator-visible transfer.

## Operator-Visible Invariant Testing

Tests for an Operator Surface must prove the outcome the Operator believes the control performs.

Command-local semantics are not enough.

| Weak proof | Operator-visible invariant |
| --- | --- |
| Command exits zero. | Monitor contents actually exchanged or transferred as selected. |
| Button calls the expected script. | The requested work is reflected in the visible target surface or confirmed by a trustworthy observation. |
| Fixture helper returns success. | Normal path works through the actual operator control and admission path. |
| Label renders correctly. | Label is accurate for the current context and refuses when the capability cannot be performed. |

When direct observation is unavailable, the test must name the residual and lower the claim. For example, "manual helper present" is not "operator entrypoint works"; "operator entrypoint works" is not "event-driven automation"; and neither is "fully integrated" until the normal runtime path proves it.

## Button Decomposition Rule

Before adding adjacent operator buttons:

1. Name the canonical capability family.
2. List the contextual projections the Operator actually needs.
3. Identify whether projections are mode labels, target-selection states, or distinct capabilities.
4. Define the operator-visible invariant for each projection.
5. Add separate controls only when the Operator decision differs, not when the implementation has separate helper functions.

If the button set mirrors implementation internals more than Operator intent, invert the design with Authority-Revealing Inversion.

## Audit Signals

Coverage Audit should flag:

- multiple adjacent buttons that look like modes of one higher-level capability;
- labels stronger than normal-path implementation evidence;
- tests that assert command invocation but not operator-visible outcome;
- fixture-only or manual-helper proof presented as an integrated capability;
- UI controls whose authority locus, capability grant, or admission path is unclear;
- context-insensitive labels that do not change when prerequisites are absent.

The finding should record the canonical capability family, current projections, missing invariant proof, and recommended repair.

## Relationship To Operator Surface

Operator Surface is the presentation/inhabitation layer. Contextual Capability Projection is the rule for how capabilities appear there.

An Operator Surface may:

- choose labels based on context;
- ask for target selection when the context requires it;
- refuse when capability prerequisites are absent;
- link to evidence of the operator-visible invariant.

It must not:

- grant capability authority;
- bypass command/admission rules;
- claim a capability is live because a helper exists;
- multiply controls without naming the higher-level capability family.

## Relationship To Capabilities

Capability consent governs whether a principal may perform a class of action. Contextual projection governs how that action is presented to the Operator.

Configured capability is not sufficient for operator-surface readiness. The projection also needs:

- correct context detection;
- accurate label/refusal behavior;
- bounded target selection when needed;
- operator-visible invariant proof;
- evidence or residuals if the claim is weaker than the ideal behavior.
