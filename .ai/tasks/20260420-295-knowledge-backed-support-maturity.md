# Task 295: Knowledge-Backed Support Maturity

## Chapter

Mailbox Saturation

## Context

Pipeline correctness is no longer the only question for the mailbox vertical. Support quality now depends on where knowledge lives, how mailbox-charter combinations consume it, and how public proof differs from domain-specific support capability.

## Goal

Make the knowledge-backed support layer for mailbox operations explicit, bounded, and coherent.

## Required Work

### 1. Define the knowledge placement model

Clarify the intended shape for mailbox-support knowledge across:

- public repo concepts/contracts
- private ops repo local paths / URLs / SQLite sources
- charter-specific consumption points

### 2. Distinguish proof from knowledge

Document the difference between:

- proving Narada can run the mailbox vertical
- providing the mailbox vertical with domain knowledge needed for good support behavior

### 3. Add compact support playbook examples

Provide a few small, high-signal examples of the kinds of knowledge artifacts or references that should back a support mailbox operation.

### 4. Preserve authority and secrecy boundaries

Knowledge may inform evaluation quality, but it must not become a hidden authority path or require private data inside the public repo.

## Non-Goals

- Do not build generalized RAG.
- Do not build a broad knowledge-management subsystem.
- Do not turn domain priors into runtime mutation logic.

## Acceptance Criteria

- [x] The mailbox knowledge placement model is explicit and coherent.
- [x] Proof surfaces and knowledge surfaces are clearly separated.
- [x] Compact support playbook examples exist.
- [x] Public/private and authority boundaries are preserved.

## Execution Notes

### Deliverables

1. **`docs/mailbox-knowledge-model.md`** (new) — Canonical document defining:
   - Three-layer placement model: public repo (contracts/types), private ops repo (domain content), charter runtime (consumption)
   - Knowledge flow: `knowledge/*.md` → `MailboxContextMaterializer` → `context_materialization` → system prompt → charter output
   - Proof vs Knowledge distinction table and explanation
   - Three compact support playbook examples (login/access, billing, escalation-worthy complaints)
   - Authority and secrecy boundary rules

2. **`docs/first-operation-proof.md`** — Updated with:
   - New "Proof vs Knowledge" section (lines 239–254) explaining that the fixture-backed proof verifies pipeline wiring, not support wisdom
   - Cross-reference to `docs/mailbox-knowledge-model.md`
   - Updated Non-Goals and Related Documents sections

3. **`packages/ops-kit/src/lib/scaffold.ts`** — Updated with:
   - `SAMPLE_PLAYBOOK` constant containing a concise example playbook
   - `scaffoldMailbox` now writes `knowledge/sample-playbook.md` when creating a new mailbox

### Verification

**ops-kit scaffold behavior:**

```
$ cd packages/ops-kit && npx vitest run test/unit/ops-kit.test.ts
 RUN  v1.6.1 /home/andrey/src/narada/packages/ops-kit
 ✓ test/unit/ops-kit.test.ts  (13 tests) 211ms
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

**mailbox materializer behavior (unchanged):**

```
$ cd packages/layers/control-plane && npx vitest run test/unit/charter/mailbox-materializer.test.ts
 RUN  v1.6.1 /home/andrey/src/narada/packages/layers/control-plane
 ✓ test/unit/charter/mailbox-materializer.test.ts  (2 tests) 5ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

**Typecheck note:** Pre-existing typecheck errors in `packages/layers/control-plane/src/observability/queries.ts` and `operator-actions/executor.ts` are unrelated to this task; no control-plane source files were modified.

### Boundary Preservation

- No private data added to public repo
- No new runtime mutation paths introduced
- No charter runtime store access added
- Sample playbook is generic, not domain-specific
- Knowledge remains non-authoritative per the documented invariant
