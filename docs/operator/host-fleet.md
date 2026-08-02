# Host Fleet Operations

## Purpose

Host Fleet gives one Operator Console a host-only view of machines in a Fleet.
It runs as one machine service per host. It is independent of every Narada Site
on those hosts.

## Machine Paths

| Platform | Configuration | SQLite state |
|---|---|---|
| Windows | `C:\ProgramData\Narada\host-fleet\config.json` | `C:\ProgramData\Narada\host-fleet\state.sqlite` |
| Linux | `/etc/narada/host-fleet/config.json` | `/var/lib/narada/host-fleet/state.sqlite` |

Credential files are operator-chosen machine paths. Keep them outside source
repositories. Installation removes inherited access on Windows and applies
mode `0600` on Linux.

## Authority Configuration

The authority owns the roster. `listener` remains loopback-only.

```json
{
  "schema": "narada.host_fleet.runtime_config.v1",
  "mode": "authority",
  "fleet_id": "home",
  "host_id": "desktop",
  "authority_host_id": "desktop",
  "ingress_url": null,
  "allow_insecure_ingress": false,
  "local_health_url": null,
  "listener": { "host": "127.0.0.1", "port": 61732 },
  "credentials": {
    "active": {
      "key_id": "fleet-2026-08",
      "file": "C:\\ProgramData\\Narada\\host-fleet\\membership-active.secret",
      "accept_until": null
    },
    "previous": null
  },
  "heartbeat": {
    "interval_ms": 15000,
    "stale_after_ms": 45000,
    "max_clock_skew_ms": 60000,
    "max_body_bytes": 4096
  },
  "probe": { "interval_ms": 15000, "timeout_ms": 3000 },
  "roster": [
    {
      "host_id": "desktop",
      "display_name": "Desktop",
      "platform": "windows",
      "operator_console_url": "https://desktop.example/console",
      "operator_console_health_url": "https://desktop.example/health"
    },
    {
      "host_id": "zima",
      "display_name": "ZimaBoard",
      "platform": "linux",
      "operator_console_url": "https://zima.example/console",
      "operator_console_health_url": "https://zima.example/health"
    }
  ]
}
```

## Publisher Configuration

A publisher has an empty roster and no previous credential. Its ingress URL is
the authority host's externally reachable Host Gateway route.
That one route authenticates with the Fleet HMAC headers rather than the
Operator Console bridge token; every other gateway route retains its existing
bridge-token requirement.

```json
{
  "schema": "narada.host_fleet.runtime_config.v1",
  "mode": "publisher",
  "fleet_id": "home",
  "host_id": "zima",
  "authority_host_id": "desktop",
  "ingress_url": "https://desktop.example/console/fleet/api/observations",
  "allow_insecure_ingress": false,
  "local_health_url": null,
  "listener": { "host": "127.0.0.1", "port": 61732 },
  "credentials": {
    "active": {
      "key_id": "fleet-2026-08",
      "file": "/etc/narada/host-fleet/membership-active.secret",
      "accept_until": null
    },
    "previous": null
  },
  "heartbeat": {
    "interval_ms": 15000,
    "stale_after_ms": 45000,
    "max_clock_skew_ms": 60000,
    "max_body_bytes": 4096
  },
  "probe": { "interval_ms": 15000, "timeout_ms": 3000 },
  "roster": []
}
```

HTTP ingress requires the explicit `allow_insecure_ingress: true` opt-in and is
intended only for a controlled local lab. Production ingress should use HTTPS.
Set `local_health_url` to a loopback HTTP(S) health endpoint when one is
available; otherwise the publisher reports host health as `unknown` without
affecting heartbeat freshness.

## Provisioning

Validate without mutation:

```text
narada host-fleet plan --config <staged-config.json>
```

Install on Windows from an elevated terminal. Narada uses WinSW as the Node
service wrapper; pass its executable explicitly or set `NARADA_WINSW_PATH`:

```text
narada host-fleet install --config <staged-config.json> --windows-service-wrapper <WinSW.exe>
```

Install on Linux as root. The Node executable used by the service must be
system-readable and must not live under a home directory hidden by the unit's
`ProtectHome=true` policy:

```text
sudo narada host-fleet install --config <staged-config.json>
```

Inspect and maintain the service:

```text
narada host-fleet status
narada host-fleet reload --config <staged-config.json>
narada host-fleet publish-once
narada host-fleet uninstall
```

`reload` validates and atomically replaces configuration. If service activation
fails, it restores the prior configuration and attempts to restart that prior
configuration. `uninstall` retains machine configuration and SQLite state.

## Shared-Secret Rotation

1. Generate a new random secret of at least 32 characters and distribute it as
   a protected machine file to every Fleet host.
2. On the authority, make the new key `active` and move the old key to
   `previous` with an explicit `accept_until`; reload the authority.
3. On each publisher, replace `active` with the new key and reload it.
4. Verify publisher health and fresh heartbeats in Host Fleet.
5. After `accept_until`, remove `previous` from the authority and reload again.

Do not reuse one secret across different `fleet_id` values. The wire contract
rejects cross-Fleet heartbeats, but key separation limits operational blast
radius.

## Failure Interpretation

- `publisher_freshness=stale`: no recently admitted heartbeat; effective health is unknown.
- `reachability=unreachable`: the independent authority probe failed.
- publisher `/health` is degraded: inspect `last_publish_failure_code`.
- `host_fleet_heartbeat_replay`: a signed nonce was already admitted.
- `host_fleet_id_mismatch`: publisher and authority Fleet IDs differ.
- `host_fleet_runtime_not_authority`: Operator Console is attached to a publisher host configuration.
