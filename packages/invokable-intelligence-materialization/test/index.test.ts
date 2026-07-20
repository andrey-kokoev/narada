import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  MATERIALIZATION_ADMISSION_SCHEMA,
  MATERIALIZATION_ENVELOPE_SCHEMA,
  MATERIALIZATION_REVOCATION_SCHEMA,
  materializationProjectionKey,
  requestScopedMaterializationBinding,
} from "@narada2/invokable-intelligence-contract";
import type {
  ContentDigest,
  MaterializationAdmission,
  MaterializationEnvelope,
  MaterializationRevocation,
  MaterializationStoreKind,
} from "@narada2/invokable-intelligence-contract";
import { createFakeD1 } from "@narada2/invokable-intelligence-registry";

import {
  D1MaterializationStore,
  SqliteMaterializationStore,
  verifyRequestScopedContext,
} from "../src/index.js";
import type { IntelligenceMaterializationStore } from "../src/index.js";

const contentDigest = (character: string): ContentDigest => `sha256:${character.repeat(64)}`;

function envelope(
  revision = 1,
  options: {
    id?: string;
    digest?: ContentDigest;
    supersedes?: string;
    store?: MaterializationStoreKind;
  } = {},
): MaterializationEnvelope {
  return {
    schema: MATERIALIZATION_ENVELOPE_SCHEMA,
    id: options.id ?? `materialization:user-preference:${revision}`,
    mode: "durable-projection",
    origin: { site_id: "site:user", locus: "user-site", authority_ref: "authority:user-preferences:r7" },
    destination: {
      site_id: "site:cloudflare",
      resolver: "cloudflare",
      store: options.store ?? "d1",
    },
    statement: {
      id: "preference:thinking",
      kind: "user-preference",
      effect: "ranking",
      source_revision: revision,
      payload_digest: options.digest ?? contentDigest(String(revision)),
      payload_ref: `content:preference:${revision}`,
    },
    allowed_scope: {
      purposes: ["operator-chat"],
      target_site_ids: ["site:narada"],
      principal_ids: ["principal:andrey"],
      topology_ids: ["topology:cloudflare-workers-ai"],
    },
    issued_at: "2026-07-19T00:00:00Z",
    expires_at: "2026-07-20T00:00:00Z",
    provenance_refs: ["evidence:user-preference:r7"],
    authorization_ref: "grant:materialize-user-preference:r7",
    ...(options.supersedes ? { supersedes: options.supersedes } : {}),
  };
}

function admission(value: MaterializationEnvelope, decision: MaterializationAdmission["decision"] = "admitted"): MaterializationAdmission {
  return {
    schema: MATERIALIZATION_ADMISSION_SCHEMA,
    id: `admission:${value.id}:${decision}`,
    envelope_id: value.id,
    destination_site_id: value.destination.site_id,
    decision,
    decided_at: "2026-07-19T00:00:01Z",
    decided_by: "site:cloudflare:admission",
    reason_codes: decision === "admitted" ? [] : ["destination-policy-refusal"],
    evidence_refs: ["evidence:destination-admission"],
    ...(decision === "admitted" ? { admitted_digest: value.statement.payload_digest } : {}),
  };
}

interface StoreHarness {
  name: string;
  storeKind: "sqlite" | "d1";
  open(): Promise<{ store: IntelligenceMaterializationStore; dispose(): Promise<void> }>;
}

const harnesses: StoreHarness[] = [
  {
    name: "node:sqlite",
    storeKind: "sqlite",
    async open() {
      const store = await SqliteMaterializationStore.open(":memory:");
      return { store, dispose: () => store.close() };
    },
  },
  {
    name: "cloudflare-d1 (fake binding)",
    storeKind: "d1",
    async open() {
      const binding = createFakeD1(":memory:");
      const store = await D1MaterializationStore.open(binding);
      return { store, async dispose() { await store.close(); binding.close(); } };
    },
  },
];

