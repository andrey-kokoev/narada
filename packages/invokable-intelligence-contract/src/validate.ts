/**
 * Validators for the invokable-intelligence contract. Every check returns
 * structured errors; nothing throws on malformed input. Bundle validation
 * adds cross-reference integrity: every ref must resolve inside the bundle.
 */

import type { CapabilityAssertion, EvidenceRef, Provenance } from "./assertions.js";
import { CAPABILITY_ASSERTION_SCHEMA } from "./assertions.js";
import { isResourceKind, parseResourceId } from "./ids.js";
import type { ResourceId, ResourceKind, ResourceRef } from "./ids.js";
import {
  INVOCATION_INTENT_SCHEMA,
  INVOCATION_PLAN_SCHEMA,
  INVOCATION_REFUSAL_SCHEMA,
} from "./invocation.js";
import { POLICY_KIND_RULES, POLICY_SCHEMA } from "./policies.js";
import type { PolicyDocument, PolicyRule } from "./policies.js";
import {
  ADAPTER_SCHEMA,
  CREDENTIAL_LOCATOR_SCHEMA,
  EXECUTION_LOCUS_SCHEMA,
  INFERENCE_ENDPOINT_SCHEMA,
  MODEL_SCHEMA,
  MODEL_OFFERING_SCHEMA,
  RESOURCE_SCHEMAS,
  SCHEMA_ID_KIND,
} from "./resources.js";
import type { Resource, ResourceSchema } from "./resources.js";
import { validatePlanDecisionSnapshot } from "./temporal.js";
import type { PlanDecisionSnapshot } from "./temporal.js";

export interface ContractError {
  code: string;
  path: string;
  message: string;
}

