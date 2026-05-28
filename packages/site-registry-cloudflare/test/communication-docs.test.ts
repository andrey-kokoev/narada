import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

async function readRepoFile(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

async function readJsonFixture(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readRepoFile(path)) as Record<string, unknown>;
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function collectKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectKeys(item, `${prefix}[${index}]`));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...collectKeys(child, path)];
  });
}

function validateOperatorSiteCommunicationRelationFixture(fixture: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const authorityLimits = fixture.authority_limits;
  const authorityClaims = fixture.authority_claims;
  const receiptPolicy = fixture.receipt_policy as Record<string, unknown> | undefined;
  const projectionPolicy = fixture.projection_policy as Record<string, unknown> | undefined;
  const capabilityPosture = fixture.capability_posture as Record<string, unknown> | undefined;

  if (fixture.schema !== "narada.operator_site_communication_relation.v0") errors.push("relation_schema_invalid");
  for (const field of ["relation_id", "operator_principal_ref", "operator_surface_ref", "site_ref", "inbound_edge_ref", "outbound_edge_ref", "allowed_message_kinds", "lifecycle_state"]) {
    if (fixture[field] === undefined) errors.push(`relation_${field}_missing`);
  }

  if (!hasStringArray(authorityLimits) || authorityLimits.length === 0) {
    errors.push("relation_authority_limits_required");
  } else {
    for (const requiredLimit of [
      "relation_cannot_admit_local_inbox",
      "relation_cannot_create_or_close_tasks",
      "relation_cannot_grant_capability_or_possess_credentials",
      "relation_cannot_execute_transport_or_effects",
    ]) {
      if (!authorityLimits.includes(requiredLimit)) errors.push(`relation_missing_limit:${requiredLimit}`);
    }
  }

  if (hasStringArray(authorityClaims)) {
    for (const forbidden of ["task_lifecycle_mutation", "local_inbox_admission", "operator_approval", "effect_execution"]) {
      if (authorityClaims.includes(forbidden)) errors.push(`relation_forbidden_authority_claim:${forbidden}`);
    }
  }

  if (receiptPolicy?.remote_preservation_is_local_admission === true) {
    errors.push("relation_remote_preservation_claims_local_admission");
  }
  if (receiptPolicy?.operator_acknowledgement_is_approval === true) {
    errors.push("relation_operator_acknowledgement_claims_approval");
  }
  if (projectionPolicy?.relation_is_projection_only === true) {
    errors.push("relation_cannot_be_projection_only");
  }
  if (capabilityPosture?.credential_values_included === true) {
    errors.push("relation_credential_values_included");
  }
  for (const key of collectKeys(fixture)) {
    if (/(^|\.)raw_(token|secret|credential|private_key)$/.test(key)) {
      errors.push(`relation_raw_secret_field:${key}`);
    }
  }

  return errors;
}

describe("Site communication operator docs", () => {
  it("preserves delivery/admission, no-authority, no-secret, and residual posture", async () => {
    const readme = await readRepoFile("packages/site-registry-cloudflare/README.md");
    const contract = await readRepoFile("docs/product/site-communication-surface.v0.md");
    const combined = `${readme}\n${contract}`;

    expect(readme).toContain("Operator Communication Posture");
    expect(combined).toContain("delivery receipt");
    expect(combined).toContain("admission receipt");
    expect(combined).toContain("does not directly mutate the target Site");
    expect(combined).toContain("Raw bearer tokens");
    expect(combined).toContain("Site-scope projected chat");
    expect(combined).toContain("not registry-wide chat");
    expect(combined).toContain("/api/site-communications/send");
    expect(combined).toContain("Delegated-send");
    expect(combined).not.toContain("chat executes tasks");
    expect(combined).not.toContain("stores bearer tokens");
  });

  it("validates Operator Site Communication Relation fixtures against authority-collapse boundaries", async () => {
    const validRelation = await readJsonFixture("docs/product/fixtures/operator-site-communication-relation/relation.valid.json");
    const validProjection = await readJsonFixture("docs/product/fixtures/operator-site-communication-relation/projection-ui.valid.json");
    const invalidTask = await readJsonFixture("docs/product/fixtures/operator-site-communication-relation/invalid-direct-task-mutation.json");
    const invalidInbox = await readJsonFixture("docs/product/fixtures/operator-site-communication-relation/invalid-direct-inbox-admission.json");
    const invalidSecret = await readJsonFixture("docs/product/fixtures/operator-site-communication-relation/invalid-raw-secret-field.json");

    expect(validateOperatorSiteCommunicationRelationFixture(validRelation)).toEqual([]);
    expect(validProjection.projection_only).toBe(true);
    expect(validProjection).toMatchObject({
      schema: "narada.operator_site_communication_relation.ui_projection.v0",
      relation_id: validRelation.relation_id,
    });
    expect(JSON.stringify(validProjection)).toContain("control_does_not_admit_local_inbox");
    expect(JSON.stringify(validProjection)).toContain("receipt_badge_does_not_record_operator_approval");

    expect(validateOperatorSiteCommunicationRelationFixture(invalidTask)).toEqual(expect.arrayContaining([
      "relation_forbidden_authority_claim:task_lifecycle_mutation",
      "relation_missing_limit:relation_cannot_create_or_close_tasks",
    ]));
    expect(validateOperatorSiteCommunicationRelationFixture(invalidInbox)).toEqual(expect.arrayContaining([
      "relation_forbidden_authority_claim:local_inbox_admission",
      "relation_remote_preservation_claims_local_admission",
      "relation_missing_limit:relation_cannot_admit_local_inbox",
    ]));
    expect(validateOperatorSiteCommunicationRelationFixture(invalidSecret)).toEqual(expect.arrayContaining([
      "relation_credential_values_included",
      "relation_raw_secret_field:capability_posture.submit_message.raw_token",
    ]));
  });
});