async function exerciseStore(harness: StoreHarness) {
  const { store, dispose } = await harness.open();
  try {
    const makeEnvelope = (
      revision = 1,
      options: Parameters<typeof envelope>[1] = {},
    ) => envelope(revision, { ...options, store: harness.storeKind });
    assert.equal(await store.migrate(), 1);
    const first = makeEnvelope();
    const firstAdmission = admission(first);
    const applied = await store.apply(first, firstAdmission);
    assert.equal(applied.status, "applied");
    assert.equal(applied.projection?.envelope.origin.authority_ref, "authority:user-preferences:r7");

    const replay = await store.apply(first, firstAdmission);
    assert.equal(replay.status, "idempotent");
    assert.equal(replay.audit_event_ref, applied.audit_event_ref);
    assert.equal((await store.listAudit()).length, 1, "idempotent replay must not duplicate transition audit");

    const conflict = makeEnvelope(1, { id: "materialization:user-preference:conflict", digest: contentDigest("f") });
    const conflictResult = await store.apply(conflict, admission(conflict));
    assert.equal(conflictResult.status, "rejected");
    assert.ok(conflictResult.diagnostics.some(({ code }) => code === "projection-conflict"));

    const second = makeEnvelope(2, { supersedes: first.id });
    const refreshed = await store.apply(second, admission(second));
    assert.equal(refreshed.status, "applied");
    assert.equal(refreshed.operation, "refresh");
    assert.equal(refreshed.projection?.envelope.statement.source_revision, 2);

    const stale = makeEnvelope(1, { id: "materialization:user-preference:stale", supersedes: second.id });
    const staleResult = await store.apply(stale, admission(stale));
    assert.equal(staleResult.status, "rejected");
    assert.ok(staleResult.diagnostics.some(({ code }) => code === "stale-projection"));

    const unauthorized = makeEnvelope(3, { id: "materialization:user-preference:unauthorized", supersedes: second.id });
    unauthorized.origin.locus = "target-site";
    const unauthorizedResult = await store.apply(unauthorized, admission(unauthorized));
    assert.equal(unauthorizedResult.status, "rejected");
    assert.ok(unauthorizedResult.diagnostics.some(({ code }) => code === "unauthorized-origin"));

    const rejectedAdmission = makeEnvelope(3, { id: "materialization:user-preference:destination-refused", supersedes: second.id });
    assert.equal((await store.apply(rejectedAdmission, admission(rejectedAdmission, "rejected"))).operation, "reject");

    const activeInputs = await store.acquire({
      destination_site_id: "site:cloudflare",
      resolver: "cloudflare",
      target_site_id: "site:narada",
      purpose: "operator-chat",
      principal_id: "principal:andrey",
      topology_id: "topology:cloudflare-workers-ai",
      now: "2026-07-19T12:00:00Z",
    });
    assert.deepEqual(activeInputs.acquisition_refs, [`admission:${second.id}:admitted`]);

    const ineligibleInputs = await store.acquire({
      destination_site_id: "site:cloudflare",
      resolver: "cloudflare",
      target_site_id: "site:other",
      purpose: "operator-chat",
      principal_id: "principal:andrey",
      topology_id: "topology:cloudflare-workers-ai",
      now: "2026-07-21T00:00:00Z",
    });
    assert.equal(ineligibleInputs.admitted.length, 0);
    const ineligibleCodes = new Set(ineligibleInputs.excluded.flatMap(({ diagnostics }) => diagnostics.map(({ code }) => code)));
    assert.ok(ineligibleCodes.has("expired-projection"));
    assert.ok(ineligibleCodes.has("scope-mismatch"));

    const revocation: MaterializationRevocation = {
      schema: MATERIALIZATION_REVOCATION_SCHEMA,
      id: "revocation:user-preference:2",
      envelope_id: second.id,
      statement_id: second.statement.id,
      source_revision: second.statement.source_revision,
      origin: second.origin,
      revoked_at: "2026-07-19T13:00:00Z",
      reason_code: "origin-revoked",
      evidence_ref: "evidence:origin-revocation",
    };
    assert.equal((await store.revoke(revocation)).status, "applied");
    assert.equal((await store.revoke(revocation)).status, "idempotent");
    const afterRevoke = await store.acquire({
      destination_site_id: "site:cloudflare",
      resolver: "cloudflare",
      target_site_id: "site:narada",
      purpose: "operator-chat",
      principal_id: "principal:andrey",
      topology_id: "topology:cloudflare-workers-ai",
      now: "2026-07-19T14:00:00Z",
    });
    assert.equal(afterRevoke.admitted.length, 0);
    assert.ok(afterRevoke.excluded.some(({ diagnostics }) => diagnostics.some(({ code }) => code === "revoked-projection")));

    const audit = await store.listAudit({ projectionKey: materializationProjectionKey(first) });
    assert.ok(audit.some(({ operation, outcome, replaced_envelope_id }) => operation === "refresh" && outcome === "applied" && replaced_envelope_id === first.id));
    assert.ok(audit.some(({ operation, outcome }) => operation === "revoke" && outcome === "applied"));
    assert.ok(audit.filter(({ outcome }) => outcome === "rejected").length >= 3);
    for (const event of audit) {
      assert.equal(event.origin.authority_ref, "authority:user-preferences:r7");
      assert.ok(event.statement.source_revision >= 1);
      assert.equal(event.destination.site_id, "site:cloudflare");
      assert.ok(event.evidence_refs.length > 0);
    }
    return { projections: await store.listProjections(), audit };
  } finally {
    await dispose();
  }
}

