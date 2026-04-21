# Decision 20260419-237: Recovery Runbook

> **Scope**: Daemon lifecycle, graceful drain, and rehearsed recovery procedures.
> **Authority**: Operator-facing operational documentation.
> **Status**: Adopted.

---

## Graceful Shutdown Behavior

The daemon implements a bounded graceful drain on `SIGTERM` / `stop()`:

1. `shuttingDown` flag is set — no new lease acquisitions.
2. Observation API server stops first — no new operator actions arrive.
3. Wake controller is stopped — any sleeping poll loop wakes immediately.
4. The current sync/dispatch iteration is awaited up to `maxDrainMs` (default 30s).
5. If drain times out, remaining active leases are force-released with reason `shutdown`.
   - Work items transition back to `opened`.
   - Active execution attempts are marked `abandoned`.
6. Database connections are closed and the PID file is removed.

**Guarantee**: No work is lost. Leases released as `shutdown` are recovered on the next daemon startup and the work items become runnable again.

**Systemd integration**: `TimeoutStopSec=35` gives the daemon 30s to drain plus a 5s buffer before systemd sends `SIGKILL`.

---

## Scenario A: Daemon Crashed During Execution

**Symptoms**: `systemctl status narada-daemon` shows inactive, or `cat /run/narada/daemon.pid` references a dead process.

**Recovery**:
1. Check status: `systemctl status narada-daemon`
2. Restart: `systemctl start narada-daemon`
3. Verify recovery: `narada status` — look for stale lease recoveries (leases released as `abandoned`, work items back to `opened` or `failed_retryable`).
4. Inspect affected work items via daemon UI or `narada status --verbose`.

**Expected outcome**: The scheduler recovers stale leases automatically on the first dispatch phase. The foreman classifies them as retryable with immediate backoff.

---

## Scenario B: Coordinator Database Is Corrupted

**Symptoms**: Daemon fails to start with SQLite errors, or `narada status` throws.

**Recovery**:
1. Stop daemon: `systemctl stop narada-daemon`
2. Backup corrupted DB:
   ```bash
   cp /var/lib/narada/.narada/coordinator.db /var/lib/narada/.narada/coordinator.db.bak.$(date +%s)
   ```
3. Delete corrupted DB: `rm /var/lib/narada/.narada/coordinator.db`
4. Recover from facts:
   ```bash
   narada recover -c /etc/narada/config.json
   ```
5. Rebuild projections:
   ```bash
   narada rebuild-projections -c /etc/narada/config.json
   ```
6. Start daemon: `systemctl start narada-daemon`
7. Verify: `narada status`

**Caveat**: Active leases, in-flight execution attempts, and submitted outbound effects are NOT recoverable from facts alone. They will be naturally re-acquired/restarted by the scheduler and outbound workers after startup.

---

## Scenario C: Delta Token Is Stale or Expired

**Symptoms**: Sync fails with Graph API authentication/delta errors.

**Recovery**:
1. Check cursor:
   ```bash
   cat /var/lib/narada/state/cursor.json
   ```
2. If the `error` field exists or the token is expired, delete the cursor file:
   ```bash
   rm /var/lib/narada/state/cursor.json
   ```
3. Restart daemon or run a dry-run sync:
   ```bash
   narada sync -c /etc/narada/config.json --dry-run
   ```
4. The first sync after deletion performs a full read — expect a slower initial sync.

---

## Scenario D: Work Item Is Stuck in `opened`

**Symptoms**: Work item sits in `opened` with no lease acquired for an extended period.

**Recovery**:
1. Check `narada status` — quiescence indicator.
2. Check daemon logs for scheduler errors.
3. Trigger redispatch:
   ```bash
   narada derive-work -c /etc/narada/config.json -s <scope-id>
   ```
   Or via UI action: `request_redispatch`.
4. If still stuck, inspect facts:
   ```bash
   narada select -c /etc/narada/config.json -s <scope-id> --context-id <id>
   ```

---

## Scenario E: Outbound Command Is Stuck in `draft_creating`

**Symptoms**: Outbound command remains in `draft_creating` or `submitted` without progressing.

**Recovery**:
1. Check `narada status` — outbound section (after Task 235).
2. Check daemon logs for Graph API errors (auth, rate limit, network).
3. Verify Graph API credentials are valid.
4. If credentials were fixed, the worker retries on the next poll cycle automatically.
5. If permanently stuck, acknowledge failure via UI action or wait for timeout/backoff.

---

## Restart-on-Failure Policy

The systemd unit specifies `Restart=on-failure`.

| Condition | Auto-restart? | Notes |
|-----------|---------------|-------|
| Non-zero exit code | Yes | After `RestartSec=5` |
| Uncaught exception | Yes | Process exits non-zero |
| Clean shutdown (SIGTERM) | **No** | Exit code 0; operator explicitly stopped the service |
| `kill -9` (SIGKILL) | Yes | Exit code non-zero |

Check restart count:
```bash
systemctl status narada-daemon
# Look for "Restart=" count in the status output
```

---

## Systemd Installation Steps

```bash
# 1. Create user and directories
sudo useradd -r -s /bin/false narada
sudo mkdir -p /var/lib/narada /run/narada /etc/narada
sudo chown -R narada:narada /var/lib/narada /run/narada

# 2. Install binary
sudo cp /path/to/narada-daemon /usr/bin/narada-daemon
sudo chmod +x /usr/bin/narada-daemon

# 3. Install unit file
sudo cp docs/deployment/systemd/narada-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload

# 4. Enable and start
sudo systemctl enable --now narada-daemon

# 5. Verify
systemctl status narada-daemon
narada status -c /etc/narada/config.json
```

---

## References

- Task 234 (Health/Readiness Contract) — `/ready` endpoint and health thresholds.
- Task 235 (Stuck-Work Detection) — stuck-item detection referenced in Scenarios D and E.
- Task 236 (Audit Inspection) — `narada audit` for operator action history.
- `docs/runbook.md` — daily operation and first-time setup procedures.
