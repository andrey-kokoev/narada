import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  MATERIALIZATION_ADMISSION_SCHEMA,
  MATERIALIZATION_ENVELOPE_SCHEMA,
  MATERIALIZATION_PROJECTION_DDL,
  MATERIALIZATION_REVOCATION_SCHEMA,
  acquireResolverMaterializedInputs,
  applyMaterializedProjection,
  revokeMaterializedProjection,
  requestScopedMaterializationBinding,
  validateMaterializationAdmission,
  validateMaterializationEnvelope,
  verifyRequestScopedMaterialization,
} from "../src/materialization.js";
import type { MaterializationAdmission, MaterializationEnvelope, MaterializationRevocation } from "../src/materialization.js";

const digest = (character = "a") => `sha256:${character.repeat(64)}`;
const bindingDigest = (value: MaterializationEnvelope) => `sha256:${createHash("sha256").update(JSON.stringify(requestScopedMaterializationBinding(value))).digest("hex")}` as const;
const envelope = (revision = 1): MaterializationEnvelope => ({
  schema: MATERIALIZATION_ENVELOPE_SCHEMA,
  id: `materialization:user-preference:${revision}`,
  mode: "durable-projection",
  origin: { site_id: "site:user", locus: "user-site", authority_ref: "authority:user-site" },
  destination: { site_id: "site:cloudflare", resolver: "cloudflare", store: "d1" },
  statement: { id: "preference:thinking", kind: "user-preference", effect: "ranking", source_revision: revision, payload_digest: digest(String(revision)), payload_ref: `content:preference:${revision}` },
  allowed_scope: { purposes: ["operator-chat"], target_site_ids: ["site:narada"], principal_ids: ["principal:andrey"], topology_ids: ["topology:cloudflare-workers-ai"] },
  issued_at: "2026-07-19T00:00:00Z",
  expires_at: "2026-07-20T00:00:00Z",
  provenance_refs: ["evidence:user-preference"],
  authorization_ref: "grant:materialize-user-preference",
  ...(revision > 1 ? { supersedes: `materialization:user-preference:${revision - 1}` } : {}),
});
const admission = (value: MaterializationEnvelope): MaterializationAdmission => ({
  schema: MATERIALIZATION_ADMISSION_SCHEMA,
  id: `admission:${value.id}`,
  envelope_id: value.id,
  destination_site_id: value.destination.site_id,
  decision: "admitted",
  decided_at: "2026-07-19T00:00:01Z",
  decided_by: "site:cloudflare:admission",
  reason_codes: [],
  evidence_refs: ["evidence:destination-admission"],
  admitted_digest: value.statement.payload_digest,
});

test("Cloudflare D1 projection preserves origin authority, revision, scope, and destination admission", () => {
  const input = envelope();
  const result = applyMaterializedProjection(undefined, input, admission(input));
  assert.equal(result.status, "materialized");
  assert.equal(result.projection?.envelope.origin.site_id, "site:user");
  assert.equal(result.projection?.envelope.destination.store, "d1");
  assert.equal(result.projection?.admission.admitted_digest, input.statement.payload_digest);
  assert.ok(MATERIALIZATION_PROJECTION_DDL.every((ddl) => !ddl.toLowerCase().includes("secret_value")));
});

test("materialize is idempotent and refresh requires a newer explicitly superseding origin revision", () => {
  const first = envelope();
  const current = applyMaterializedProjection(undefined, first, admission(first)).projection!;
  assert.equal(applyMaterializedProjection(current, first, admission(first)).status, "idempotent");
  const second = envelope(2);
  const refreshed = applyMaterializedProjection(current, second, admission(second));
  assert.equal(refreshed.status, "refreshed");
  assert.equal(refreshed.replaced_projection?.status, "superseded");
  const conflict = { ...envelope(2), id: "materialization:conflict", statement: { ...envelope(2).statement, payload_digest: digest("f") } };
  assert.equal(applyMaterializedProjection(refreshed.projection, conflict, admission(conflict)).status, "rejected");
});

test("unauthorized origins and effect escalation are rejected", () => {
  const invalidOrigin = envelope();
  invalidOrigin.origin.locus = "target-site";
  assert.ok(validateMaterializationEnvelope(invalidOrigin).some(({ code }) => code === "unauthorized-origin"));
  const escalated = envelope();
  escalated.statement.effect = "eligibility-constraint";
  assert.ok(validateMaterializationEnvelope(escalated).some(({ code }) => code === "effect-mismatch"));

  const unknown = envelope();
  unknown.statement.kind = "future-statement-kind" as MaterializationEnvelope["statement"]["kind"];
  assert.doesNotThrow(() => validateMaterializationEnvelope(unknown));
  assert.ok(validateMaterializationEnvelope(unknown).some(({ code }) => code === "invalid-envelope"));
});

