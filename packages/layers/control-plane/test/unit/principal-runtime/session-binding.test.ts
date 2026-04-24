import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, access, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InMemoryPrincipalSessionBindingRegistry,
  JsonPrincipalSessionBindingRegistry,
} from "../../../src/principal-runtime/session-binding.js";
import type { KimiSessionBinding } from "../../../src/principal-runtime/session-binding.js";

function makeBinding(overrides?: Partial<KimiSessionBinding>): KimiSessionBinding {
  return {
    principal_id: "a2",
    session_id: "sess_01JR9ABC",
    session_title: "a2",
    bound_at: "2026-04-24T12:00:00Z",
    last_verified_at: "2026-04-24T12:00:00Z",
    bound_by: "operator",
    ...overrides,
  };
}

describe("PrincipalSessionBindingRegistry", () => {
  describe("InMemoryPrincipalSessionBindingRegistry", () => {
    it("starts empty", () => {
      const registry = new InMemoryPrincipalSessionBindingRegistry();
      expect(registry.count()).toBe(0);
      expect(registry.listBindings()).toEqual([]);
    });

    it("accepts initial bindings via constructor", () => {
      const b1 = makeBinding({ principal_id: "a1" });
      const b2 = makeBinding({ principal_id: "a2" });
      const registry = new InMemoryPrincipalSessionBindingRegistry({
        initialBindings: [b1, b2],
      });
      expect(registry.count()).toBe(2);
      expect(registry.getBinding("a1")?.session_id).toBe("sess_01JR9ABC");
    });

    it("sets and retrieves a binding", () => {
      const registry = new InMemoryPrincipalSessionBindingRegistry();
      const binding = makeBinding();
      registry.setBinding(binding);
      expect(registry.getBinding("a2")).toEqual(binding);
    });

    it("overwrites an existing binding", () => {
      const registry = new InMemoryPrincipalSessionBindingRegistry();
      registry.setBinding(makeBinding({ session_id: "old_sess" }));
      registry.setBinding(makeBinding({ session_id: "new_sess" }));
      expect(registry.getBinding("a2")?.session_id).toBe("new_sess");
    });

    it("removes a binding", () => {
      const registry = new InMemoryPrincipalSessionBindingRegistry();
      registry.setBinding(makeBinding());
      expect(registry.removeBinding("a2")).toBe(true);
      expect(registry.getBinding("a2")).toBeUndefined();
    });

    it("returns false when removing nonexistent binding", () => {
      const registry = new InMemoryPrincipalSessionBindingRegistry();
      expect(registry.removeBinding("a99")).toBe(false);
    });

    it("lists all bindings", () => {
      const registry = new InMemoryPrincipalSessionBindingRegistry();
      registry.setBinding(makeBinding({ principal_id: "a1" }));
      registry.setBinding(makeBinding({ principal_id: "a2" }));
      const list = registry.listBindings();
      expect(list).toHaveLength(2);
      expect(list.map((b) => b.principal_id).sort()).toEqual(["a1", "a2"]);
    });

    it("resolves principal to session handle", () => {
      const registry = new InMemoryPrincipalSessionBindingRegistry();
      registry.setBinding(makeBinding({ session_id: "sess_X", session_title: "a2-title" }));
      const resolved = registry.resolve("a2");
      expect(resolved).toEqual({ session_id: "sess_X", session_title: "a2-title" });
    });

    it("returns undefined for unresolved principal", () => {
      const registry = new InMemoryPrincipalSessionBindingRegistry();
      expect(registry.resolve("a99")).toBeUndefined();
    });

    it("checks binding existence", () => {
      const registry = new InMemoryPrincipalSessionBindingRegistry();
      expect(registry.hasBinding("a2")).toBe(false);
      registry.setBinding(makeBinding());
      expect(registry.hasBinding("a2")).toBe(true);
    });
  });

  describe("JsonPrincipalSessionBindingRegistry", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "psb-test-"));
    });

    afterEach(async () => {
      // Best-effort cleanup
    });

    it("starts empty when file does not exist", async () => {
      const registry = new JsonPrincipalSessionBindingRegistry({ rootDir: tempDir });
      await registry.init();
      expect(registry.count()).toBe(0);
    });

    it("loads bindings from existing file", async () => {
      const snapshot = {
        bindings: [
          makeBinding({ principal_id: "a1", session_id: "sess_A" }),
          makeBinding({ principal_id: "a2", session_id: "sess_B" }),
        ],
        updated_at: "2026-04-24T12:00:00Z",
      };
      await writeFile(
        join(tempDir, "principal-session-bindings.json"),
        JSON.stringify(snapshot, null, 2),
        "utf8",
      );

      const registry = new JsonPrincipalSessionBindingRegistry({ rootDir: tempDir });
      await registry.init();
      expect(registry.count()).toBe(2);
      expect(registry.getBinding("a1")?.session_id).toBe("sess_A");
    });

    it("persists bindings after set", async () => {
      const registry = new JsonPrincipalSessionBindingRegistry({ rootDir: tempDir });
      await registry.init();
      registry.setBinding(makeBinding({ principal_id: "a3", session_id: "sess_C" }));
      await registry.flush();

      const raw = await readFile(join(tempDir, "principal-session-bindings.json"), "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.bindings).toHaveLength(1);
      expect(parsed.bindings[0].principal_id).toBe("a3");
      expect(parsed.bindings[0].session_id).toBe("sess_C");
    });

    it("persists removals", async () => {
      const registry = new JsonPrincipalSessionBindingRegistry({ rootDir: tempDir });
      await registry.init();
      registry.setBinding(makeBinding({ principal_id: "a1" }));
      registry.setBinding(makeBinding({ principal_id: "a2" }));
      await registry.flush();

      registry.removeBinding("a1");
      await registry.flush();

      const raw = await readFile(join(tempDir, "principal-session-bindings.json"), "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.bindings).toHaveLength(1);
      expect(parsed.bindings[0].principal_id).toBe("a2");
    });

    it("treats corrupt file as empty", async () => {
      await writeFile(
        join(tempDir, "principal-session-bindings.json"),
        "not json at all",
        "utf8",
      );

      const registry = new JsonPrincipalSessionBindingRegistry({ rootDir: tempDir });
      await registry.init();
      expect(registry.count()).toBe(0);
    });

    it("treats non-object JSON as empty", async () => {
      await writeFile(
        join(tempDir, "principal-session-bindings.json"),
        "[1, 2, 3]",
        "utf8",
      );

      const registry = new JsonPrincipalSessionBindingRegistry({ rootDir: tempDir });
      await registry.init();
      expect(registry.count()).toBe(0);
    });

    it("skips invalid bindings during load", async () => {
      const snapshot = {
        bindings: [
          makeBinding({ principal_id: "a1" }),
          { principal_id: "a2", session_id: 123, invalid: true }, // missing fields, wrong types
          makeBinding({ principal_id: "a3" }),
        ],
        updated_at: "2026-04-24T12:00:00Z",
      };
      await writeFile(
        join(tempDir, "principal-session-bindings.json"),
        JSON.stringify(snapshot, null, 2),
        "utf8",
      );

      const registry = new JsonPrincipalSessionBindingRegistry({ rootDir: tempDir });
      await registry.init();
      expect(registry.count()).toBe(2);
      expect(registry.getBinding("a1")).toBeDefined();
      expect(registry.getBinding("a2")).toBeUndefined();
      expect(registry.getBinding("a3")).toBeDefined();
    });

    it("uses custom filename when provided", async () => {
      const registry = new JsonPrincipalSessionBindingRegistry({
        rootDir: tempDir,
        filename: "custom-bindings.json",
      });
      expect(registry.getFilepath()).toBe(join(tempDir, "custom-bindings.json"));
    });

    it("handles missing bindings directory by creating it", async () => {
      const nestedDir = join(tempDir, "deep", "nested");
      const registry = new JsonPrincipalSessionBindingRegistry({ rootDir: nestedDir });
      await registry.init();
      registry.setBinding(makeBinding());
      await registry.flush();

      const raw = await readFile(
        join(nestedDir, "principal-session-bindings.json"),
        "utf8",
      );
      const parsed = JSON.parse(raw);
      expect(parsed.bindings).toHaveLength(1);
    });
  });
});
