# Segment Definitions

> **PRIVATE — Replace placeholder content with real audience segments.**
>
> **IMPORTANT:** This file must NEVER contain individual customer email addresses,
> names, identifiers, or list export data. Only segment metadata is permitted.

## Schema

This file defines the audience segments available for campaigns. The charter matches mentioned segments against these definitions and validates campaign briefs.

### Required Sections

1. **Segment Catalog** — Name, description, approximate size, criteria
2. **Segment Hierarchy** — Parent/child relationships if any
3. **Exclusion Rules** — Segments that should not be combined
4. **Size Estimates** — Approximate contact counts (rounded)

---

## Placeholder Content

### Segment Catalog

| Segment Name | Description | Approx. Size | Criteria |
|--------------|-------------|--------------|----------|
| All Customers | Entire customer base | ~50,000 | Has made at least one purchase |
| VIP | High-value repeat customers | ~5,000 | 3+ purchases or $500+ lifetime value |
| Active 90 | Recently engaged customers | ~20,000 | Purchase in last 90 days |
| Lapsed 90 | Customers who haven't purchased recently | ~15,000 | Last purchase 90–180 days ago |
| Winback | At-risk customers | ~10,000 | No purchase in 180+ days |
| New Subscribers | Recent email signups | ~2,000 | Subscribed in last 30 days |

### Segment Hierarchy

```
All Customers
├── VIP
├── Active 90
├── Lapsed 90
└── Winback

New Subscribers (separate list, may overlap)
```

### Exclusion Rules

- Do not combine `Winback` with `VIP` — contradictory intent
- `New Subscribers` should not receive promotional pricing campaigns until day 7

### Size Estimates

Sizes are approximate and rounded. Do not use exact counts in briefs.
