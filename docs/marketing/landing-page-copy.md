# Narada Landing Page Copy — narada.systems

Complete page copy for the public landing page, organized by section. Each
section carries its intended anchor id so the text maps 1:1 onto
`src/pages/index.astro` in the `narada-systems` site project.

Copy rules followed throughout: plain language first; doctrine terms appear as
named concepts with one-line glosses; user-facing vocabulary per
`TERMINOLOGY.md` (users run **operations**); every capability claim is grounded
in a repo source (see the claim checklist at the bottom).

Approved baseline messaging this builds on: `.ai/do-not-open/tasks/20260731-2230-marketing-site-positioning-and-messaging.md`.

---

## Metadata

- **Title:** Narada — AI agents you can actually govern
- **Description:** Narada is the governed control plane for AI-agent operations: a deterministic state compiler plus durable governance that turns model judgment into permissioned, reconciled, auditable action.
- **og:url:** https://narada.systems/
- **og:title:** Narada — AI agents you can actually govern
- **og:description:** Intelligence supplies judgment. Narada decides what counts, what may change, what may be done, and how consequence is confirmed.

---

## 1. Hero `#hero`

**Headline:**

> AI agents you can actually govern.

**Subhead:**

> Agent tools let models act. Narada decides what counts, what may change, what
> may be done, and how consequence is confirmed — compiling remote changes into
> local canonical state and turning agent intent into durable, permissioned,
> reconciled side-effects, with evidence at every boundary.

**Primary CTA:** Try the demo — `narada demo`
**Secondary CTA:** Read the kernel lawbook →

---

## 2. Choose your route `#routes`

*Three visitor segments, self-selected at the top of the page. Each card links
to its page anchor and one external destination.*

