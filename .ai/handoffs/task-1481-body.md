# Notify narada-andrey of hosted telemetry and registry separation outcome

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1475-1481-separate-site-telemetry-from-site-registry.md

## Goal

Send narada-andrey a bounded response explaining that local relation admission was understood and that Narada proper is separating Site telemetry from Site Registry tooling.

## Context

narada-andrey reported local admission of the registry relation but correctly refused hosted publication because the publication tool/capability is missing. The end of this chapter should tell narada-andrey what changed, what remains pending, and what not to use.

## Required Work

1. Prepare a concise message to narada-andrey with the chapter range and final posture.
2. State that `site-telemetry publish` is not the relation publication path.
3. State whether a dry-run planner exists and whether live publish remains pending.
4. Use MCP-specific inbox submission if the route/capability has been repaired; otherwise use the documented fallback and record why.
5. Do not ask narada-andrey to perform registry-owner mutation unless a proper capability exists.

## Non-Goals

- Do not send raw secrets.
- Do not tell narada-andrey that registration is complete unless live registry evidence exists.
- Do not bypass target Site inbox authority.

## Execution Notes

Prepared a bounded notification payload for narada-andrey in `.ai/handoffs/task-1481-narada-andrey-notification.json`.

Delivery posture:

- `narada_mcp_fabric_context` showed an active route for `site:narada-andrey` through `C:\Users\Andrey\Narada`.
- `narada_inbox_doctor` showed the local Narada proper inbox clone is not publication-ready because of existing uncommitted inbox artifacts, but target route inspection succeeded.
- MCP routed submission to `target.ref=narada-andrey` refused with `Cross-Site MCP mutation is not admitted in v1 fabric proof` and `capability_status=missing` for `canonical_inbox_cross_site_submission`.
- MCP explicit target-root submission to `C:\Users\Andrey\Narada` also refused with `Cross-Site MCP mutation is not admitted in v1 fabric proof`.
- Used the documented fallback: target Site authority surface via `narada inbox submit --cwd C:\Users\Andrey\Narada`.

Delivered target envelope:

- Envelope id: `env_2265d546-744b-4b3e-ac3c-15e03d91151a`
- Target artifact: `C:\Users\Andrey\Narada\.ai\inbox-envelopes\2026-05-17T21-16-02-803Z-env_2265d546-744b-4b3e-ac3c-15e03d91151a.json`

Message posture:

- Chapter range stated as `1475-1481`.
- `site-telemetry publish` is explicitly not the relation publication path.
- Dry-run planner is stated as existing locally: `narada site-registry relation plan-transition`.
- Live publication is stated as pending on registry-owner crossing, relation admin credential/capability binding, and a guarded future `site-registry relation publish-transition --live --payload-file <file>` task.
- No request was made for narada-andrey to perform registry-owner mutation.
- No hosted registry completion was claimed.

## Verification

- Ran `narada_mcp_fabric_context` for target `site:narada-andrey`; active route was present, mutation not attempted.
- Ran `narada_inbox_doctor` for target `site:narada-andrey`; route was visible but readiness was false due to local publication backlog.
- Attempted MCP routed submission; refused because cross-Site MCP mutation is not admitted and `canonical_inbox_cross_site_submission` capability is missing.
- Attempted MCP explicit target-root submission; refused because cross-Site MCP mutation is not admitted.
- Ran `narada inbox submit --cwd C:\Users\Andrey\Narada --source-kind agent_report --source-ref narada-proper:task-1481-hosted-telemetry-registry-separation-outcome --kind observation --authority-level agent_reported --principal narada.builder --payload-file D:\code\narada\.ai\handoffs\task-1481-narada-andrey-notification.json --target-locus local_site --format json --output full`; command returned `status=success` and `routing.authority_posture=direct_target_authority`.

## Acceptance Criteria

- [x] narada-andrey notification is delivered or a bounded delivery blocker is recorded.
- [x] Message preserves the Site telemetry vs Site Registry separation.
- [x] No registry completion overclaim is present.
