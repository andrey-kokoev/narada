import assert from "node:assert/strict";
import test from "node:test";

import {
  INTELLIGENCE_SELECTION_AUTHORITY_SCHEMA,
  createIntelligenceSelectionAuthority,
} from "../src/selection-authority.js";

test("selection authority binds a Site catalog without selecting an offering", () => {
  const authority = createIntelligenceSelectionAuthority({
    siteId: "site:target",
    storeKind: "node:sqlite",
    catalogLocator: "D:/site/.ai/intelligence-registry.db",
  });

  assert.equal(authority.schema, INTELLIGENCE_SELECTION_AUTHORITY_SCHEMA);
  assert.equal(authority.launcher_selection, false);
  assert.deepEqual(authority.catalog, {
    store_kind: "node:sqlite",
    locator: "D:/site/.ai/intelligence-registry.db",
  });
  assert.deepEqual(authority.authoritative_inputs, [
    "invocation-intent",
    "catalog",
    "materialized-policy",
    "runtime-context",
  ]);
  assert.equal(Object.hasOwn(authority, "provider"), false);
  assert.equal(Object.hasOwn(authority, "model"), false);
});

test("selection authority refuses an empty catalog locator", () => {
  assert.throws(
    () => createIntelligenceSelectionAuthority({
      storeKind: "cloudflare:d1",
      catalogLocator: " ",
    }),
    /intelligence_catalog_locator_required/,
  );
});
