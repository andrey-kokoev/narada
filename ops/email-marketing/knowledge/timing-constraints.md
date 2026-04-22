# Timing Constraints

> **PRIVATE — Replace placeholder content with real business calendar rules.**

## Schema

This file defines lead times, blackout dates, and preferred send windows for campaigns. The charter validates proposed timing against these constraints.

### Required Sections

1. **Lead Times** — Minimum advance notice per campaign type
2. **Blackout Dates** — Dates when no campaigns may be sent
3. **Preferred Send Windows** — Day-of-week and time-of-day preferences
4. **Business Calendar** — Working days, holidays, and special events
5. **Relative Date Resolution** — How relative phrases ("next week") map to absolute dates

---

## Placeholder Content

### Lead Times

| Campaign Type | Minimum Lead Time |
|---------------|-------------------|
| Promotional | 3 business days |
| Newsletter | 1 business day |
| Welcome series | Same day |
| Re-engagement | 2 business days |

### Blackout Dates

| Date | Reason |
|------|--------|
| 2026-12-25 | Christmas Day |
| 2026-01-01 | New Year's Day |
| 2026-11-26 | Thanksgiving (US) |

### Preferred Send Windows

| Day | Preferred Time (ET) |
|-----|---------------------|
| Tuesday | 10:00–11:00 |
| Wednesday | 10:00–11:00 |
| Thursday | 14:00–15:00 |

Avoid: Mondays (high inbox volume), Fridays (low engagement), weekends.

### Business Calendar

- Working days: Monday–Friday
- Time zone: Eastern Time (ET)
- Holidays follow US federal calendar

### Relative Date Resolution

| Phrase | Resolution Rule |
|--------|-----------------|
| "today" | Current business day |
| "tomorrow" | Next business day |
| "next week" | Next Tuesday |
| "by Friday" | Friday of current week |
| "ASAP" | 3 business days from today |
