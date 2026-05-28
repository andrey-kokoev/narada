import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FileDirectiveStore,
  createDirectiveEmissionAuthorization,
  createDirective,
  createDirectiveTriageRecord,
  markDirectiveDeliveryLeased,
  recordDirectiveReceipt,
  renderDirectivePromptContext,
  validateDirectiveForAdmission,
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
    expect(directive.kind).toBe("instruction");
    expect(directive.directive_id).toMatch(/^dir_/);
    expect(renderDirectivePromptContext([{ ...directive, admission: { status: "admitted" } }])).toContain("Implement first-class directives.");
  });

  it("validates typed resident attention directives before admission", () => {
    const valid = createDirective({
      kind: "attention",
      created_at: "2026-05-28T00:00:00.000Z",
      source: { kind: "system", id: "sonar.system.directive_emitter" },
      authority: { locus: "sonar", basis: "task_admission_transition:task-123" },
      target: { kind: "role", id: "resident" },
      content: {
        kind: "work_ref",
        text: "Attend to admitted support work item.",
        refs: [{ kind: "work", id: "work-123", locus: "sonar" }],
      },
      ordering: { priority: 100, sequence: 0 },
    });

    expect(validateDirectiveForAdmission(valid, { authorityLocus: "sonar", residentRole: "resident" })).toMatchObject({
      valid: true,
      errors: [],
    });

    const invalid = createDirective({
      kind: "attention",
      created_at: "2026-05-28T00:00:00.000Z",
      source: { kind: "system", id: "sonar.system.directive_emitter" },
      authority: { locus: "other_site", basis: "task_admission_transition:task-123" },
      target: { kind: "role", id: "resident" },
      content: { kind: "plain_text", text: "Do something." },
    });

    const result = validateDirectiveForAdmission(invalid, { authorityLocus: "sonar", residentRole: "resident" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("authority_locus_mismatch:other_site");
    expect(result.errors).toContain("system_attention_directive_requires_task_or_work_ref");
  });

  it("keeps delivery lease, receipt, triage, and task completion as separate records", () => {
    const directive = createDirective({
      kind: "attention",
      created_at: "2026-05-28T00:00:00.000Z",
      source: { kind: "system", id: "sonar.system.directive_emitter" },
      authority: { locus: "sonar", basis: "task_admission_transition:task-123" },
      target: { kind: "agent", id: "sonar.resident" },
      content: {
        kind: "task_ref",
        text: "Triage admitted task 123.",
        refs: [{ kind: "task", id: "task-123", locus: "sonar" }],
      },
    });
    const leased = markDirectiveDeliveryLeased(directive, {
      lease_id: "lease-1",
      leased_until: "2026-05-28T00:05:00.000Z",
      transport: "agent-cli",
      carrier_session_id: "carrier-1",
    });
    expect(leased.admission.status).toBe("candidate");
    expect(leased.delivery?.status).toBe("leased");

    const { directive: received, receipt } = recordDirectiveReceipt(leased, {
      received_at: "2026-05-28T00:01:00.000Z",
      carrier_session_id: "carrier-1",
      agent_id: "sonar.resident",
      transport: "agent-cli",
    });
    expect(receipt.receipt_id).toMatch(/^dirrcpt_/);
    expect(received.delivery?.status).toBe("receipt_recorded");

    const triage = createDirectiveTriageRecord(received, {
      triaged_at: "2026-05-28T00:02:00.000Z",
      agent_id: "sonar.resident",
      status: "accepted",
      selected_work_ref: { kind: "task", id: "task-123", locus: "sonar" },
    });
    expect(triage.triage_id).toMatch(/^dirtriage_/);
    expect(triage.status).toBe("accepted");
  });

  it("creates operator-authorized system directive emission records", () => {
    const authorization = createDirectiveEmissionAuthorization({
      authorized_at: "2026-05-28T00:00:00.000Z",
      authorized_by: { kind: "operator", id: "operator.andrey" },
      authorized_emitter: { kind: "system", id: "narada-proper.system.directive_emitter" },
      authority: { locus: "narada_proper", basis: "interactive_operator_request" },
      directive_template: {
        target: { kind: "role", id: "architect" },
        content: { kind: "instruction", text: "Consume active directives at startup." },
        ordering: { priority: 100, sequence: 0 },
      },
      status: "authorized",
    });

    expect(authorization.schema).toBe("narada.directive-emission-authorization.v1");
    expect(authorization.authorization_id).toMatch(/^auth_/);
    expect(authorization.authorized_emitter.id).toBe("narada-proper.system.directive_emitter");
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
