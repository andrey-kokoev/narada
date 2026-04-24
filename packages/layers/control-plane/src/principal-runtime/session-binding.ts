/**
 * Principal Session Binding Registry
 *
 * Binds Narada principals to Kimi CLI session handles.
 * Ephemeral by design — if lost, principals re-bind on next dispatch.
 *
 * @see Decision 574: Kimi CLI Principal Session Binding Contract
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/** A binding between a Narada principal and a Kimi CLI session */
export interface KimiSessionBinding {
  /** Narada principal (e.g., "a2") */
  principal_id: string;

  /** Opaque Kimi session ID — the operational handle */
  session_id: string;

  /** Human label (advisory, not unique) */
  session_title: string | null;

  /** ISO timestamp of binding */
  bound_at: string;

  /** ISO timestamp of last successful use */
  last_verified_at: string;

  /** Who/what created the binding */
  bound_by: "dispatch" | "operator" | "auto_detect";
}

/** Serializable snapshot of all bindings */
export interface PrincipalSessionBindingSnapshot {
  bindings: KimiSessionBinding[];
  updated_at: string;
}

/** In-memory registry for runtime use */
export class InMemoryPrincipalSessionBindingRegistry {
  private bindings = new Map<string, KimiSessionBinding>();

  constructor(options?: { initialBindings?: KimiSessionBinding[] }) {
    if (options?.initialBindings) {
      for (const b of options.initialBindings) {
        this.bindings.set(b.principal_id, b);
      }
    }
  }

  /** Get a principal's binding */
  getBinding(principalId: string): KimiSessionBinding | undefined {
    return this.bindings.get(principalId);
  }

  /** Set or update a binding */
  setBinding(binding: KimiSessionBinding): void {
    this.bindings.set(binding.principal_id, binding);
  }

  /** Remove a binding */
  removeBinding(principalId: string): boolean {
    return this.bindings.delete(principalId);
  }

  /** List all bindings */
  listBindings(): KimiSessionBinding[] {
    return Array.from(this.bindings.values());
  }

  /** Resolve principal to session handle (id + title) */
  resolve(principalId: string): { session_id: string; session_title: string | null } | undefined {
    const binding = this.bindings.get(principalId);
    if (!binding) return undefined;
    return {
      session_id: binding.session_id,
      session_title: binding.session_title,
    };
  }

  /** Check if a binding exists */
  hasBinding(principalId: string): boolean {
    return this.bindings.has(principalId);
  }

  /** Count bindings */
  count(): number {
    return this.bindings.size;
  }
}

/** JSON-backed registry that persists to disk */
export class JsonPrincipalSessionBindingRegistry extends InMemoryPrincipalSessionBindingRegistry {
  private filepath: string;
  private writePromise: Promise<void> | null = null;

  constructor(options: { rootDir: string; filename?: string }) {
    super();
    this.filepath = join(
      options.rootDir,
      options.filename ?? "principal-session-bindings.json",
    );
  }

  /** Wait for any pending persistence to complete. */
  async flush(): Promise<void> {
    if (this.writePromise) {
      await this.writePromise;
    }
  }

  /** Load bindings from disk. Safe to call multiple times. */
  async init(): Promise<void> {
    try {
      const raw = await readFile(this.filepath, "utf8");
      const snapshot = JSON.parse(raw) as PrincipalSessionBindingSnapshot;

      if (!snapshot || typeof snapshot !== "object") {
        // Corrupt: not an object. Treat as empty.
        return;
      }

      const bindings = Array.isArray(snapshot.bindings) ? snapshot.bindings : [];
      for (const b of bindings) {
        if (isValidBinding(b)) {
          this.setBinding(b);
        }
      }
    } catch {
      // File may not exist yet or JSON may be corrupt — start empty.
      // Ephemeral by design; re-bind on next dispatch.
    }
  }

  override setBinding(binding: KimiSessionBinding): void {
    super.setBinding(binding);
    this.queuePersist();
  }

  override removeBinding(principalId: string): boolean {
    const result = super.removeBinding(principalId);
    if (result) this.queuePersist();
    return result;
  }

  /** Get the filepath used for persistence. */
  getFilepath(): string {
    return this.filepath;
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
      const snapshot: PrincipalSessionBindingSnapshot = {
        bindings: this.listBindings(),
        updated_at: new Date().toISOString(),
      };
      await writeFile(
        this.filepath,
        JSON.stringify(snapshot, null, 2) + "\n",
        "utf8",
      );
    } catch {
      // Best-effort persistence — ephemeral by design
    }
  }
}

/** Validate that a value is a well-formed KimiSessionBinding */
function isValidBinding(value: unknown): value is KimiSessionBinding {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.principal_id === "string" &&
    typeof b.session_id === "string" &&
    (b.session_title === null || typeof b.session_title === "string") &&
    typeof b.bound_at === "string" &&
    typeof b.last_verified_at === "string" &&
    typeof b.bound_by === "string" &&
    ["dispatch", "operator", "auto_detect"].includes(b.bound_by)
  );
}
