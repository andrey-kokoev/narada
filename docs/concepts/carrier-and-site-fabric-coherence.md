# Carrier And Site Fabric Coherence

## Purpose

This document records the coherence boundary for two related gaps:

- carrier families do not all enforce Narada authority at the same level;
- launcher-known Sites do not all claim authoritative MCP surface registries.

The rule is to report those differences explicitly instead of collapsing them into a single "wired up" claim.

## Evidence Levels

Carrier conformance uses these evidence levels:

| Level | Meaning |
| --- | --- |
| `code_enforced` | Narada code mediates execution and can block, route, or refuse the requested action. |
| `config_enforced` | Narada-generated client config constrains available surfaces, but the carrier owns execution mechanics. |
| `startup_enforced` | Launcher/runtime arguments establish expected posture at process start. |
| `documented_advisory` | Prompt, doctrine, extension description, or operator instruction only. |
| `unverified` | No current evidence for the claimed behavior. |

Current carrier matrix:

```powershell
node tools\operator-surface-carriers\carrier-conformance-matrix.mjs
```

Current posture:

| Carrier | Evidence level | Boundary claim |
| --- | --- | --- |
| `agent-cli` | `code_enforced` | NARS server mode can execute read-only calls and route/refuse non-read-only calls through Carrier Action Admission. |
| `codex` | `config_enforced` | Launcher projects Site MCP fabric and disables native shell by default. `EnableNativeShell = $true` is break-glass posture and fails the coherence gate. Codex owns carrier execution mechanics. |
| `pi` | `config_enforced` | Pi is admitted through the Narada-owned Pi MCP bridge extension. The bridge loads Site-local `.ai/mcp` tools; native Pi behavior remains outside NARS code mediation. |
| `claude-code` | `config_enforced` | Launcher supplies strict MCP config and disallowed native tools; explicit effect mediation exists but is not universal interception. |

## Site Fabric Audit

Launcher-known Sites are sourced from:

```text
C:\Users\Andrey\Narada\config\launch\agents.psd1
```

The audit command is:

```powershell
node tools\mcp-fabric\site-fabric-audit.mjs --pretty
```

The audit is read-only. It reports:

- launcher root and effective Site root;
- MCP fabric presence and server count;
- registry presence and shape: `surfaces`, `mcp_surfaces`, `absent`, or `invalid`;
- tolerant load status;
- strict validation status;
- authoritative MCP server count;
- live servers without registry metadata;
- stale generated client-config surfaces;
- recommendation.

## Validation Rule

Carrier startup uses tolerant validation. It should not fail merely because a registry is absent or partial.

Doctor, audit, and CI surfaces may use strict validation. Strict validation fails when a Site claims an authoritative generated client config but that generated client config no longer matches live `.ai/mcp` files.

Registry absence is not automatically failure. It means the Site is in `no_registry_claim` posture until it adds authoritative registry metadata.

To materialize a conservative registry from a Site's `.ai/mcp` fabric:

```powershell
node tools\mcp-fabric\generate-mcp-surface-registry.mjs --site-root "<site-root>" --pretty
```

The generated registry binds MCP client configs to Site authority but does not grant tool-level authority. Tools remain unlisted until explicitly classified, so mutating or unknown tools still require admission rather than becoming silently allowed.

The coherence gate is:

```powershell
node tools\mcp-fabric\coherence-gate.mjs --pretty
```

It fails when:

- Codex native shell is enabled in the launch registry;
- a launcher-known Site with MCP servers lacks authoritative registry metadata;
- strict registry validation reports stale generated client-config surfaces;
- a `documented_advisory` carrier is present in the coherent launch registry.

## Current Launcher-Known Site Posture

The current audit writes evidence to:

```text
.ai/tmp/site-fabric-audit.json
.ai/tmp/carrier-conformance-matrix.json
```

Current expected posture:

- User Site has authoritative registry posture and strict validation passes.
- Revolution, Staccato, Utz, Timour Marketing Agent, Sonar, Smart Scheduling, and Thoughts have conservative generated registries sourced from their own `.ai/mcp` fabric.
- No launcher-known Site should have stale generated client-config surfaces.
- Codex launch defaults should have `EnableNativeShell = $false`.

## Closure Condition

This layer is coherent when:

- every launcher-known Site has an audit record;
- every authoritative registry passes strict validation;
- every Site without authoritative registry metadata is explicitly reported as `no_registry_claim`;
- every admitted carrier has a conformance row with an evidence level;
- no carrier is described as stronger than its evidence level supports.