function err(errors: ContractError[], path: string, code: string, message: string): void {
  errors.push({ code, path, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function checkRef(
  value: unknown,
  path: string,
  expectedKind: ResourceKind | null,
  errors: ContractError[],
): void {
  if (!isPlainObject(value)) {
    err(errors, path, "malformed-reference", "reference must be an object { kind, id }");
    return;
  }
  const kind = value.kind;
  const id = value.id;
  if (!isResourceKind(kind)) {
    err(errors, `${path}.kind`, "malformed-reference", `unknown resource kind: ${String(kind)}`);
    return;
  }
  const parsed = parseResourceId(id);
  if (!parsed) {
    err(errors, `${path}.id`, "malformed-reference", `unparseable resource id: ${String(id)}`);
    return;
  }
  if (parsed.kind !== kind) {
    err(errors, path, "malformed-reference", `kind field '${kind}' disagrees with id prefix '${parsed.kind}'`);
    return;
  }
  if (expectedKind !== null && kind !== expectedKind) {
    err(errors, path, "wrong-reference-kind", `expected a '${expectedKind}' reference, got '${kind}'`);
  }
}

function checkCapabilityKey(value: unknown, path: string, errors: ContractError[]): void {
  if (!isPlainObject(value) || !isNonEmptyString(value.family) || !isNonEmptyString(value.name)) {
    err(errors, path, "invalid-capability", "capability must be { family, name } with non-empty strings");
  }
}

function checkEvidenceRefs(value: unknown, path: string, errors: ContractError[]): void {
  if (!Array.isArray(value)) {
    err(errors, path, "invalid-evidence", "evidence must be an array");
    return;
  }
  const kinds = new Set(["artifact", "run", "document", "test", "site-configuration"]);
  value.forEach((entry, i) => {
    if (!isPlainObject(entry) || !kinds.has(String(entry.kind)) || !isNonEmptyString(entry.ref)) {
      err(errors, `${path}[${i}]`, "invalid-evidence", "evidence entry must be { kind: artifact|run|document|test|site-configuration, ref }");
    }
  });
}

/** Fields a CredentialLocator must never carry — secret material is out of contract. */
const FORBIDDEN_CREDENTIAL_FIELDS = ["secret", "value", "token", "password", "key_material", "secret_material"];

export function validateResource(record: unknown): ContractError[] {
  const errors: ContractError[] = [];
  if (!isPlainObject(record)) {
    err(errors, "$", "invalid-resource", "resource must be an object");
    return errors;
  }
  const schema = record.schema as ResourceSchema;
  if (!(RESOURCE_SCHEMAS as readonly string[]).includes(String(schema))) {
    err(errors, "$.schema", "unknown-schema", `unknown resource schema: ${String(record.schema)}`);
    return errors;
  }
  const parsed = parseResourceId(record.id);
  if (!parsed) {
    err(errors, "$.id", "malformed-identity", `unparseable resource id: ${String(record.id)}`);
    return errors;
  }
  const expectedIdKind = SCHEMA_ID_KIND[schema];
  if (parsed.kind !== expectedIdKind) {
    err(errors, "$.id", "malformed-identity", `schema '${schema}' requires id kind '${expectedIdKind}', got '${parsed.kind}'`);
  }
  switch (schema) {
    case MODEL_SCHEMA:
      checkRef(record.provider, "$.provider", "model-provider", errors);
      break;
    case MODEL_OFFERING_SCHEMA:
      checkRef(record.model, "$.model", "model", errors);
      checkRef(record.model_provider, "$.model_provider", "model-provider", errors);
      checkRef(record.inference_provider, "$.inference_provider", "inference-provider", errors);
      checkRef(record.endpoint, "$.endpoint", "inference-endpoint", errors);
      if (!isNonEmptyString(record.service_class)) {
        err(errors, "$.service_class", "invalid-resource", "model offering requires a service_class");
      }
      if (!isNonEmptyString(record.invocation_model_key)) {
        err(errors, "$.invocation_model_key", "invalid-resource", "model offering requires its service-specific invocation_model_key");
      }
      break;
    case INFERENCE_ENDPOINT_SCHEMA: {
      checkRef(record.inference_provider, "$.inference_provider", "inference-provider", errors);
      checkRef(record.adapter, "$.adapter", "adapter", errors);
      if (!isPlainObject(record.address) || !["url", "workers-binding", "runtime-service"].includes(String(record.address.kind))) {
        err(errors, "$.address", "invalid-resource", "endpoint address must be a typed URL, Workers binding, or runtime service coordinate");
      } else if (record.address.kind === "url") {
        if (!isNonEmptyString(record.address.url)) {
          err(errors, "$.address.url", "invalid-resource", "URL endpoint address requires url");
        } else {
          try {
            const parsedUrl = new URL(record.address.url);
            if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.hash) {
              err(errors, "$.address.url", "invalid-resource", "URL endpoint must be HTTP(S) and cannot contain credentials or a fragment");
            }
          } catch {
            err(errors, "$.address.url", "invalid-resource", "URL endpoint address must be an absolute URL");
          }
        }
      } else if (record.address.kind === "workers-binding" && !isNonEmptyString(record.address.binding)) {
        err(errors, "$.address.binding", "invalid-resource", "Workers endpoint address requires binding");
      } else if (record.address.kind === "runtime-service" && !isNonEmptyString(record.address.service)) {
        err(errors, "$.address.service", "invalid-resource", "runtime-service endpoint address requires service");
      }
      if (!Array.isArray(record.serves)) {
        err(errors, "$.serves", "invalid-resource", "serves must be an array of model refs");
      } else {
        (record.serves as unknown[]).forEach((ref, i) => checkRef(ref, `$.serves[${i}]`, "model", errors));
      }
      if (record.credential !== undefined) {
        checkRef(record.credential, "$.credential", "credential-locator", errors);
      }
      break;
    }
    case ADAPTER_SCHEMA:
      if (!["node", "workers", "test"].includes(String(record.runtime_family))) {
        err(errors, "$.runtime_family", "invalid-resource", "runtime_family must be node | workers | test");
      }
      if (!isPlainObject(record.protocol) || !isNonEmptyString(record.protocol.version)) {
        err(errors, "$.protocol", "invalid-resource", "adapter requires a typed, versioned invocation protocol");
      } else {
        const operations: Record<string, readonly string[]> = {
          openai: ["chat-completions", "responses"],
          anthropic: ["messages"],
          "cloudflare-workers-ai": ["run"],
          "codex-subscription": ["responses"],
          narada: ["invoke"],
        };
        if (!operations[String(record.protocol.family)]?.includes(String(record.protocol.operation))) {
          err(errors, "$.protocol", "invalid-resource", "adapter protocol family and operation must be a supported pair");
        }
      }
      break;
    case CREDENTIAL_LOCATOR_SCHEMA: {
      if (!["env", "site-secret", "operator-secret", "file", "none"].includes(String(record.store))) {
        err(errors, "$.store", "invalid-resource", "store must be env | site-secret | operator-secret | file | none");
      }
      if (!isNonEmptyString(record.reference)) {
        err(errors, "$.reference", "invalid-resource", "reference (lookup key) is required");
      }
      checkRef(record.holder, "$.holder", "site", errors);
      for (const field of FORBIDDEN_CREDENTIAL_FIELDS) {
        if (field in record) {
          err(errors, `$.${field}`, "secret-material", "credential locator must never carry secret material");
        }
      }
      break;
    }
    case EXECUTION_LOCUS_SCHEMA:
      if (!["local", "cloudflare", "test"].includes(String(record.kind))) {
        err(errors, "$.kind", "invalid-resource", "execution locus kind must be local | cloudflare | test");
      }
      break;
    default:
      break;
  }
  return errors;
}

export function validateAssertion(record: unknown): ContractError[] {
  const errors: ContractError[] = [];
  if (!isPlainObject(record)) {
    err(errors, "$", "invalid-assertion", "assertion must be an object");
    return errors;
  }
  if (record.schema !== CAPABILITY_ASSERTION_SCHEMA) {
    err(errors, "$.schema", "unknown-schema", `expected ${CAPABILITY_ASSERTION_SCHEMA}`);
    return errors;
  }
  if (typeof record.id !== "string" || !/^assert:[a-z0-9][a-z0-9._-]*$/.test(record.id)) {
    err(errors, "$.id", "malformed-identity", "assertion id must match assert:<slug>");
  }
  checkRef(record.subject, "$.subject", null, errors);
  checkCapabilityKey(record.capability, "$.capability", errors);
  const value = record.value;
  const valueOk =
    typeof value === "boolean" || typeof value === "number" || typeof value === "string" || isPlainObject(value);
  if (!valueOk) {
    err(errors, "$.value", "invalid-assertion", "value must be boolean, number, string, or object");
  }
  if (!isPlainObject(record.scope)) {
    err(errors, "$.scope", "invalid-scope", "scope is required");
  } else {
    const locus = record.scope.locus;
    if (!["global", "target-site", "user-site", "host-site"].includes(String(locus))) {
      err(errors, "$.scope.locus", "invalid-scope", `unknown assertion locus: ${String(locus)}`);
    } else if (locus !== "global") {
      if (record.scope.site === undefined) {
        err(errors, "$.scope.site", "invalid-scope", `locus '${String(locus)}' requires a site reference`);
      } else {
        checkRef(record.scope.site, "$.scope.site", "site", errors);
      }
    }
  }
  if (!isPlainObject(record.provenance)) {
    err(errors, "$.provenance", "invalid-provenance", "provenance is required");
  } else {
    const provenance = record.provenance as unknown as Provenance;
    if (!["operator", "migration", "probe", "inference", "documented"].includes(String(provenance.source))) {
      err(errors, "$.provenance.source", "invalid-provenance", "unknown provenance source");
    }
    if (!isIsoTimestamp(provenance.recorded_at)) {
      err(errors, "$.provenance.recorded_at", "invalid-provenance", "recorded_at must be an ISO-8601 timestamp");
    }
  }
  if (!isPlainObject(record.validity)) {
    err(errors, "$.validity", "invalid-validity", "validity is required");
  } else {
    const { valid_from, valid_until, fresh_as_of } = record.validity as Record<string, unknown>;
    if (valid_from !== undefined && !isIsoTimestamp(valid_from)) {
      err(errors, "$.validity.valid_from", "invalid-validity", "valid_from must be ISO-8601");
    }
    if (valid_until !== undefined && !isIsoTimestamp(valid_until)) {
      err(errors, "$.validity.valid_until", "invalid-validity", "valid_until must be ISO-8601");
    }
    if (fresh_as_of !== undefined && !isIsoTimestamp(fresh_as_of)) {
      err(errors, "$.validity.fresh_as_of", "invalid-validity", "fresh_as_of must be ISO-8601");
    }
    if (isIsoTimestamp(valid_from) && isIsoTimestamp(valid_until) && Date.parse(valid_from) >= Date.parse(valid_until)) {
      err(errors, "$.validity", "invalid-validity", "valid_from must precede valid_until");
    }
  }
  if (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1) {
    err(errors, "$.confidence", "invalid-assertion", "confidence must be a number in [0, 1]");
  }
  checkEvidenceRefs(record.evidence, "$.evidence", errors);
  return errors;
}

function checkPolicyRule(rule: unknown, path: string, errors: ContractError[]): void {
  if (!isPlainObject(rule) || !isNonEmptyString(rule.type)) {
    err(errors, path, "invalid-policy-rule", "rule must be an object with a type");
    return;
  }
  const type = rule.type as PolicyRule["type"];
  if (type.endsWith("-capability")) {
    checkCapabilityKey(rule.capability, `${path}.capability`, errors);
  }
  if (type.endsWith("-resource")) {
    checkRef(rule.resource, `${path}.resource`, null, errors);
  }
  if (type.startsWith("prefer-") && typeof rule.weight !== "number") {
    err(errors, `${path}.weight`, "invalid-policy-rule", "preference rules require a numeric weight");
  }
  if (type === "default-option") {
    if (!isNonEmptyString(rule.option)) {
      err(errors, `${path}.option`, "invalid-policy-rule", "default-option requires an option name");
    }
    const value = rule.value;
    if (!(typeof value === "boolean" || typeof value === "number" || typeof value === "string" || isPlainObject(value))) {
      err(errors, `${path}.value`, "invalid-policy-rule", "default-option value must be boolean, number, string, or object");
    }
  }
}

export function validatePolicy(record: unknown): ContractError[] {
  const errors: ContractError[] = [];
  if (!isPlainObject(record)) {
    err(errors, "$", "invalid-policy", "policy must be an object");
    return errors;
  }
  if (record.schema !== POLICY_SCHEMA) {
    err(errors, "$.schema", "unknown-schema", `expected ${POLICY_SCHEMA}`);
    return errors;
  }
  if (typeof record.id !== "string" || !/^policy:[a-z0-9][a-z0-9._-]*$/.test(record.id)) {
    err(errors, "$.id", "malformed-identity", "policy id must match policy:<slug>");
  }
  const kind = record.kind as PolicyDocument["kind"];
  if (!Object.keys(POLICY_KIND_RULES).includes(String(kind))) {
    err(errors, "$.kind", "invalid-policy", `unknown policy kind: ${String(record.kind)}`);
    return errors;
  }
  if (!["target-site", "user-site", "host-site"].includes(String(record.locus))) {
    err(errors, "$.locus", "invalid-policy", `unknown policy locus: ${String(record.locus)}`);
  }
  checkRef(record.site, "$.site", "site", errors);
  if (!Array.isArray(record.rules)) {
    err(errors, "$.rules", "invalid-policy", "rules must be an array");
    return errors;
  }
  const allowed = POLICY_KIND_RULES[kind];
  (record.rules as unknown[]).forEach((rule, i) => {
    if (isPlainObject(rule) && isNonEmptyString(rule.type) && !allowed.includes(rule.type as PolicyRule["type"])) {
      err(errors, `$.rules[${i}]`, "contradictory-policy", `rule type '${rule.type}' is not permitted in a '${kind}' policy`);
      return;
    }
    checkPolicyRule(rule, `$.rules[${i}]`, errors);
  });
  if (typeof record.revision !== "number" || !Number.isInteger(record.revision) || record.revision < 0) {
    err(errors, "$.revision", "invalid-policy", "revision must be a non-negative integer");
  }
  return errors;
}

export function validateInvocation(record: unknown): ContractError[] {
  const errors: ContractError[] = [];
  if (!isPlainObject(record)) {
    err(errors, "$", "invalid-invocation", "invocation record must be an object");
    return errors;
  }
  switch (record.schema) {
    case INVOCATION_INTENT_SCHEMA: {
      if (!isNonEmptyString(record.id)) err(errors, "$.id", "invalid-invocation", "id is required");
      if (!isIsoTimestamp(record.created_at)) err(errors, "$.created_at", "invalid-invocation", "created_at must be ISO-8601");
      if (!isNonEmptyString(record.purpose)) err(errors, "$.purpose", "invalid-invocation", "purpose is required");
      if (record.input_digest !== undefined && (typeof record.input_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(record.input_digest))) {
        err(errors, "$.input_digest", "invalid-invocation", "input_digest must be a lowercase sha256 content digest");
      }
      if (record.required_capabilities !== undefined) {
        if (!Array.isArray(record.required_capabilities)) {
          err(errors, "$.required_capabilities", "invalid-invocation", "required_capabilities must be an array");
        } else {
          (record.required_capabilities as unknown[]).forEach((cap, i) =>
            checkCapabilityKey(cap, `$.required_capabilities[${i}]`, errors),
          );
        }
      }
      if (record.requested_model !== undefined) checkRef(record.requested_model, "$.requested_model", "model", errors);
      if (record.requested_options !== undefined && !isPlainObject(record.requested_options)) {
        err(errors, "$.requested_options", "invalid-invocation", "requested_options must be an object");
      }
      return errors;
    }
    case INVOCATION_PLAN_SCHEMA: {
      if (!isNonEmptyString(record.id)) err(errors, "$.id", "invalid-invocation", "id is required");
      if (!isNonEmptyString(record.intent_id)) err(errors, "$.intent_id", "invalid-invocation", "intent_id is required");
      if (!isIsoTimestamp(record.created_at)) err(errors, "$.created_at", "invalid-invocation", "created_at must be ISO-8601");
      if (!isNonEmptyString(record.resolver_version)) {
        err(errors, "$.resolver_version", "invalid-invocation", "resolver_version is required");
      }
      if (!isPlainObject(record.selected)) {
        err(errors, "$.selected", "invalid-invocation", "selected is required");
      } else {
        checkRef(record.selected.model, "$.selected.model", "model", errors);
        checkRef(record.selected.model_provider, "$.selected.model_provider", "model-provider", errors);
        checkRef(record.selected.inference_provider, "$.selected.inference_provider", "inference-provider", errors);
        checkRef(record.selected.endpoint, "$.selected.endpoint", "inference-endpoint", errors);
        checkRef(record.selected.adapter, "$.selected.adapter", "adapter", errors);
        if (record.selected.credential !== undefined) {
          checkRef(record.selected.credential, "$.selected.credential", "credential-locator", errors);
        }
      }
      if (!isPlainObject(record.route)) {
        err(errors, "$.route", "invalid-invocation", "explicit offering/route selection is required");
      } else {
        checkRef(record.route.offering, "$.route.offering", "model-offering", errors);
        checkRef(record.route.endpoint, "$.route.endpoint", "inference-endpoint", errors);
        checkRef(record.route.adapter, "$.route.adapter", "adapter", errors);
        if (!isNonEmptyString(record.route.route_id) || !isNonEmptyString(record.route.topology_id) || !isNonEmptyString(record.route.composition_digest)) {
          err(errors, "$.route", "invalid-invocation", "route id, topology id, and composition digest are required");
        }
        if (!Array.isArray(record.route.execution_loci) || record.route.execution_loci.length === 0) {
          err(errors, "$.route.execution_loci", "invalid-invocation", "at least one execution locus is required");
        } else {
          (record.route.execution_loci as unknown[]).forEach((ref, index) => checkRef(ref, `$.route.execution_loci[${index}]`, "execution-locus", errors));
        }
        if (!isNonEmptyString(record.route.account_ref) || !Array.isArray(record.route.grant_refs) || record.route.grant_refs.length === 0) {
          err(errors, "$.route", "invalid-invocation", "route account and grant refs are required");
        }
        if (record.route.credential !== undefined) checkRef(record.route.credential, "$.route.credential", "credential-locator", errors);
      }
      if (!isPlainObject(record.access)
        || !isNonEmptyString(record.access.account_id)
        || !isNonEmptyString(record.access.grant_id)
        || !isNonEmptyString(record.access.entitlement_id)
        || !isNonEmptyString(record.access.quota_id)
        || !isNonEmptyString(record.access.budget_id)
        || !Array.isArray(record.access.governance_requirement_ids)) {
        err(errors, "$.access", "invalid-invocation", "complete access/entitlement/quota/budget/governance provenance is required");
      }
      if (!isPlainObject(record.authority_provenance)
        || record.authority_provenance.schema !== "narada.invokable-intelligence.authority-resolution-provenance.v1"
        || !Array.isArray(record.authority_provenance.decisions)) {
        err(errors, "$.authority_provenance", "invalid-invocation", "authority resolution provenance is required");
      }
      if (!isPlainObject(record.snapshot)) {
        err(errors, "$.snapshot", "invalid-invocation", "immutable plan snapshot is required");
      } else {
        for (const diagnostic of validatePlanDecisionSnapshot(record.snapshot as unknown as PlanDecisionSnapshot)) {
          err(errors, `$.snapshot${diagnostic.path === "$" ? "" : diagnostic.path.slice(1)}`, diagnostic.code, diagnostic.message);
        }
        if (record.snapshot.plan_id !== record.id || record.snapshot.intent_id !== record.intent_id) {
          err(errors, "$.snapshot", "invalid-plan-snapshot", "snapshot plan/intent identities must match the enclosing plan");
        }
      }
      if (!isPlainObject(record.options)) err(errors, "$.options", "invalid-invocation", "options must be an object");
      checkProvenance(record.provenance, "$.provenance", errors);
      return errors;
    }
    case INVOCATION_REFUSAL_SCHEMA: {
      if (!isNonEmptyString(record.id)) err(errors, "$.id", "invalid-invocation", "id is required");
      if (!isNonEmptyString(record.intent_id)) err(errors, "$.intent_id", "invalid-invocation", "intent_id is required");
      if (
        !["no-candidates", "explicit-route-required", "principal-required", "principal-consent-required", "principal-prohibited", "authority-policy-conflict", "topology-infeasible", "access-denied", "temporal-input-required", "stale-plan", "credentials-unavailable", "stale-capabilities", "policy-conflict", "unsupported-options"].includes(
          String(record.reason_code),
        )
      ) {
        err(errors, "$.reason_code", "invalid-invocation", "unknown refusal reason code");
      }
      if (!isNonEmptyString(record.explanation)) err(errors, "$.explanation", "invalid-invocation", "explanation is required");
      if (!Array.isArray(record.rejected_candidates)) {
        err(errors, "$.rejected_candidates", "invalid-invocation", "rejected_candidates must be an array");
      }
      return errors;
    }
    default:
      err(errors, "$.schema", "unknown-schema", `unknown invocation schema: ${String(record.schema)}`);
      return errors;
  }
}

function checkProvenance(value: unknown, path: string, errors: ContractError[]): void {
  if (!isPlainObject(value)) {
    err(errors, path, "invalid-provenance", "decision provenance is required");
    return;
  }
  for (const field of ["applied_constraints", "applied_preferences", "applied_defaults"] as const) {
    const entries = value[field];
    if (!Array.isArray(entries)) {
      err(errors, `${path}.${field}`, "invalid-provenance", `${field} must be an array`);
      continue;
    }
    entries.forEach((entry, i) => {
      if (!isPlainObject(entry) || !isNonEmptyString(entry.source) || !isNonEmptyString(entry.effect)) {
        err(errors, `${path}.${field}[${i}]`, "invalid-provenance", "entries must be { source, effect }");
      }
    });
  }
  const rejected = value.rejected_candidates;
  if (!Array.isArray(rejected)) {
    err(errors, `${path}.rejected_candidates`, "invalid-provenance", "rejected_candidates must be an array");
  } else {
    rejected.forEach((entry, i) => {
      if (!isPlainObject(entry)) {
        err(errors, `${path}.rejected_candidates[${i}]`, "invalid-provenance", "rejected entry must be an object");
        return;
      }
      checkRef(entry.candidate, `${path}.rejected_candidates[${i}].candidate`, null, errors);
      if (!Array.isArray(entry.reasons) || entry.reasons.some((r) => !isNonEmptyString(r))) {
        err(errors, `${path}.rejected_candidates[${i}].reasons`, "invalid-provenance", "reasons must be non-empty strings");
      }
    });
  }
}

export interface ContractBundle {
  resources?: Resource[];
  assertions?: CapabilityAssertion[];
  policies?: PolicyDocument[];
  invocations?: unknown[];
}

/**
 * Validate every record, then check cross-reference integrity: each ref
 * anywhere in the bundle must resolve to a resource in the bundle.
 */
export function validateBundle(bundle: ContractBundle): ContractError[] {
  const errors: ContractError[] = [];
  const resources = bundle.resources ?? [];
  const assertions = bundle.assertions ?? [];
  const policies = bundle.policies ?? [];
  const invocations = bundle.invocations ?? [];

  resources.forEach((record, i) => {
    validateResource(record).forEach((e) => errors.push({ ...e, path: `$.resources[${i}]${e.path.slice(1)}` }));
  });
  assertions.forEach((record, i) => {
    validateAssertion(record).forEach((e) => errors.push({ ...e, path: `$.assertions[${i}]${e.path.slice(1)}` }));
  });
  policies.forEach((record, i) => {
    validatePolicy(record).forEach((e) => errors.push({ ...e, path: `$.policies[${i}]${e.path.slice(1)}` }));
  });
  invocations.forEach((record, i) => {
    validateInvocation(record).forEach((e) => errors.push({ ...e, path: `$.invocations[${i}]${e.path.slice(1)}` }));
  });
  if (errors.length > 0) return errors;

  const known = new Set<ResourceId>(resources.map((r) => r.id));
  const checkResolvable = (ref: ResourceRef | undefined, path: string): void => {
    if (ref && !known.has(ref.id)) {
      err(errors, path, "unresolved-reference", `reference '${ref.id}' does not resolve to a bundle resource`);
    }
  };

  resources.forEach((record, i) => {
    if (record.schema === MODEL_SCHEMA) checkResolvable(record.provider, `$.resources[${i}].provider`);
    if (record.schema === MODEL_OFFERING_SCHEMA) {
      checkResolvable(record.model, `$.resources[${i}].model`);
      checkResolvable(record.model_provider, `$.resources[${i}].model_provider`);
      checkResolvable(record.inference_provider, `$.resources[${i}].inference_provider`);
      checkResolvable(record.endpoint, `$.resources[${i}].endpoint`);
    }
    if (record.schema === INFERENCE_ENDPOINT_SCHEMA) {
      checkResolvable(record.inference_provider, `$.resources[${i}].inference_provider`);
      checkResolvable(record.adapter, `$.resources[${i}].adapter`);
      record.serves.forEach((ref, j) => checkResolvable(ref, `$.resources[${i}].serves[${j}]`));
      if (record.credential) checkResolvable(record.credential, `$.resources[${i}].credential`);
    }
    if (record.schema === CREDENTIAL_LOCATOR_SCHEMA) checkResolvable(record.holder, `$.resources[${i}].holder`);
  });
  assertions.forEach((record, i) => {
    checkResolvable(record.subject, `$.assertions[${i}].subject`);
    if (record.scope.site) checkResolvable(record.scope.site, `$.assertions[${i}].scope.site`);
  });
  policies.forEach((record, i) => {
    checkResolvable(record.site, `$.policies[${i}].site`);
  });
  invocations.forEach((record, i) => {
    if (isPlainObject(record) && record.schema === INVOCATION_PLAN_SCHEMA) {
      const selected = record.selected as Record<string, ResourceRef>;
      for (const [field, ref] of Object.entries(selected)) {
        checkResolvable(ref, `$.invocations[${i}].selected.${field}`);
      }
    }
  });
  return errors;
}
