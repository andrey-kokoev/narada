# Assignment: Agent A - CLI Polish Expert

**Role:** CLI/UX Specialist  
**Scope:** `packages/exchange-fs-sync-cli/`  
**Parallel to:** Agent B (Core Infrastructure)

---

## Task 1: Interactive Init Command (Priority: High)

### Goal
Create `exchange-sync init --interactive` that guides users through setup.

### Current State
`init` command writes a template JSON file. User must manually edit it.

### Desired UX
```bash
$ exchange-sync init --interactive
? Mailbox ID: user@example.com
? Data directory: ./data
? Graph User ID: user@example.com
? Test connection before saving? Yes
? Config file path: ./config.json

Testing connection... ✓
Configuration saved to ./config.json
```

### Implementation Steps

1. **Add dependency** to `package.json`:
   ```json
   "@clack/prompts": "^0.7.0"
   ```
   (or `inquirer` if you prefer - clack is more modern)

2. **Create `src/commands/config-interactive.ts`** OR enhance existing `config.ts`:
   - Detect `--interactive` flag
   - Use prompts to collect values
   - Show defaults from existing template
   - Optional: Test Graph connection

3. **Prompts needed:**
   - `mailbox_id` (default: "user@example.com")
   - `root_dir` (default: "./data")
   - `graph.user_id` (default: same as mailbox_id)
   - `configPath` (default: "./config.json")

4. **Optional: Connection test**:
   - If user confirms, try to fetch token
   - Show success/failure before saving

### Files to Modify
- `package.json` (+ dependency)
- `src/commands/config.ts` (add interactive mode)
- OR `src/commands/config-interactive.ts` (new file)
- `src/main.ts` (wire up command if new file)

---

## Task 2: CLI Unification (Priority: Medium)

### Goal
Remove confusion about which CLI is authoritative.

### Current State
- Core package has `src/cli/` directory
- Separate `-cli` package exists
- AGENTS.md references both

### Investigation Required
1. Check if `packages/exchange-fs-sync/src/cli/main.ts` is used anywhere
2. Check if bin link works for core package
3. Determine: can we delete core `src/cli/` entirely?

### Likely Outcome
- Core `src/cli/` is legacy
- Remove it or add deprecation warnings
- Update AGENTS.md to point only to `-cli` package

### Files to Modify
- `packages/exchange-fs-sync/src/cli/` (delete or deprecate)
- `packages/exchange-fs-sync/AGENTS.md` (update references)
- Root `AGENTS.md` (verify accuracy)

---

## Deliverables Checklist

- [ ] `npm install` works with new dependency
- [ ] `exchange-sync init --interactive` flows through prompts
- [ ] Config file is written with user-provided values
- [ ] (Optional) Connection test works
- [ ] AGENTS.md updated if CLI unification done
- [ ] Build passes: `npm run build`
- [ ] No conflicts with Agent B's work

---

## Handoff Notes for Chief Agent

- If Agent B needs CLI changes, coordinate through chief
- Interactive init should use same config validation as non-interactive
- Consider: should `init` without flags default to interactive in TTY?
