# Troubleshooting Guide

## Quick Diagnostics

```bash
# Check system health
cd packages/exchange-fs-sync

# 1. Verify config is valid
node -e "import('./src/config/load.js').then(m => m.loadConfig({path:'./config.json'})).then(c => console.log('Config OK:', c.scopes.length, 'scope(s)'))"

# 2. Check data directory structure
ls -la data/
ls -la data/state/
ls -la data/messages/ | head -20

# 3. Count objects
find data/messages -name "record.json" | wc -l
find data/state/apply-log -name "*.json" | wc -l

# 4. Check cursor
cat data/state/cursor.json 2>/dev/null || echo "No cursor (first run)"

# 5. Check for lock
ls data/state/sync.lock/ 2>/dev/null && echo "LOCKED" || echo "Not locked"
```

---

## Error Messages

### "No Graph auth configuration found"

**Cause**: No valid authentication credentials provided.

**Check**:
```bash
echo $GRAPH_ACCESS_TOKEN
echo $GRAPH_TENANT_ID
echo $GRAPH_CLIENT_ID
echo $GRAPH_CLIENT_SECRET
```

**Fix**:
- Set `GRAPH_ACCESS_TOKEN`, OR
- Set `GRAPH_TENANT_ID` + `GRAPH_CLIENT_ID` + `GRAPH_CLIENT_SECRET`, OR
- Add credentials to `config.json` (not recommended for production)

---

### "Graph request failed 401"

**Cause**: Token is invalid or expired.

**Check**: Token expiry if using static token.

**Fix**:
- Refresh `GRAPH_ACCESS_TOKEN`
- Check app registration has `Mail.Read` permission
- Verify user has access to the mailbox

---

### "Graph request failed 403"

**Cause**: Insufficient permissions.

**Fix**:
- Ensure Azure AD app has `Mail.Read` or `Mail.ReadWrite`
- Admin consent may be required for tenant-wide apps
- Check if user mailbox is accessible

---

### "Delta query did not return @odata.deltaLink"

**Cause**: Graph API response missing required delta link. Usually indicates:
- Query was interrupted
- Token expired mid-request
- API issue

**Fix**: Retry the sync. The cursor wasn't committed, so it's safe to restart.

---

### "Failed to acquire lock within timeout"

**Cause**: Another process is holding the lock, or a previous run crashed.

**Check**:
```bash
ls -la data/state/sync.lock/
cat data/state/sync.lock/meta.json 2>/dev/null
```

**Fix**:
1. Wait 5 minutes (stale lock detection will clear it)
2. Or manually remove if sure no process is running:
   ```bash
   rm -rf data/state/sync.lock/
   ```

**Prevention**: Always ensure process exits cleanly (handles SIGINT/SIGTERM).

---

### "Current implementation requires exactly one included_container_ref"

**Cause**: Config has multiple folders in `scope.included_container_refs`.

**Fix**: Use single folder only:
```json
"scope": {
  "included_container_refs": ["inbox"]
}
```

---

### "Cannot commit empty cursor"

**Cause**: Adapter returned empty cursor. Indicates Graph API issue.

**Fix**: Check Graph API health, retry.

---

### "Invalid cursor file"

**Cause**: `state/cursor.json` is corrupted or manually edited.

**Fix**:
1. Check contents: `cat data/state/cursor.json`
2. If corrupted, delete and restart (will do full sync):
   ```bash
   rm data/state/cursor.json
   ```

---

### "Mailbox mismatch"

**Cause**: Configured scope ID doesn't match cursor's stored `mailbox_id`.

**Fix**:
- Update config scope to match cursor, OR
- Delete cursor to start fresh:
  ```bash
  rm data/state/cursor.json
  ```

---

## Behavioral Issues

### Same events being applied repeatedly

**Symptoms**: `applied_count` stays high, `skipped_count` stays 0 on every run.

**Diagnosis**:
```bash
# Check if apply-log is growing
find data/state/apply-log -name "*.json" | wc -l
```

**Causes**:
1. **Apply-log not being written**: Check permissions on `data/state/apply-log/`
2. **Event ID changing**: `stable_stringify` not deterministic (bug)
3. **Cursor not advancing**: Check `state/cursor.json` updates

**Fix**:
- Verify filesystem permissions
- Check that `mark_applied` is being called before cursor commit
- Look for errors in logs between apply and cursor commit

---

### Messages missing from views

**Symptoms**: Message exists in `data/messages/` but not in `data/views/by-thread/`.

**Diagnosis**:
```bash
# Check if message has conversation_id
cat "data/messages/$(echo 'msg-id' | jq -sRr @uri)/record.json" | jq '.conversation_id'

# Check view exists
ls "data/views/by-thread/$(echo 'conv-id' | jq -sRr @uri)/members/"
```