**Card 1 — "I want an assistant I can trust."**
You want help with real work — mail, follow-ups, routine operations — without
handing an AI the keys. Narada drafts, proposes, and remembers; nothing sends,
moves, or deletes without the permission level you set.
→ *Jump to [How it works](#how-it-works)* · Start with `narada demo`

**Card 2 — "I'm evaluating the architecture."**
You're deciding whether the governance claims are real. They are spelled out as
a small set of named invariants, each enforced at a specific pipeline boundary —
and each checkable in the source.
→ *Jump to [The boundary chain](#boundaries)* · Read the kernel lawbook on GitHub

**Card 3 — "I'm building agent systems."**
You want a deterministic kernel, not another chat framework: one control plane
for mailboxes, timers, webhooks, filesystems, and processes, with a governed
tool fabric any agent carrier can plug into.
→ *Jump to [Capabilities](#capabilities)* · Get the CLI from npm

---

## 3. The problem `#problem`

**Section head:**

> Agent frameworks gave models hands. Nothing gave them a leash.

**Body:**

Today, a model's judgment flows straight into effect: a prompt becomes a send, a
delete, a purchase. When something goes wrong there is no durable record of what
was decided, by whom, under which permission — and no way to replay what
happened. Narada exists to close that gap. It separates **intelligence** (what
the model thinks) from **authority** (what the system may do), and it makes
every step between the two durable, explicit, and inspectable.

---

## 4. The boundary chain `#boundaries`

**Section head:**

> Every boundary blocks a named collapse.

**Lead-in:**

Narada pipelines every operation through one fixed sequence:

```
observe → normalize → fact → context → work → evaluation → decision → intent → execution → reconciliation → observation
```

Each arrow is a governed crossing that prevents a specific failure mode:

| Boundary | What it prevents |
|----------|------------------|
| observation → fact | World state becoming prompt memory |
| fact → context | Unbounded reality becoming arbitrary model context |
| context → work | Attention becoming informal task selection |
| work → evaluation | Inference becoming mutation |
| evaluation → decision | Model judgment becoming permission |
| decision → intent | Approval becoming direct effect |
| intent → execution | Execution inventing its own reasons |
| execution → reconciliation | API success becoming assumed truth |
| reconciliation → observation | Hidden state becoming uninspectable consequence |

**Closer:**

This is the core of Narada: not a policy document, but a running system in
which a model's output physically cannot skip a step.

---

## 5. Capabilities `#capabilities`

**Section head:**

> One control plane for everything an agent touches.

**Card 1 — Intelligence-Authority Separation**
Models contribute judgment; they never own truth, lifecycle, permission,
effects, or confirmation. Intelligence supplies candidate meaning — Narada's
control plane decides what counts.

**Card 2 — Deterministic state compiler**
Remote source deltas become local canonical state you can inspect, diff, back
up, and replay. SQLite-backed durable stores, not prompt memory. Identical
input compiles to identical output, and replay is safe by construction.

**Card 3 — Vertical-agnostic kernel**
Mailboxes, timers, webhooks, filesystems, and processes all travel the same
pipeline: source → fact → policy → intent → execution → observation.
Exchange/Graph is simply the first vertical — not the essence of the system.

**Card 4 — Governed tool fabric**
Dozens of MCP tool surfaces — git, filesystem, tasks, inbox, scheduler, mail —
give any connected agent the same admitted, policy-checked capabilities.
Capabilities are declared and admitted, never inferred from a prompt.

**Card 5 — Operator-grade continuity**
Tasks, checkpoints, and an operator console keep multi-session work resumable,
reviewable, and auditable. Crash at any point; the system converges back to
correct state without coordination with the source.

---

## 6. How it works `#how-it-works`

**Section head:**

> You stay the operator. Narada does the remembering.

**Intro:**

Narada is designed around **ops repos** — private repositories that hold your
operations, their knowledge, and their local configuration. You shape what runs;
the daemon executes it under governance.

**Steps:**

1. **Try it with zero setup** — `narada demo` shows synthetic mailbox data and
   what Narada does with it. No credentials, no config, no files created.
2. **Bootstrap an ops repo** — `narada init-repo ~/src/my-ops` creates a private
   repo for your operations.
3. **Declare an operation** — `narada want-mailbox help@company.com` sets up a
   governed mailbox operation with safe defaults.
4. **Set the safety posture** — `narada want-posture` chooses how much
   authority the operation gets (see the trust ladder below).
5. **Verify before anything runs** — `narada preflight` checks credentials,
   connectivity, and policy; `narada explain` shows what the operation will do
   and why it might be blocked.
6. **Activate and run** — `narada activate`, then `pnpm daemon`. Narada syncs,
   evaluates, drafts, and reconciles — logging durable evidence as it goes.

**Prefer a personal assistant first?** The User Site path starts one resident
assistant on your own machine with no project setup. After installing the CLI
(see Get started below):

```
narada install windows-user-site
narada onboarding start --scope user-site --interactive
```

---

## 7. The trust ladder `#trust`

**Section head:**

> Authority is a dial, not a leap of faith.

**Body:**

Every operation runs under an explicit posture you choose — and can tighten or
loosen at any time:

| Posture | What Narada may do |
|---------|--------------------|
| `observe-only` | Watch and report. Nothing else. |
| `draft-only` | Prepare replies and proposals; never send. |
| `review-required` | Act only after explicit human approval. |
| `autonomous` | Execute within the declared policy envelope — still with full evidence and reconciliation. |

**Closer:**

The default for a new mailbox operation is `draft-only`. You grant more
authority only when the evidence has earned it.

---

## 8. Proof, not promises `#proof`

**Section head:**

> Every claim on this page is checkable in the repo.

**Body:**

- **Replay safety** — applying the same event twice yields the same final
  state; idempotency is enforced at durable boundaries, not hoped for.
- **Crash tolerance** — the compiler can stop at any point and converge back to
  correct state. No loss after commit.
- **Two-stage confirmation** — a side effect counts as done only when inbound
  reconciliation observes the result, not when the API accepts the request.
- **Draft-first delivery** — agents and workers never send directly; every
  effect begins as a durable, reviewable intent.
- **Read-only observation** — dashboards and consoles project from durable
  stores; a UI can never mutate state behind your back.

**Closer:**

The invariants are enforced in code and lint-checked in CI — not written in a
whitepaper and left as an exercise for the reader.

---

## 9. Get started `#get-started`

**Section head:**

> Put one operation under governance.

**Lead-in:**

One command installs the `narada` CLI: a self-contained release artifact
with every dependency bundled — nothing to build, no registry resolution on
your machine. Requires Node.js 22+. The scripts are plain text served from
this domain — read them before you run them. Prefer to build from source?
Use the source installers instead (`/install-source.ps1`,
`/install-source.sh`).

```
# Windows (PowerShell)
irm https://narada.systems/install.ps1 | iex
narada demo    # no credentials, no config, no files created

# macOS / Linux
curl -fsSL https://narada.systems/install.sh | bash
narada demo
```

**CTA row:**

- **GitHub** — github.com/narada-core/narada (source, kernel lawbook, quickstart)
- **Docs** — `QUICKSTART.md` for the gold-path first run; `SEMANTICS.md` for the full ontology

**Footer line:**

Narada is open source under the MIT license. Intelligence supplies judgment.
Narada supplies governance.

---

## Claim checklist (internal — do not publish)

Every outward claim above, with its grounding source in this repo:

| Claim | Source |
|-------|--------|
| "AI agents you can actually govern" positioning, subhead | Task #2230 approved messaging |
| Boundary sequence and prevented-collapse table | `README.md` ("What this is") |
| Intelligence-Authority Separation definition | `README.md`; task #2230 blurb 1 |
| Deterministic state compiler, SQLite-backed, replay safety, crash tolerance | `AGENTS.md` (project overview, critical invariants 1–5); task #2230 blurb 2 |
| Vertical-agnostic kernel; mailbox as first vertical; timer/webhook/filesystem/process peers | `README.md`; `AGENTS.md` |
| Governed MCP tool fabric | Task #2230 blurb 4; `.narada/capabilities/mcp-surfaces.json` |
| Operator-grade continuity, resumable multi-session work | Task #2230 blurb 5; `AGENTS.md` (operator packages) |
| Ops-repo model and shaping commands (`init-repo`, `want-mailbox`, `want-posture`, `preflight`, `explain`, `activate`, daemon) | `README.md` ("The Ops-Repo Model", CLI tables); `QUICKSTART.md` |
| Posture names and meanings (`observe-only` → `autonomous`) | `TERMINOLOGY.md` (posture); `README.md` (`want-posture`) |
| `draft-only` default for new mailbox operations | `QUICKSTART.md` (step 3 defaults) |
| User Site commands (`install windows-user-site`, `onboarding start`) | `QUICKSTART.md`; `README.md` (first-run paths) |
| Release-artifact install commands (`irm`/`curl` installers) | `scripts/pack-artifact.mjs` (per-platform fully-bundled tarballs); GitHub prerelease `cli-latest` assets (`narada-cli-<platform>-<arch>.tgz`); installers `public/install.ps1` / `public/install.sh` in the narada.systems repo; source path kept at `/install-source.*` (clones all five repos; see task #2235) |
| `narada demo` zero-setup behavior | `README.md`; `QUICKSTART.md` (path 1) |
| Two-stage confirmation, draft-first delivery, read-only observation | `AGENTS.md` (critical invariants 16–22) |
| Invariants lint-checked in CI | `AGENTS.md` (`pnpm control-plane-lint`, CI workflows) |
| MIT license | `README.md`; `LICENSE` |

**npm status (as of 2026-08-05):** neither `@narada2/cli` nor `@narada-core/cli`
is published on the npm registry. The page therefore does not link npm; it
routes installation through the narada.systems installers (`/install.ps1`,
`/install.sh`), which download the self-contained per-platform CLI artifact
from the `cli-latest` GitHub prerelease and `npm install -g` it — no registry
resolution at install time. Reinstate the npm CTA once `@narada-core/cli` is
actually published.

**No speed promises:** install and first-run time claims are deliberately
absent — speed is not Narada's objective; governed correctness is.

