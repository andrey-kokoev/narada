# Operator Live Loop

> The minimal operator rhythm for running a live Narada operation.

## The Five-Step Loop

Every operator session should answer five questions in order:

1. **Is it healthy?**
2. **What happened?**
3. **What needs attention?**
4. **What draft or proposal exists?**
5. **What should I do next?**

These are not ad-hoc checks. They are a defined loop with mapped commands and clear exit conditions.

---

## Step 1: Is It Healthy?

**Question:** Is the daemon running, sync fresh, outbound healthy, charter runtime reachable?

**Primary command:**

```bash
narada ops
```

This surfaces a health summary for all configured scopes in one view.

**Alternative / deeper:**

```bash
narada doctor
```

`doctor` performs live probes (daemon PID, health file, sync freshness, charter API, work-queue failures) and returns pass/warn/fail with remediation strings.

**Healthy exit condition:** `overall: healthy` with no warnings.

---

## Step 2: What Happened?

**Question:** What evaluations, decisions, and executions occurred since I last checked?

**Primary command:**

```bash
narada ops
```

The "Recent Activity" section shows the last 5 evaluations, decisions, and executions per scope. Use `--limit <n>` to show more.

**Alternative / deeper:**

```bash
narada show evaluation <evaluation-id> --operation <scope-id>
narada show decision <decision-id> --operation <scope-id>
narada show execution <execution-id> --operation <scope-id>
```

**Satisfied exit condition:** Recent activity matches expectations (e.g., new messages evaluated, drafts proposed).

---

## Step 3: What Needs Attention?

**Question:** Are there stuck work items, stuck outbound commands, or failed executions?

**Primary command:**

```bash
narada ops
```

The "Attention Queue" section lists:
- Work items stuck in `opened`, `leased`, `executing`, or `failed_retryable`
- Outbound commands stuck in `pending`, `draft_creating`, `draft_ready`, or `sending`
- Work items in `failed_terminal`

**Alternative / deeper:**

```bash
narada status --verbose
```

Shows stuck-item counts and control-plane snapshot. For stuck-item details, query the observation API:

```bash
curl http://localhost:8080/scopes/<scope-id>/stuck-work-items
curl http://localhost:8080/scopes/<scope-id>/stuck-outbound-commands
```

**Satisfied exit condition:** Attention queue is empty.

---

## Step 4: What Draft or Proposal Exists?

**Question:** Are there drafts awaiting operator review, approval, or rejection?

**Primary command:**

```bash
narada ops
```

The "Drafts Pending Review" section lists `draft_ready` outbound commands with context ID and payload summary.

**Actions on drafts:**

```bash
# Review and approve (triggers send or draft creation)
narada mark-reviewed <outbound-id> --notes "Looks good"

# Reject the draft
narada reject-draft <outbound-id> --rationale "Incorrect response"

# Record external handling
narada handled-externally <outbound-id> --ref ticket-123
```

**Satisfied exit condition:** No drafts pending review, or all drafts have been dispositioned.

---

## Step 5: What Should I Do Next?

**Question:** Based on the previous four steps, what is the single most important action?

**Primary command:**

```bash
narada ops
```

The "Suggested Next Actions" section recommends actions based on current state:
- Start daemon if not running
- Run sync if stale
- Review drafts if pending
- Investigate failures if stuck work exists
- Run recovery dry-run if data loss suspected

**Satisfied exit condition:** Suggested action is "All clear. No immediate action required."

---

## Normal Operating Rhythm

### Morning Check (5 minutes)

```bash
narada ops
```

Verify:
- Health is `healthy` or `degraded` (not `failing`)
- Recent activity shows overnight evaluations/decisions
- No unexpected stuck items
- Drafts pending review are expected

### Mid-Day Triage (2 minutes)

```bash
narada ops
```

Focus on:
- Drafts Pending Review section
- Attention Queue for new stuck items

### Evening Check (3 minutes)

```bash
narada ops
narada audit --since 8h
```

Verify:
- All active work items are quiescing (`opened`, not `leased`/`executing`)
- Audit log shows only expected operator actions
- No failed_terminal work items appeared during the day

---

## First Troubleshooting Steps

If the loop surfaces a problem, follow this order:

1. **Run `narada doctor`** for detailed health checks and remediation strings.
2. **Run `narada status --verbose`** for control-plane snapshot and stuck counts.
3. **Run `narada show <type> <id>`** for deep-dive into the specific entity.
4. **Check logs:** `tail -n 100 <rootDir>/logs/daemon.log`
5. **Check health file:** `cat <rootDir>/.health.json`
6. **If coordinator DB is suspect:** `narada recover --scope <scope-id> --dry-run`

For rehearsed failure scenarios (kill daemon mid-sync, corrupt cursor, etc.), see [`docs/runbook.md`](runbook.md).

---

## CLI / UI Mapping

| Loop Step | CLI Command | UI Page |
|-----------|-------------|---------|
| Is it healthy? | `narada ops`, `narada doctor` | Overview |
| What happened? | `narada ops`, `narada show` | Timeline, Executions |
| What needs attention? | `narada ops`, `narada status --verbose` | Work, Failures |
| What drafts exist? | `narada ops` | Intents, Mailbox vertical |
| What do I do next? | `narada ops` | (suggested actions in Overview) |

---

## Non-Goals of This Loop

- This loop does not replace the full runbook. It is the *minimal* rhythm. For detailed troubleshooting, see [`docs/runbook.md`](runbook.md).
- This loop does not cover fleet or multi-operation dashboards. It is scoped to one operation at a time.
- This loop does not cover USC construction or task governance. Those are separate operator domains.