**Causes**:
1. Message has no `conversation_id` (rare but valid)
2. View update failed (check logs)
3. View was corrupted

**Fix**:
- Rebuild views manually:
  ```typescript
  import { FileViewStore } from "./src/persistence/views.js";
  const views = new FileViewStore({ rootDir: "./data" });
  await views.rebuildAll();
  ```

---

### Disk space growing rapidly

**Causes**:
1. **Blobs not being deduplicated**: Check `data/blobs/sha256/`
2. **Temp files accumulating**: Check `data/tmp/`
3. **Apply-log growing**: One file per unique event (expected)

**Diagnosis**:
```bash
du -sh data/*
du -sh data/blobs/sha256/*
ls data/tmp/ | wc -l
```

**Fix**:
- Enable `cleanup_tmp_on_startup: true` in config
- For apply-log: this is expected growth; each unique event gets one small file
- For blobs: deduplication should prevent duplicates; check if working

---

### Slow sync performance

**Symptoms**: High `duration_ms` relative to `event_count`.

**Causes**:
1. **Large attachments**: `attachment_policy: "include_content"` downloads full content
2. **Many pages**: Large folders require many delta pagination requests
3. **Full HTML bodies**: `body_policy: "text_and_html"` doubles body storage
4. **Filesystem latency**: Network storage (NFS, SMB) slows atomic writes

**Diagnosis**:
```bash
# Check attachment sizes
find data/blobs -type f -exec ls -lh {} \; | sort -k5 -h | tail -10

# Check message count
cat data/state/cursor.json | jq
```

**Fix**:
- Use `attachment_policy: "metadata_only"` for faster syncs
- Use `body_policy: "text_only"` for smaller storage
- Ensure `data/` is on local SSD, not network storage

---

### Message appears in wrong folder view

**Symptoms**: Message symlink exists in `by-folder/X/` but should be in `by-folder/Y/`.

**Cause**: Message was moved in Exchange, but view wasn't updated correctly (rare race condition).

**Fix**:
- Full view rebuild (see above)
- Check that `normalize_folder_ref` function in adapter config returns correct folder refs

---

## Data Corruption Recovery

### Scenario: Suspect corrupted message

**Check**:
```bash
# Validate JSON
cat "data/messages/$(echo 'msg-id' | jq -sRr @uri)/record.json" | jq . > /dev/null && echo "Valid JSON" || echo "Invalid JSON"

# Check required fields
cat "data/messages/$(echo 'msg-id' | jq -sRr @uri)/record.json" | jq '{message_id, subject, folder_refs}'
```

**Recovery**:
1. Delete specific message directory:
   ```bash
   rm -rf "data/messages/$(echo 'msg-id' | jq -sRr @uri)"
   ```
2. Remove its apply-log markers (or leave them—harmless):
   ```bash
   # Find and remove markers for this message (advanced)
   find data/state/apply-log -name "*.json" -exec sh -c 'grep -q "msg-id" "$1" && rm "$1"' _ {} \;
   ```
3. Re-sync (event will be re-applied)

### Scenario: Complete reset

**Nuclear option**: Delete everything and start fresh.

```bash
# Stop any running sync
# Delete all data
rm -rf data/*

# Re-run sync (will do full initial sync)
```

---

## Debugging Techniques

### Enable Console Logging

Add temporarily to `src/runner/sync-once.ts`:

```typescript
console.log("[sync] Starting with cursor:", priorCursor);
console.log("[sync] Fetched batch:", batch.events.length, "events");
for (const event of batch.events) {
  console.log("[sync] Processing event:", event.event_id, event.event_kind);
}
console.log("[sync] Committing cursor:", batch.next_cursor);
```

### Trace Event Processing

Add to `src/projector/apply-event.ts`:

```typescript
console.log("[apply] Event:", event.event_id, event.event_kind, event.message_id);
```

### Check Graph API Response

Add to `src/adapter/graph/client.ts`:

```typescript
console.log("[graph] Request:", url);
console.log("[graph] Response status:", response.status);
```

---

## Getting Help

When reporting issues, include:

1. **Config** (redact secrets):
   ```bash
   cat config.json | jq '{root_dir, scopes: [.scopes[] | {scope_id, root_dir, scope, normalize}]}'
   ```

2. **Last sync result**:
   ```bash
   cat data/state/cursor.json
   ls data/state/
   ```

3. **Error message** (full stack trace)

4. **System info**:
   ```bash
   node --version
   pnpm --version
   uname -a
   df -h data/
   ```

---

## See Also

- [03-persistence.md](03-persistence.md) — Understanding the storage layer
- [06-configuration.md](06-configuration.md) — Configuration errors
- [08-quickstart.md](08-quickstart.md) — Initial setup issues
- [Package AGENTS.md](../AGENTS.md) — Debugging tips and file locations
