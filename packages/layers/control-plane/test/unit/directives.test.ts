import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FileDirectiveStore,
  createDirective,
  renderDirectivePromptContext,
} from "../../src/index.js";

describe("first-class directives", () => {
  it("creates stable directive objects and renders admitted directives as prompt context", () => {
    const directive = createDirective({
      created_at: "2026-05-27T00:00:00.000Z",
      source: { kind: "operator", id: "operator:andrey" },
      authority: { locus: "operator", basis: "manual_directive" },
      target: { kind: "agent", id: "narada.architect" },
      content: { kind: "instruction", text: "Implement first-class directives." },
      ordering: { priority: 10, sequence: 2 },
    });

    expect(directive.schema).toBe("narada.directive.v1");
    expect(directive.directive_id).toMatch(/^dir_/);
    expect(renderDirectivePromptContext([{ ...directive, admission: { status: "admitted" } }])).toContain("Implement first-class directives.");
  });

  it("persists directives and durable admission events in a site-local store", () => {
    mkdirSync(resolve(".ai", "tmp"), { recursive: true });
    const siteRoot = mkdtempSync(resolve(".ai", "tmp", "narada-directives-"));
    try {
      const store = new FileDirectiveStore(siteRoot);
      const admitted = store.createAndAdmit({
        created_at: "2026-05-27T00:00:00.000Z",
        source: { kind: "operator", id: "operator:andrey" },
        authority: { locus: "operator", basis: "manual_directive" },
        target: { kind: "agent", id: "narada.architect" },
        content: { kind: "instruction", text: "Use directives, not ad hoc prompts." },
        ordering: { priority: 5, sequence: 1 },
      }, "operator:andrey");

      expect(admitted.admission.status).toBe("admitted");
      expect(store.active({ kind: "agent", id: "narada.architect" })).toHaveLength(1);
      expect(store.renderPromptContext({ kind: "agent", id: "narada.architect" })).toContain("Use directives");
      expect(readFileSync(store.paths.eventLogPath, "utf8")).toContain("directive.admitted");
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });
});
