# Canonical Capability Consent Registry

The Canonical Capability Consent Registry is the Site-local authority record for granted capabilities. It answers: who granted what capability, to which principal/Site/agent, for what scope, with which allowed and denied actions, using which credential reference, until when, and under what revocation posture.

The registry is not a secret store. It may store references such as `env:NARADA_UTZ_TOKEN`, `credential-manager:Narada/pc/github`, `keychain:narada/mailbox`, `pass:narada/site`, `vault:path`, or `config-ref:...`. It must not store raw secret values.

Inbox envelopes may carry capability metadata as inert crossing evidence or requests. Such metadata is not a local grant until admitted into this registry or an equivalent local capability authority. See [`canonical-inbox.md`](canonical-inbox.md#capability-metadata).

## Command Surface

```bash
narada capability grant \
  --site <site-id> \
  --principal <principal-id> \
  --kind <capability-kind> \
  --scope '{"root":".narada"}' \
  --allow write_file,create_directory \
  --credential-ref env:NARADA_SITE_TOKEN \
  --evidence-ref inbox:<envelope-id> \
  --by <grantor>

narada capability list --site <site-id>
narada capability explain <grant-id>
narada capability revoke <grant-id> --by <principal> --reason <reason>
```

Credential binding and remote secret mutation are separate operation classes. Use preflight before repair:

```bash
narada capability credential-preflight \
  --site <site-id> \
  --principal <principal-id> \
  --kind <capability-kind> \
  --operation bind_existing_secret \
  --credential-ref env:<VAR>
```

`create_new_secret` and `rotate_remote_secret` are dangerous external effects and require `--approve-remote-secret-mutation`. Ordinary adapter setup and `bind-credential` must not rotate upstream secrets as a side effect.

The v0 registry persists at:

```text
.ai/capability-consent-registry.json
```

## Grant Shape

Each grant records:

| Field | Meaning |
| --- | --- |
| `grant_id` | Durable grant identifier |
| `site_id` | Site receiving or exercising capability |
| `principal_id` | Human or system principal covered by the grant |
| `agent_id` | Optional agent covered by the grant |
| `capability_kind` | Capability family, such as `filesystem.write`, `site.delivery`, `github.repo`, `mail.graph`, or `webhook.send` |
| `scope_json` | Bounded JSON scope for the capability |
| `allowed_actions` | Actions explicitly allowed |
| `denied_actions` | Actions explicitly denied even if capability kind is broad |
| `credential_ref` | Secret reference only, never a raw value |
| `evidence_ref` | Evidence of grant or consent |
| `expires_at` | Optional expiry timestamp |
| `status` | `active` or `revoked`; expired is derived from time |
| `granted_by`, `granted_at` | Grant authority trace |
| `revoked_by`, `revoked_at`, `revocation_reason` | Revocation authority trace |

## Operational Rule

Configured intent is not capability. A credential reference is not capability. A charter `allowed_actions` envelope is not capability by itself.

Before an execution surface performs an external mutation, it should be able to identify an active, unexpired grant whose Site, principal or agent, capability kind, scope, and allowed action cover the requested mutation. The execution surface must still satisfy its own crossing law; the registry is necessary but not sufficient.

## V0 Boundary

This v0 creates the durable registry and inspection/mutation operators. It does not yet retrofit every executor. Executors should be migrated incrementally to consult `narada capability explain`-equivalent logic before mailbox send, GitHub push, webhook delivery, filesystem write outside a local Site root, or Site-to-Site delivery.
