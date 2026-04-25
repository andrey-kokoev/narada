# Chief Agent Coordination Plan

## Role
Integrate work from Agent A (CLI) and Agent B (Core) into cohesive system.

## Parallel Work Strategy

### No-Conflict Zones
| Agent A (CLI) | Agent B (Core) |
|---------------|----------------|
| `packages/exchange-fs-sync-cli/` | `packages/exchange-fs-sync/` |
| Adds `@clack/prompts` | Adds mock adapter |
| Modifies `config.ts` | Modifies `src/index.ts` exports |
| Updates CLI docs | Adds `health.ts` |

### Sync Points

**T=0: Start**
Both agents pull latest main which includes:
- Status command
- Human formatter (Agent Right)
- Progress bars
- Working build

**T=1: Mid-check (estimated 1 hour)**
Chief reviews both branches:
- Are dependencies compatible?
- Any shared file conflicts?
- Mock adapter exports needed by CLI?

**T=2: Integration**
Chief merges both branches:
- Resolve any conflicts
- Run full build
- Verify both agents' features work together

### Conflict Resolution Rules

1. **Package.json conflicts**: Chief decides, both agents informed
2. **Shared types**: Agent B (core) owns types, Agent A consumes
3. **Documentation**: Agent A owns CLI docs, Agent B owns core docs

### Integration Tests

After merge, verify:
```bash
# Both packages build
cd packages/exchange-fs-sync && npm run build
cd packages/exchange-fs-sync-cli && npm run build

# CLI with core works
exchange-sync init
exchange-sync status

# Mock adapter works (Agent B)
# (If Agent A made test script, it should use mock)

# Interactive init works (Agent A)
exchange-sync init --interactive
```

### Communication Protocol

- Agents work independently
- Blockers go through chief
- Daily standup: agents report progress to chief
- Chief makes integration decisions

## Success Criteria

- [ ] Agent A's interactive init works
- [ ] Agent B's mock adapter works
- [ ] Core exports complete
- [ ] No build errors
- [ ] All tests pass
