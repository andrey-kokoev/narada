import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_CATALOG_RECORD_SCHEMA,
  validateCanonicalCatalogRecord,
} from "../src/catalog.js";
import { canonicalSha256, sha256 } from "../src/canonical.js";
import type { CanonicalCatalogRecord } from "../src/catalog.js";

const record: CanonicalCatalogRecord = {
  schema: CANONICAL_CATALOG_RECORD_SCHEMA,
  id: "catalog-record:resource:model-kimi:r1",
  record_kind: "resource",
  record_id: "model:kimi-k3",
  revision: 1,
  source: {
    schema: "narada.carrier.provider_registry.v1",
    reference: "provider-registry.json",
    revision: "sha256:source",
    digest: canonicalSha256({
      schema: "narada.invokable-intelligence.model.v1",
      id: "model:kimi-k3",
      provider: { kind: "model-provider", id: "model-provider:kimi" },
    }),
  },
  authority: {
    kind: "catalog-definition",
    locus: "target-site",
    site_id: "site:target",
    authority_ref: "provider-registry.json",
  },
  validation: {
    status: "accepted",
    validator: "migration-v2",
    validated_at: "2026-07-19T00:00:00Z",
    evidence: [{ kind: "document", ref: "provider-registry.json" }],
  },
  document: {
    schema: "narada.invokable-intelligence.model.v1",
    id: "model:kimi-k3",
    provider: { kind: "model-provider", id: "model-provider:kimi" },
  },
};

test("canonical catalog records require source, authority, revision, and validation evidence", () => {
  assert.deepEqual(validateCanonicalCatalogRecord(record), []);
  const missingEvidence = { ...record, validation: { ...record.validation, evidence: [] } };
  assert.ok(validateCanonicalCatalogRecord(missingEvidence).some(({ code }) => code === "missing-catalog-validation"));
});

test("catalog source digests bind the canonical document", () => {
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const tampered = {
    ...record,
    document: { ...record.document, id: "model:kimi-k3-tampered" },
    record_id: "model:kimi-k3-tampered",
  } as CanonicalCatalogRecord;
  assert.ok(validateCanonicalCatalogRecord(tampered).some(({ code }) => code === "catalog-record-digest-mismatch"));
});

test("catalog envelope identity and kind cannot diverge from its document", () => {
  assert.ok(validateCanonicalCatalogRecord({ ...record, record_id: "model:other" }).some(({ code }) => code === "catalog-record-id-mismatch"));
  assert.ok(validateCanonicalCatalogRecord({ ...record, record_kind: "policy" }).some(({ code }) => code === "catalog-record-kind-mismatch"));
});

test("authority statements cannot be relabeled as destination-local by their catalog envelope", () => {
  const document = {
    schema: "narada.invokable-intelligence.authority-statement.v1" as const,
    id: "authority-statement:foreign-preference",
    kind: "user-preference" as const,
    origin: {
      locus: "user-site" as const,
      site_id: "site:foreign",
      authority_ref: "authority:site:foreign",
    },
    effect: "ranking" as const,
    revision: 1,
    issued_at: "2026-07-19T00:00:00Z",
    payload_ref: "policy:foreign-preference",
  };
  const authorityRecord: CanonicalCatalogRecord = {
    ...record,
    id: "catalog-record:authority-statement:foreign-preference:r1",
    record_kind: "authority-statement",
    record_id: document.id,
    source: { ...record.source, digest: canonicalSha256(document) },
    authority: {
      kind: document.kind,
      locus: document.origin.locus,
      site_id: document.origin.site_id,
      authority_ref: document.origin.authority_ref,
    },
    document,
  };

  assert.deepEqual(validateCanonicalCatalogRecord(authorityRecord), []);
  const relabeled = {
    ...authorityRecord,
    authority: { ...authorityRecord.authority, site_id: "site:target" },
  };
  assert.ok(validateCanonicalCatalogRecord(relabeled).some(({ code }) => code === "catalog-record-authority-mismatch"));
});
