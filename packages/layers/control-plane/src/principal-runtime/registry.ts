/**
 * Principal Runtime Registry
 *
 * Ephemeral storage for PrincipalRuntime state. Stored outside Site coordinator
 * SQLite by design — if lost, Sites continue running.
 *
 * @see Decision 406: Principal Runtime State Machine
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  PrincipalRuntime,
  PrincipalRuntimeSnapshot,
  CreatePrincipalRuntimeInput,
} from "./types.js";
import {
  createPrincipalRuntime,
  toSnapshot,
} from "./state-machine.js";

export interface PrincipalRuntimeRegistry {
  /** Get a principal by runtime ID */
  get(runtimeId: string): PrincipalRuntime | undefined;

  /** List all principals, optionally filtered by scope */
  list(scopeId?: string): PrincipalRuntime[];

  /** Create a new principal runtime record */
  create(input: CreatePrincipalRuntimeInput): PrincipalRuntime;

  /** Update an existing principal (typically for state transitions) */
  update(runtimeId: string, updater: (p: PrincipalRuntime) => void): PrincipalRuntime | undefined;

  /** Remove a principal runtime record */
  remove(runtimeId: string): boolean;

  /** Get all principals attached to a scope */
  getAttachedToScope(scopeId: string): PrincipalRuntime[];

  /** Get the default (daemon) principal for a scope, if any */
  getDefaultPrincipal(scopeId: string): PrincipalRuntime | undefined;

  /** Snapshot all principals for observation/health */
  snapshot(): PrincipalRuntimeSnapshot[];
}

/** In-memory registry for runtime use */
export class InMemoryPrincipalRuntimeRegistry implements PrincipalRuntimeRegistry {
  private principals = new Map<string, PrincipalRuntime>();

  constructor(options?: { initialRecords?: PrincipalRuntime[] }) {
    if (options?.initialRecords) {
      for (const p of options.initialRecords) {
        this.principals.set(p.runtime_id, p);
      }
    }
  }

  get(runtimeId: string): PrincipalRuntime | undefined {
    return this.principals.get(runtimeId);
  }

  list(scopeId?: string): PrincipalRuntime[] {
    const all = Array.from(this.principals.values());
    if (scopeId === undefined) return all;
    return all.filter((p) => p.scope_id === scopeId);
  }

  create(input: CreatePrincipalRuntimeInput): PrincipalRuntime {
    if (this.principals.has(input.runtime_id)) {
      throw new Error(`PrincipalRuntime ${input.runtime_id} already exists`);
    }
    const principal = createPrincipalRuntime(input);
    this.principals.set(input.runtime_id, principal);
    return principal;
  }

  update(runtimeId: string, updater: (p: PrincipalRuntime) => void): PrincipalRuntime | undefined {
    const principal = this.principals.get(runtimeId);
    if (!principal) return undefined;
    updater(principal);
    return principal;
  }

  remove(runtimeId: string): boolean {
    return this.principals.delete(runtimeId);
  }

  getAttachedToScope(scopeId: string): PrincipalRuntime[] {
    return this.list().filter((p) => p.scope_id === scopeId);
  }

  getDefaultPrincipal(scopeId: string): PrincipalRuntime | undefined {
    return this.list().find(
      (p) => p.scope_id === scopeId && p.principal_type === "worker",
    );
  }

  snapshot(): PrincipalRuntimeSnapshot[] {
    return this.list().map((p) => toSnapshot(p));
  }
}

/** JSON-backed registry that persists to disk */
export class JsonPrincipalRuntimeRegistry implements PrincipalRuntimeRegistry {
  private inMemory: InMemoryPrincipalRuntimeRegistry;
  private filepath: string;
  private writePromise: Promise<void> | null = null;

  constructor(options: { rootDir: string; filename?: string }) {
    this.filepath = join(options.rootDir, options.filename ?? ".principal-runtimes.json");
    this.inMemory = new InMemoryPrincipalRuntimeRegistry();
  }

  /** Wait for any pending persistence to complete. */
  async flush(): Promise<void> {
    if (this.writePromise) {
      await this.writePromise;
    }
  }

  async init(): Promise<void> {
    try {
      const raw = await readFile(this.filepath, "utf8");
      const data = JSON.parse(raw) as PrincipalRuntimeSnapshot[];
      const principals: PrincipalRuntime[] = [];
      for (const snap of data) {
        const principal: PrincipalRuntime = {
          runtime_id: snap.runtime_id,
          principal_id: snap.principal_id,
          principal_type: snap.principal_type,
          state: snap.state,
          scope_id: snap.scope_id,
          attachment_mode: snap.attachment_mode,
          created_at: snap.state_changed_at, // best effort from snapshot
          state_changed_at: snap.state_changed_at,
          last_heartbeat_at: snap.last_heartbeat_at,
          active_work_item_id: snap.active_work_item_id,
          active_session_id: null, // ephemeral: not serialized
          budget_remaining: snap.budget_remaining,
          budget_unit: snap.budget_unit as "tokens" | "seconds" | "cost_cents" | null,
          detail: snap.detail,
        };
        principals.push(principal);
      }
      this.inMemory = new InMemoryPrincipalRuntimeRegistry({ initialRecords: principals });
    } catch {
      // File may not exist yet — start empty
    }
  }

  get(runtimeId: string): PrincipalRuntime | undefined {
    return this.inMemory.get(runtimeId);
  }

  list(scopeId?: string): PrincipalRuntime[] {
    return this.inMemory.list(scopeId);
  }

  create(input: CreatePrincipalRuntimeInput): PrincipalRuntime {
    const result = this.inMemory.create(input);
    this.queuePersist();
    return result;
  }

  update(runtimeId: string, updater: (p: PrincipalRuntime) => void): PrincipalRuntime | undefined {
    const result = this.inMemory.update(runtimeId, updater);
    if (result) this.queuePersist();
    return result;
  }

  remove(runtimeId: string): boolean {
    const result = this.inMemory.remove(runtimeId);
    if (result) this.queuePersist();
    return result;
  }

  getAttachedToScope(scopeId: string): PrincipalRuntime[] {
    return this.inMemory.getAttachedToScope(scopeId);
  }

  getDefaultPrincipal(scopeId: string): PrincipalRuntime | undefined {
    return this.inMemory.getDefaultPrincipal(scopeId);
  }

  snapshot(): PrincipalRuntimeSnapshot[] {
    return this.inMemory.snapshot();
  }

  private queuePersist(): void {
    if (this.writePromise) return;
    this.writePromise = this.persist().finally(() => {
      this.writePromise = null;
    });
  }

  private async persist(): Promise<void> {
    try {
      const dir = this.filepath.split("/").slice(0, -1).join("/");
      await mkdir(dir, { recursive: true });
      const data = this.inMemory.snapshot();
      await writeFile(this.filepath, JSON.stringify(data, null, 2) + "\n", "utf8");
    } catch {
      // Best-effort persistence — ephemeral by design
    }
  }

  /** Get the filepath used for persistence. */
  getFilepath(): string {
    return this.filepath;
  }
}

// Re-export state-machine helpers for convenience
export {
  toSnapshot,
  createPrincipalRuntime,
  canClaimWork,
  canExecute,
  isAttached,
  hasActiveWork,
  isValidTransition as isValidPrincipalRuntimeTransition,
  validNextStates,
  getPrincipalHealth,
} from "./state-machine.js";
