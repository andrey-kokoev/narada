# Task 178: Correct Task 174 Missing Second-Batch Domain Packs

## Context

Task 174 required adding:

```text
marketplace
crm
inventory
booking
knowledge-base
```

Current review found the implementation is incomplete:

- `docs/domain-packs.md` lists these packs.
- `usc refine --domain marketplace` falls back to `e_commerce`.
- `usc refine --domain crm` falls back to `customer_relationship_management`.
- `usc refine --domain inventory` falls back to `asset-management`.
- `usc refine --domain booking` falls back to `unknown`.
- `usc refine --domain knowledge-base` falls back to `cms-publishing`.
- `packages/domain-packs/marketplace` and `packages/domain-packs/booking` are absent.
- `crm`, `inventory`, and `knowledge-base` are not integrated as working packs.
- `pnpm validate` passes because no examples for those packs are validated.

This makes the docs misleading and leaves Task 174 functionally incomplete.

## Goal

Complete Task 174 as originally specified.

Explicit domain selection must return the requested pack ID, not a built-in or neighboring fallback.

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Fixes

### 1. Implement all five packs

Add or repair:

```text
packages/domain-packs/marketplace/
packages/domain-packs/crm/
packages/domain-packs/inventory/
packages/domain-packs/booking/
packages/domain-packs/knowledge-base/
```

Each must follow the established domain-pack structure:

```text
package.json
src/index.js
src/refinement.js
schemas/<pack>-context.schema.json
templates/question-map.md
examples/<pack>.refinement.json
```

### 2. Integrate loader

Update:

```text
packages/compiler/src/domain-packs.js
```

Ensure all five packs are statically imported and included in `domainPacks`.

### 3. Ensure explicit domain wins

These commands must output matching `detected_domain` values:

```bash
pnpm usc -- refine --intent "I want marketplace" --domain marketplace --format json
pnpm usc -- refine --intent "I want CRM" --domain crm --format json
pnpm usc -- refine --intent "I want inventory system" --domain inventory --format json
pnpm usc -- refine --intent "I want booking system" --domain booking --format json
pnpm usc -- refine --intent "I want knowledge base" --domain knowledge-base --format json
```

Expected:

```text
marketplace
crm
inventory
booking
knowledge-base
```

### 4. Add examples to validation

Ensure each new pack has a `.refinement.json` example and that `pnpm validate` validates it.

### 5. Preserve non-assumption discipline

Follow Task 174’s constraints:

- marketplace must not assume two-sided payments, escrow, or a specific provider
- CRM must not assume sales-led CRM only
- inventory must not assume FIFO/LIFO/weighted-average costing
- booking must not assume payments or self-booking
- knowledge-base must not assume RAG/LLM use

## Acceptance Criteria

- All five packs exist as real package directories.
- All five packs export usable domain pack objects.
- `--domain <pack>` returns the requested `detected_domain`.
- Examples parse and validate.
- `docs/domain-packs.md` accurately reflects implemented packs.
- `pnpm validate` passes.
- Working tree is clean after commit.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
for spec in \
  'marketplace|I want marketplace' \
  'crm|I want CRM' \
  'inventory|I want inventory system' \
  'booking|I want booking system' \
  'knowledge-base|I want knowledge base'; do
  domain=${spec%%|*}
  intent=${spec#*|}
  out=$(pnpm --silent usc -- refine --intent "$intent" --domain "$domain" --format json)
  node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(0,"utf8")); if (data.detected_domain !== process.argv[1]) { console.error(`expected ${process.argv[1]}, got ${data.detected_domain}`); process.exit(1); }' "$domain" <<< "$out"
done
pnpm validate
git status --short
```

## Output

Commit changes in `/home/andrey/src/narada.usc`.

Report:

- commit hash
- packs fixed/added
- verification performed
- residual work, if any

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.
