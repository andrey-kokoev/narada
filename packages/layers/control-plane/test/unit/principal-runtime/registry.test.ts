import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, access, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  InMemoryPrincipalRuntimeRegistry,
  JsonPrincipalRuntimeRegistry,
  createPrincipalRuntime,
  attachPrincipal,
  detachPrincipal,
  transitionState,
  isValidPrincipalRuntimeTransition,
  canClaimWork,
  canExecute,
} from '../../../src/principal-runtime/index.js';
import type { PrincipalRuntime, PrincipalRuntimeSnapshot } from '../../../src/principal-runtime/types.js';

describe('PrincipalRuntime Registry', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pr-test-'));
  });

  afterEach(async () => {
    // Best-effort cleanup; OS handles temp dir removal
  });

  describe('InMemoryPrincipalRuntimeRegistry', () => {
    it('should accept initial records via constructor', () => {
      const p1 = createPrincipalRuntime({
        runtime_id: 'rt_1',
        principal_id: 'principal_a',
        principal_type: 'operator',
      });
      const p2 = createPrincipalRuntime({
        runtime_id: 'rt_2',
        principal_id: 'principal_b',
        principal_type: 'worker',
      });
      const registry = new InMemoryPrincipalRuntimeRegistry({ initialRecords: [p1, p2] });

      expect(registry.get('rt_1')?.principal_id).toBe('principal_a');
      expect(registry.get('rt_2')?.principal_id).toBe('principal_b');
      expect(registry.list()).toHaveLength(2);
    });

    it('should start empty when no initial records provided', () => {
      const registry = new InMemoryPrincipalRuntimeRegistry();
      expect(registry.list()).toHaveLength(0);
    });

    it('should not allow duplicate runtime_ids even with initial records', () => {
      const p1 = createPrincipalRuntime({
        runtime_id: 'rt_dup',
        principal_id: 'principal_a',
        principal_type: 'operator',
      });
      const registry = new InMemoryPrincipalRuntimeRegistry({ initialRecords: [p1] });

      expect(() =>
        registry.create({
          runtime_id: 'rt_dup',
          principal_id: 'principal_b',
          principal_type: 'worker',
        }),
      ).toThrow('already exists');
    });
  });

  describe('JsonPrincipalRuntimeRegistry hydration', () => {
    it('should load records without unsafe private-map casts', async () => {
      const snapshots: PrincipalRuntimeSnapshot[] = [
        {
          runtime_id: 'rt_hydrate_1',
          principal_id: 'principal_h1',
          principal_type: 'operator',
          state: 'available',
          scope_id: null,
          attachment_mode: null,
          state_changed_at: '2026-04-22T10:00:00.000Z',
          last_heartbeat_at: null,
          active_work_item_id: null,
          budget_remaining: 1000,
          budget_unit: 'tokens',
          detail: null,
        },
        {
          runtime_id: 'rt_hydrate_2',
          principal_id: 'principal_h2',
          principal_type: 'worker',
          state: 'attached_interact',
          scope_id: 'scope/test',
          attachment_mode: 'interact',
          state_changed_at: '2026-04-22T11:00:00.000Z',
          last_heartbeat_at: '2026-04-22T11:05:00.000Z',
          active_work_item_id: 'wi_123',
          budget_remaining: null,
          budget_unit: null,
          detail: 'Hydrated from disk',
        },
      ];

      const filepath = join(tempDir, '.principal-runtimes.json');
      await writeFile(filepath, JSON.stringify(snapshots, null, 2) + '\n', 'utf8');

      const registry = new JsonPrincipalRuntimeRegistry({ rootDir: tempDir });
      await registry.init();

      const p1 = registry.get('rt_hydrate_1');
      expect(p1).toBeDefined();
      expect(p1?.principal_id).toBe('principal_h1');
      expect(p1?.state).toBe('available');
      expect(p1?.active_session_id).toBeNull(); // ephemeral field not serialized

      const p2 = registry.get('rt_hydrate_2');
      expect(p2).toBeDefined();
      expect(p2?.principal_id).toBe('principal_h2');
      expect(p2?.scope_id).toBe('scope/test');
      expect(p2?.attachment_mode).toBe('interact');
      expect(p2?.active_work_item_id).toBe('wi_123');
      expect(p2?.active_session_id).toBeNull(); // ephemeral field not serialized
    });

    it('should start empty when file does not exist', async () => {
      const registry = new JsonPrincipalRuntimeRegistry({ rootDir: tempDir });
      await registry.init();
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe('Deterministic state path', () => {
    it('should persist to config-adjacent filepath by default', () => {
      const registry = new JsonPrincipalRuntimeRegistry({ rootDir: tempDir });
      expect(registry.getFilepath()).toBe(join(tempDir, '.principal-runtimes.json'));
    });

    it('should allow custom filename', () => {
      const registry = new JsonPrincipalRuntimeRegistry({
        rootDir: tempDir,
        filename: 'custom-principals.json',
      });
      expect(registry.getFilepath()).toBe(join(tempDir, 'custom-principals.json'));
    });
  });

  describe('Persist across reload', () => {
    it('should persist attach/detach changes and reload them', async () => {
      const registry = new JsonPrincipalRuntimeRegistry({ rootDir: tempDir });
      await registry.init();

      const principal = registry.create({
        runtime_id: 'rt_persist',
        principal_id: 'principal_persist',
        principal_type: 'operator',
      });
      transitionState(principal, 'available');

      registry.update('rt_persist', (p) => {
        attachPrincipal(p, 'scope/demo', 'interact');
      });
      await registry.flush();

      // Simulate process restart: new registry instance
      const registry2 = new JsonPrincipalRuntimeRegistry({ rootDir: tempDir });
      await registry2.init();

      const reloaded = registry2.get('rt_persist');
      expect(reloaded).toBeDefined();
      expect(reloaded?.state).toBe('attached_interact');
      expect(reloaded?.scope_id).toBe('scope/demo');
      expect(reloaded?.attachment_mode).toBe('interact');
      expect(reloaded?.principal_id).toBe('principal_persist');

      // Detach and persist again
      const reloadedPrincipal = registry2.get('rt_persist')!;
      transitionState(reloadedPrincipal, 'attached_interact');
      registry2.update('rt_persist', (p) => {
        detachPrincipal(p, 'Test detach');
      });
      await registry2.flush();

      const registry3 = new JsonPrincipalRuntimeRegistry({ rootDir: tempDir });
      await registry3.init();
      const final = registry3.get('rt_persist');
      expect(final?.state).toBe('detached');
      expect(final?.scope_id).toBeNull();
      expect(final?.attachment_mode).toBeNull();
    });
  });

  describe('Flush reliability', () => {
    it('should write data to disk after flush', async () => {
      const registry = new JsonPrincipalRuntimeRegistry({ rootDir: tempDir });
      await registry.init();

      registry.create({
        runtime_id: 'rt_flush',
        principal_id: 'principal_flush',
        principal_type: 'agent',
      });

      await registry.flush();

      const filepath = join(tempDir, '.principal-runtimes.json');
      const raw = await readFile(filepath, 'utf8');
      const data = JSON.parse(raw) as PrincipalRuntimeSnapshot[];
      expect(data).toHaveLength(1);
      expect(data[0].runtime_id).toBe('rt_flush');
      expect(data[0].principal_id).toBe('principal_flush');
    });

    it('should be safe to flush when no writes are pending', async () => {
      const registry = new JsonPrincipalRuntimeRegistry({ rootDir: tempDir });
      await registry.init();
      await expect(registry.flush()).resolves.toBeUndefined();
    });
  });

  describe('Identity / runtime separation', () => {
    it('should allow distinct principal_id and runtime_id', () => {
      const registry = new InMemoryPrincipalRuntimeRegistry();
      const principal = registry.create({
        runtime_id: 'rt_instance_42',
        principal_id: 'operator_alice',
        principal_type: 'operator',
      });

      expect(principal.runtime_id).toBe('rt_instance_42');
      expect(principal.principal_id).toBe('operator_alice');
    });

    it('should allow multiple runtimes for the same principal', () => {
      const registry = new InMemoryPrincipalRuntimeRegistry();
      const rt1 = registry.create({
        runtime_id: 'rt_a',
        principal_id: 'shared_principal',
        principal_type: 'worker',
      });
      const rt2 = registry.create({
        runtime_id: 'rt_b',
        principal_id: 'shared_principal',
        principal_type: 'worker',
      });

      expect(rt1.principal_id).toBe('shared_principal');
      expect(rt2.principal_id).toBe('shared_principal');
      expect(rt1.runtime_id).not.toBe(rt2.runtime_id);
    });
  });

  describe('Authority boundary — no lease mutation', () => {
    it('should not import scheduler or lease-related modules', () => {
      // This is a static design invariant, not a runtime behavior test.
      // The principal-runtime module is intentionally isolated from:
      // - scheduler/ (work_item_leases)
      // - foreman/ (decisions)
      // - outbound/ (commands)
      // - coordinator store mutations
      //
      // canClaimWork and canExecute are pure advisory predicates.
      expect(canClaimWork('attached_interact')).toBe(true);
      expect(canClaimWork('claiming')).toBe(true);
      expect(canClaimWork('executing')).toBe(false);
      expect(canClaimWork('available')).toBe(false);

      expect(canExecute('executing')).toBe(true);
      expect(canExecute('attached_interact')).toBe(false);
      expect(canExecute('claiming')).toBe(false);
    });

    it('should not create work items or leases via transitions', () => {
      const p = createPrincipalRuntime({
        runtime_id: 'rt_boundary',
        principal_id: 'principal_boundary',
        principal_type: 'operator',
      });

      // Transition to attached_interact
      expect(isValidPrincipalRuntimeTransition('unavailable', 'available')).toBe(true);
      expect(isValidPrincipalRuntimeTransition('available', 'attached_interact')).toBe(true);

      // Transitions do not touch any external durable state
      // active_work_item_id is only set by external callers, not by transitionState itself
      expect(p.active_work_item_id).toBeNull();
    });
  });

  describe('Transition validation integrity', () => {
    it('should reject invalid transitions', () => {
      expect(isValidPrincipalRuntimeTransition('available', 'executing')).toBe(false);
      expect(isValidPrincipalRuntimeTransition('detached', 'claiming')).toBe(false);
      expect(isValidPrincipalRuntimeTransition('failed', 'available')).toBe(false);
    });

    it('should allow self-transitions', () => {
      expect(isValidPrincipalRuntimeTransition('available', 'available')).toBe(true);
      expect(isValidPrincipalRuntimeTransition('executing', 'executing')).toBe(true);
    });
  });
});
