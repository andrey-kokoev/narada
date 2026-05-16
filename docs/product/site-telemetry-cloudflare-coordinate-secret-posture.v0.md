# Site Telemetry Cloudflare Coordinate And Secret Posture v0

This posture applies to the first Narada proper Site Telemetry Publication live
slice and its Cloudflare realization. It classifies Cloudflare values before any
resource binding replacement, deploy, smoke verification, or Site config
connection.

## Rule

```text
Deployment coordinates may be repo-visible evidence.
Capability-bearing secrets must remain in the owning secret store.
Knowing a coordinate or secret reference is not authorization to deploy or use it.
```

This follows Capability-Governed Secret Management and the Canonical Capability
Consent Registry: Site artifacts may carry secret references and capability
policy, but raw secret values live in the authority-bearing store for the
relevant locus.

## Classification

| Value | Classification | Repo-visible? | Notes |
| --- | --- | --- | --- |
| Worker script name | Deployment coordinate | Yes | Example compatibility name: `narada-site-registry`. |
| Worker route / custom domain | Deployment coordinate | Yes | A route names an interface, not Site authority. |
| Cloudflare account id | Deployment coordinate | Yes, if operator admits for this project | Not by itself a deploy capability. |
| Cloudflare zone id | Deployment coordinate | Yes, if operator admits for this project | Not by itself a DNS mutation capability. |
| D1 database name | Deployment coordinate | Yes | Names the projection/candidate substrate. |
| D1 database id | Deployment coordinate | Yes, if operator admits for this project | Does not grant read/write without Cloudflare auth. |
| KV namespace name | Deployment coordinate | Yes | Names the projection/idempotency substrate. |
| KV namespace id | Deployment coordinate | Yes, if operator admits for this project | Does not grant read/write without Cloudflare auth. |
| Wrangler config binding names | Deployment coordinate / interface contract | Yes | `NARADA_SITE_REGISTRY_KV`, `NARADA_SITE_REGISTRY_D1`. |
| Worker secret names | Secret references | Yes | Names only, never values. |
| Capability refs | Capability references | Yes | Examples: publish/read/message/poll/finalize/admin refs. |
| Cloudflare API token | Capability-bearing secret | No | Store out of band, for example Cloudflare/Wrangler auth store or env secret. |
| Publish/read/message/poll/finalize bearer token values | Capability-bearing secrets | No | Configure as Worker secrets, never vars or repo files. |
| Local admission token value | Capability-bearing secret | No | Grants finalization reference authority for hosted candidates. |
| Signing private keys / webhook secrets | Capability-bearing secrets | No | Store in authority-bearing secret store only. |
| Raw smoke payload secrets | Capability-bearing secrets/private data | No | Use fixtures or bounded non-secret payloads. |

## Coordinate Visibility Decision

For this project, Cloudflare resource ids may be committed as non-secret
deployment coordinates after the operator provides or confirms them for the
Narada proper Site Telemetry Publication surface.

Limits:

- a coordinate does not authorize creation, mutation, migration, deployment, DNS
  routing, secret read, secret write, or rollback;
- coordinates must be tied to the first-live-slice and hosted-route/storage
  contracts;
- coordinates must not be used to infer Site ownership or local admission
  authority;
- coordinates must be removed or superseded if the resource is withdrawn,
  rotated, or found to point at the wrong locus.

## Secret Handling

Raw secret values must be configured out of band:

- Cloudflare API token: Wrangler/Cloudflare auth store or local environment only
  for the deploying operator/session;
- Worker bearer tokens: Cloudflare Worker Secrets, not Wrangler vars;
- local admission token: Cloudflare Worker Secret plus local capability
  reference, not Site config raw value;
- signing keys/webhook secrets: secret store references only;
- CI/CD secrets, if introduced later: CI secret store references only.

Repo-visible artifacts may record:

- `secret_ref`;
- `capability_ref`;
- secret name;
- store kind;
- authority locus;
- rotation owner/status;
- last checked / next review dates;
- whether a secret is configured, missing, stale, or revoked.

They must not record raw token material, private keys, decrypted values, bearer
headers, `.env` values, CLI auth output that includes tokens, or screenshots/logs
containing secret values.

## Capability And Consent

Live deploy requires more than coordinates:

- explicit operator approval for the infrastructure crossing;
- active Cloudflare deploy capability for the acting principal/session;
- `NARADA_SITE_TELEMETRY_DEPLOY_APPROVED=1` or the package's equivalent gate;
- non-placeholder binding config;
- post-deploy smoke plan and evidence path.

Live publish/pull/finalize actions require their own capability references and
secret bindings. A publication edge, credential ref, or Wrangler auth presence is
not by itself permission to publish telemetry, poll candidates, finalize local
admission references, mutate Site config, or push Git.

## Required Checks Before Config Patch

Before replacing placeholders in a Wrangler config, the task must verify:

- the coordinate came from the operator or a governed Cloudflare resource
  creation task;
- this artifact allows that coordinate class to be repo-visible;
- no raw secret value is present in the config, diff, report, or evidence;
- Worker secrets are represented only by names/references;
- the config still declares `projection_only` posture;
- the route/storage contract remains accurate.

If any check fails, record a blocker instead of guessing coordinates or
committing secret material.

## Required Checks Before Deploy

Before live deploy, the task must verify:

- first-live-slice boundary artifact exists;
- hosted route/storage contract exists;
- repo publication audit exists;
- this coordinate/secret posture exists;
- binding replacement/preflight task recorded non-placeholder coordinates or an
  explicit blocker;
- deploy preflight is green;
- operator grant and environment gate are present;
- raw secrets are not printed or admitted as evidence.

## Evidence Language

Use this distinction in reports:

- `coordinate_recorded`: a deploy coordinate is known and admissible as evidence;
- `secret_ref_recorded`: a secret reference/name is known;
- `secret_configured`: the target secret store reports a secret is configured,
  without revealing value;
- `capability_granted`: a consent/authority record permits a bounded use;
- `deploy_performed`: a live infrastructure mutation occurred under grant;
- `smoke_verified`: bounded live behavior was tested without raw secret leakage.

Do not use `configured` or `connected` alone when the distinction matters.
