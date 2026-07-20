import assert from "node:assert/strict";
import test from "node:test";

import {
  INTELLIGENCE_AUTHORITY_MATRIX,
  INTELLIGENCE_AUTHORITY_STATEMENT_SCHEMA,
  planIntelligenceAuthorityApplication,
  validateIntelligenceAuthorityAction,
  validateIntelligenceAuthorityStatement,
} from "../src/authority.js";
import type { IntelligenceAuthorityStatement } from "../src/authority.js";

const statement = (
  id: string,
  kind: IntelligenceAuthorityStatement["kind"],
  locus: IntelligenceAuthorityStatement["origin"]["locus"],
  effect: IntelligenceAuthorityStatement["effect"],
): IntelligenceAuthorityStatement => ({
  schema: INTELLIGENCE_AUTHORITY_STATEMENT_SCHEMA,
  id,
  kind,
  origin: {
    locus,
    site_id: locus === "principal" ? "site:user" : `site:${locus}`,
    ...(locus === "principal" ? { principal_id: "principal:andrey" } : {}),
    authority_ref: `authority:${id}`,
  },
  effect,
  revision: 1,
  issued_at: "2026-07-19T00:00:00Z",
  payload_ref: `payload:${id}`,
});

test("v1 authority matrix covers every distinct policy and assertion concept", () => {
  assert.deepEqual(Object.keys(INTELLIGENCE_AUTHORITY_MATRIX).sort(), [
    "declared-capability",
    "execution-feasibility",
    "observed-capability",
    "principal-consent",
    "principal-prohibition",
    "target-default",
    "target-governance-constraint",
    "user-preference",
  ]);
  assert.equal(INTELLIGENCE_AUTHORITY_MATRIX["principal-consent"].resolution_effect, "consent-gate");
  assert.equal(INTELLIGENCE_AUTHORITY_MATRIX["user-preference"].resolution_effect, "ranking");
  assert.equal(INTELLIGENCE_AUTHORITY_MATRIX["target-default"].composition, "fill-unset-only");
});

test("authorized statements form canonical constraint, consent, ranking, and fallback phases", () => {
  const statements = [
    statement("default", "target-default", "target-site", "fallback"),
    statement("preference", "user-preference", "user-site", "ranking"),
    statement("consent", "principal-consent", "principal", "consent-gate"),
    statement("feasibility", "execution-feasibility", "execution-site", "eligibility-constraint"),
    statement("governance", "target-governance-constraint", "target-site", "eligibility-constraint"),
  ];
  const plan = planIntelligenceAuthorityApplication(statements);
  assert.deepEqual(plan.diagnostics, []);
  assert.deepEqual(plan.constraints.map(({ id }) => id), ["feasibility", "governance"]);
  assert.deepEqual(plan.consent_gates.map(({ id }) => id), ["consent"]);
  assert.deepEqual(plan.ranking.map(({ id }) => id), ["preference"]);
  assert.deepEqual(plan.fallbacks.map(({ id }) => id), ["default"]);
});

test("user preference cannot masquerade as principal consent or target governance", () => {
  const overreach = statement(
    "overreach",
    "target-governance-constraint",
    "user-site",
    "eligibility-constraint",
  );
  assert.ok(validateIntelligenceAuthorityStatement(overreach).some(({ code }) => code === "origin-not-authorized"));

  const preference = statement("preference", "user-preference", "user-site", "ranking");
  const diagnostics = validateIntelligenceAuthorityAction({
    action: "materialize",
    actor_role: "receiving-site-admission",
    actor_site_id: "site:target",
    statement: preference,
    materialized_as: {
      kind: "principal-consent",
      effect: "consent-gate",
    },
  });
  assert.ok(diagnostics.some(({ code }) => code === "cross-locus-escalation"));
});

test("only the originating authority identity may supersede or revoke", () => {
  const consent = statement("consent", "principal-consent", "principal", "consent-gate");
  const diagnostics = validateIntelligenceAuthorityAction({
    action: "revoke",
    actor_role: "principal",
    actor_principal_id: "principal:someone-else",
    statement: consent,
  });
  assert.ok(diagnostics.some(({ code }) => code === "authority-identity-mismatch"));
});

test("every authority statement names its originating Site", () => {
  const consent = statement("consent", "principal-consent", "principal", "consent-gate");
  delete (consent.origin as { site_id?: string }).site_id;
  assert.ok(validateIntelligenceAuthorityStatement(consent).some(({ code }) => code === "invalid-authority-statement"));
});
