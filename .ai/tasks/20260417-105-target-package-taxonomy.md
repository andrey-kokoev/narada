# Target Package Taxonomy

## Mission
Define the target repository package structure so it reflects the architecture directly, instead of the historical `exchange-*` naming.

## Target Shape

```text
packages/
  layers/
    kernel/
    foreman/
    scheduler/
    outbound/
    observation/
    daemon/
    cli/
  verticals/
    mailbox/
    search/
  domains/
    charters/
    obligations/
    knowledge/
```

## Meaning

- `layers/`: system mechanics and control-plane layers
- `verticals/`: domain-specific source/application verticals
- `domains/`: policy and business subsystems

## Mapping From Current Packages

- `exchange-fs-sync` → mostly `verticals/mailbox`, with some code that likely belongs in `layers/*` and `domains/*`
- `exchange-fs-sync-cli` → `layers/cli`
- `exchange-fs-sync-daemon` → `layers/daemon`
- `exchange-fs-sync-search` → `verticals/search`
- `charters` → `domains/charters`

## Goals

- package names reflect concepts, not historical product names
- root taxonomy matches the architecture
- kernel-level docs and mailbox-vertical docs can be separated cleanly

## Definition Of Done

- [ ] target taxonomy is accepted as the end-state structure
- [ ] current packages are mapped to target concepts
- [ ] future tasks use this taxonomy instead of adding new `exchange-*` names