test("admission and revocation evidence is structurally and temporally validated", () => {
  const input = envelope();
  const invalidAdmission = admission(input);
  invalidAdmission.id = "";
  invalidAdmission.decided_at = "2026-07-21T00:00:00Z";
  invalidAdmission.evidence_refs = [];
  assert.ok(validateMaterializationAdmission(input, invalidAdmission).some(({ code }) => code === "invalid-admission"));

  const current = applyMaterializedProjection(undefined, input, admission(input)).projection!;
  const invalidRevocation: MaterializationRevocation = {
    schema: MATERIALIZATION_REVOCATION_SCHEMA,
    id: "",
    envelope_id: input.id,
    statement_id: input.statement.id,
    source_revision: input.statement.source_revision,
    origin: input.origin,
    revoked_at: "not-an-instant",
    reason_code: "",
    evidence_ref: "",
  };
  assert.equal(revokeMaterializedProjection(current, invalidRevocation).status, "rejected");
});

test("resolver acquisition revalidates stored origin authority", () => {
  const input = envelope();
  const tampered = applyMaterializedProjection(undefined, input, admission(input)).projection!;
  tampered.envelope.origin.locus = "target-site";
  const acquired = acquireResolverMaterializedInputs([tampered], {
    destination_site_id: "site:cloudflare",
    resolver: "cloudflare",
    target_site_id: "site:narada",
    purpose: "operator-chat",
    principal_id: "principal:andrey",
    topology_id: "topology:cloudflare-workers-ai",
    now: "2026-07-19T12:00:00Z",
  });
  assert.equal(acquired.admitted.length, 0);
  assert.ok(acquired.excluded[0]?.diagnostics.some(({ code }) => code === "unauthorized-origin"));
});

test("revoked, expired, and wrong-scope projections are excluded with structured reasons", () => {
  const input = envelope();
  const current = applyMaterializedProjection(undefined, input, admission(input)).projection!;
  const revocation: MaterializationRevocation = {
    schema: MATERIALIZATION_REVOCATION_SCHEMA,
    id: "revocation:one",
    envelope_id: input.id,
    statement_id: input.statement.id,
    source_revision: input.statement.source_revision,
    origin: input.origin,
    revoked_at: "2026-07-19T01:00:00Z",
    reason_code: "operator-revoked",
    evidence_ref: "evidence:revoke",
  };
  const revoked = revokeMaterializedProjection(current, revocation).projection!;
  const acquired = acquireResolverMaterializedInputs([revoked, current], {
    destination_site_id: "site:cloudflare",
    resolver: "cloudflare",
    target_site_id: "site:other",
    purpose: "operator-chat",
    principal_id: "principal:andrey",
    topology_id: "topology:cloudflare-workers-ai",
    now: "2026-07-21T00:00:00Z",
  });
  assert.equal(acquired.admitted.length, 0);
  const codes = new Set(acquired.excluded.flatMap(({ diagnostics }) => diagnostics.map(({ code }) => code)));
  assert.ok(codes.has("revoked-projection"));
  assert.ok(codes.has("expired-projection"));
  assert.ok(codes.has("scope-mismatch"));
});

test("request-scoped context is request/destination/digest bound and signature verified", () => {
  const input: MaterializationEnvelope = {
    ...envelope(),
    id: "materialization:request-scoped",
    mode: "request-scoped-context",
    destination: { site_id: "site:cloudflare", resolver: "cloudflare", store: "request-context" },
    request_context: {
      request_id: "request:one",
      nonce: "nonce:one",
      signature: { algorithm: "ed25519", key_id: "key:user", signed_digest: digest("1"), value: "signature" },
    },
  };
  input.request_context!.signature.signed_digest = bindingDigest(input);
  assert.deepEqual(verifyRequestScopedMaterialization(input, {
    request_id: "request:one",
    destination_site_id: "site:cloudflare",
    now: "2026-07-19T12:00:00Z",
    compute_binding_digest: () => bindingDigest(input),
    verify_signature: ({ value }) => value === "signature",
  }), []);
  assert.ok(verifyRequestScopedMaterialization(input, {
    request_id: "request:other",
    destination_site_id: "site:cloudflare",
    now: "2026-07-19T12:00:00Z",
    compute_binding_digest: () => bindingDigest(input),
    verify_signature: () => true,
  }).some(({ code }) => code === "signature-invalid"));

  const replay = structuredClone(input);
  replay.request_context!.request_id = "request:other";
  assert.ok(verifyRequestScopedMaterialization(replay, {
    request_id: "request:other",
    destination_site_id: "site:cloudflare",
    now: "2026-07-19T12:00:00Z",
    compute_binding_digest: () => bindingDigest(replay),
    verify_signature: () => true,
  }).some(({ code }) => code === "signature-invalid"), "changing a signed request binding must invalidate the original digest");
});
