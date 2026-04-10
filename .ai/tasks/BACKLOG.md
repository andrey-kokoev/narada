# Remaining Task Backlog

## Legend
- `[P0]` = Critical path - blocks production
- `[P1]` = Important - needed for reliable production
- `[P2]` = Nice to have - can defer

---

## [P0] Critical Path

### T005: Test Infrastructure
**Owner:** Agent E  
**Est:** 4h  
**Deps:** Agent B (mock adapter for testing)

Unit + integration testing framework:
- Vitest setup with coverage
- Unit tests for: normalize, stores, adapters, runner
- Integration tests: full sync with mock adapter
- Property-based tests for ID normalization

**Blocks:** T007 (performance baselines need tests)

---

### T006: Configuration Validation
**Owner:** Agent E  
**Est:** 2h  
**Deps:** None

Schema validation for config files:
- Zod schema for all config fields
- Validation on load with clear error messages
- Auto-migration for simple format changes
- Config docs generation from schema

**Blocks:** T009 (cleanup needs config options)

---

### T007: Security Hardening
**Owner:** Agent F  
**Est:** 3h  
**Deps:** None

Credential protection:
- Encrypt tokens at rest (keytar/os-keyring)
- Secure temp file handling
- Redact sensitive data from logs
- File permissions check (0600 for creds)

**Blocks:** T013 (publishing - can't publish with plaintext creds)

---

### T008: Batch/Stream Processing
**Owner:** Agent F  
**Est:** 4h  
**Deps:** Agent C (retry layer for backpressure)

Memory-efficient processing:
- Streaming message fetch (pagination)
- Backpressure handling
- Batch writes to disk
- Configurable batch sizes
- Progress callback for large syncs

**Blocks:** None (but needed for >10k messages)

---

## [P1] Important

### T009: Cleanup & Compaction
**Owner:** —  
**Est:** 3h  
**Deps:** T006 (config for retention policy)

Data lifecycle management:
- Periodic tombstone cleanup
- Old message compaction (archive)
- Retention policy enforcement
- Vacuum/rebuild operations

**Blocks:** None

---

### T010: Multi-Mailbox Support
**Owner:** —  
**Est:** 4h  
**Deps:** T008 (batch processing - resource management)

Multiple mailbox sync:
- Config array of mailboxes
- Parallel sync with resource limits
- Per-mailbox health tracking
- Shared token provider

**Blocks:** None

---

### T011: Windows Compatibility
**Owner:** —  
**Est:** 3h  
**Deps:** T007 (file permissions - Windows differs)

Cross-platform support:
- Path separator normalization
- Windows file locking (advisory)
- CRLF handling
- CI tests on Windows

**Blocks:** T013 (publishing should work everywhere)

---

## [P2] Nice to Have

### T012: Webhook/Real-time Sync
**Owner:** —  
**Est:** 6h  
**Deps:** T010 (multi-mailbox - subscription management)

Real-time updates:
- Graph webhook subscription
- Local webhook receiver
- Push-based sync trigger
- Fallback to polling

**Blocks:** None

---

### T013: Package Publishing
**Owner:** —  
**Est:** 2h  
**Deps:** T007 (security), T011 (Windows), T005 (tests pass)

Release automation:
- NPM publish workflow
- Version bumping
- Changelog generation
- Tagging

**Blocks:** None (final milestone)

---

### T014: Backup/Restore CLI
**Owner:** —  
**Est:** 3h  
**Deps:** None

Disaster recovery:
- `backup` command (tar.gz with metadata)
- `restore` command (validation + restore)
- Point-in-time snapshots
- Cross-mailbox restore

**Blocks:** None

---

### T015: Performance Benchmarks
**Owner:** —  
**Est:** 2h  
**Deps:** T005 (test infrastructure), T008 (batch processing)

Benchmarking suite:
- Message throughput (msg/sec)
- Disk I/O patterns
- Memory usage profiles
- Regression detection

**Blocks:** None

---

## Dependency Summary

```
T005 (Tests) ─────────┬──→ T007 (Perf benchmarks need tests)
                      │
T006 (Config val) ────┴──→ T009 (Cleanup needs config)

T007 (Security) ──────┬──→ T011 (Windows - permissions differ)
                      └──→ T013 (Publishing - security required)

T008 (Batch) ─────────┬──→ T010 (Multi-mailbox resource mgmt)
                      └──→ T015 (Benchmarks need batch for scale)

T010 (Multi-mailbox) ──→ T012 (Webhooks - subscription mgmt)

T011 (Windows) ────────→ T013 (Publishing)
T005 (Tests) ──────────→ T013 (Publishing)

T013 (Publishing) = FINAL MILESTONE
```

---

## Next Sprint Recommendation

**Agent E:** T005 + T006 (Testing + Validation)  
**Agent F:** T007 + T008 (Security + Performance)

This gives us: tested, validated, secure, scalable core.
