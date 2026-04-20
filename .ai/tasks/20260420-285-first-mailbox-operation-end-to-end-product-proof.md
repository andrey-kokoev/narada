# Task 285: First Mailbox Operation End-to-End Product Proof

## Chapter

Operation Realization

## Context

The support mailbox is Narada's first real vertical proof. It should be treated as a product proof, not as scattered implementation evidence across repos and conversations.

## Goal

Create one convincing end-to-end proof that Narada can support a real mailbox operation from stored facts through evaluation to draft proposal and operator review.

## Required Work

### 1. Canonical First Operation

Define the first mailbox operation as the canonical proof case, including:

- operation shape
- charter/runtime posture
- knowledge inputs if required
- expected operator loop

### 2. Proof Artifacts

Ensure the proof has concrete artifacts, such as:

- fixture-backed or replayable scenario
- runbook / walkthrough
- expected outputs or inspection checkpoints
- boundaries between public repo vs private ops repo responsibilities

### 3. Live/Fixture Pairing

Make the relationship explicit between:

- fixture-backed proof
- real ops-repo execution

The user should be able to understand what is proven offline and what must be exercised in the live repo.

## Non-Goals

- Do not broaden to many verticals.
- Do not require autonomous send.

## Acceptance Criteria

- [ ] The first mailbox operation is defined as the canonical product proof.
- [ ] Proof artifacts are concrete and runnable/inspectable.
- [ ] Fixture-backed and live-backed responsibilities are explicitly separated.
- [ ] The path reaches draft proposal under real operation conditions.