for (const harness of harnesses) {
  test(`materialization conformance [${harness.name}]`, async () => {
    await exerciseStore(harness);
  });
}

test("SQLite and D1 produce identical projection and audit semantics", async () => {
  const sqlite = await exerciseStore(harnesses[0]);
  const d1 = await exerciseStore(harnesses[1]);
  const semanticView = (value: typeof sqlite) => ({
    projections: value.projections.map(({ projection_key, status, envelope: valueEnvelope }) => ({
      projection_key,
      status,
      revision: valueEnvelope.statement.source_revision,
      digest: valueEnvelope.statement.payload_digest,
    })),
    audit: value.audit.map(({ id, destination, ...event }) => ({
      ...event,
      id: id.replace(/:(?:materialize|refresh|revoke|reject):/, ":transition:"),
      destination: { ...destination, store: "durable-store" },
    })),
  });
  assert.deepEqual(semanticView(sqlite), semanticView(d1));
});

test("durable adapters reject request-scoped and wrong-store persistence", async () => {
  for (const harness of harnesses) {
    const { store, dispose } = await harness.open();
    try {
      const wrongStore = harness.storeKind === "sqlite" ? "d1" : "sqlite";
      const wrong = envelope(1, { id: `materialization:wrong-store:${harness.name}`, store: wrongStore });
      const rejected = await store.apply(wrong, admission(wrong));
      assert.equal(rejected.status, "rejected");
      assert.equal(rejected.operation, "reject");
      assert.ok(rejected.diagnostics.some(({ code }) => code === "destination-mismatch"));
      assert.ok((await store.listAudit()).some(({ id }) => id === rejected.audit_event_ref));

      const scoped = envelope(1, { id: `materialization:request-context:${harness.name}`, store: "request-context" });
      scoped.mode = "request-scoped-context";
      scoped.request_context = {
        request_id: "request:adapter-boundary",
        nonce: "nonce:adapter-boundary",
        signature: {
          algorithm: "ed25519",
          key_id: "key:user:r7",
          signed_digest: contentDigest("0"),
          value: "signature:fixture",
        },
      };
      assert.equal((await store.apply(scoped, admission(scoped))).status, "rejected");
    } finally {
      await dispose();
    }
  }
});

function digestBinding(value: MaterializationEnvelope): ContentDigest {
  return `sha256:${createHash("sha256").update(JSON.stringify(requestScopedMaterializationBinding(value))).digest("hex")}`;
}

test("runtime-neutral verifier cryptographically binds request, destination, digest, validity, and key", async () => {
  const input: MaterializationEnvelope = {
    ...envelope(),
    id: "materialization:request:one",
    mode: "request-scoped-context",
    destination: { site_id: "site:cloudflare", resolver: "cloudflare", store: "request-context" },
    request_context: {
      request_id: "request:one",
      nonce: "nonce:one",
      signature: { algorithm: "ed25519", key_id: "key:user:r7", signed_digest: contentDigest("0"), value: "signature:valid" },
    },
  };
  input.request_context!.signature.signed_digest = digestBinding(input);
  const verifier = {
    async digest(binding: NonNullable<ReturnType<typeof requestScopedMaterializationBinding>>) {
      return `sha256:${createHash("sha256").update(JSON.stringify(binding)).digest("hex")}` as ContentDigest;
    },
    async verify({ key_id, value }: { key_id: string; value: string }) { return key_id === "key:user:r7" && value === "signature:valid"; },
  };
  const context = { request_id: "request:one", destination_site_id: "site:cloudflare", now: "2026-07-19T12:00:00Z" };
  assert.deepEqual(await verifyRequestScopedContext(input, context, verifier), []);

  for (const mutate of [
    (copy: MaterializationEnvelope) => { copy.request_context!.request_id = "request:two"; },
    (copy: MaterializationEnvelope) => { copy.destination.site_id = "site:other"; },
    (copy: MaterializationEnvelope) => { copy.statement.payload_digest = contentDigest("9"); },
    (copy: MaterializationEnvelope) => { copy.expires_at = "2026-07-21T00:00:00Z"; },
    (copy: MaterializationEnvelope) => { copy.request_context!.signature.key_id = "key:other"; },
  ]) {
    const copy = structuredClone(input);
    mutate(copy);
    const mutatedContext = {
      request_id: copy.request_context!.request_id,
      destination_site_id: copy.destination.site_id,
      now: "2026-07-19T12:00:00Z",
    };
    assert.ok((await verifyRequestScopedContext(copy, mutatedContext, verifier)).some(({ code }) => code === "signature-invalid"));
  }
});
