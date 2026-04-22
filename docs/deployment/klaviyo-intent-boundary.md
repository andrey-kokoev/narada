# Klaviyo Intent Boundary Contract

> Defines the durable intent boundary for Klaviyo campaign operations: which actions are allowed as intents, which are forbidden, how credentials are bound, and how observation confirms execution.
>
> This contract is the output of **Task 390**. It governs v0 posture and v1 expansion for the email-marketing Operation. No Klaviyo adapter implementation may proceed before this contract is referenced.
>
> Uses crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. Intent Type Classification

All Klaviyo interactions must be represented as durable `Intent` objects before execution. The following table classifies each intent type by version and authority.

| Intent Type | v0 | v1 | Authority | Description |
|-------------|----|----|-----------|-------------|
| `klaviyo_campaign_create` | ❌ | ✅ | `execute` + operator policy | Create a draft campaign in Klaviyo from an approved brief |
| `klaviyo_campaign_update` | ❌ | ⚠️ | `execute` + operator policy | Update campaign content (deferred — requires change-review policy) |
| `klaviyo_campaign_read` | ❌ | ✅ | `derive` | Read campaign state for reconciliation; read-only, no mutation |
| `klaviyo_campaign_send` | ❌ | ❌ | — | **Forbidden in all versions** without explicit operator policy amendment |
| `klaviyo_list_read` | ❌ | ✅ | `derive` | Read list/segment metadata (no customer record data) |
| `klaviyo_list_update` | ❌ | ❌ | — | **Forbidden** — customer data mutation is out of scope for all versions |

### 1.1 v0 Posture

In v0, **no Klaviyo intent is executable**. The Operation produces `campaign_brief` documents (non-executable, document-only action type) and `send_reply` follow-up emails. The operator manually enters approved briefs into the Klaviyo UI.

`campaign_brief` is not a Klaviyo intent. It is a document action type that:
- Carries structured campaign parameters (name, audience, content summary, timing)
- Is surfaced in the operator console for review
- Has no execution worker in v0
- May be promoted to a `klaviyo_campaign_create` intent in v1 after operator policy amendment

### 1.2 v1 Expansion

v1 adds:
- `KlaviyoEffectAdapter` implementation (boundary specified in §2)
- `klaviyo_campaign_create` intent type with `approved_for_send` gating
- `klaviyo_campaign_read` observation for reconciliation
- `klaviyo_list_read` for audience validation

`klaviyo_campaign_send` remains **forbidden** in v1 unless an explicit operator policy amendment is adopted, reviewed, and logged.

---

## 2. `KlaviyoEffectAdapter` Interface

The adapter is the **only** component that may call the Klaviyo REST API. All other layers interact with Klaviyo through durable intents and this adapter.

```typescript
/**
 * Klaviyo Effect Adapter — the exclusive boundary for Klaviyo API mutation.
 *
 * All campaign mutations flow through durable intents before reaching this adapter.
 * The adapter does not decide eligibility; it only executes authorized payloads.
 */
export interface KlaviyoEffectAdapter {
  /**
   * Create a draft campaign in Klaviyo from an approved brief.
   *
   * Returns a `submitted` result when Klaviyo accepts the API call.
   * The campaign is NOT confirmed until reconciliation observes it.
   */
  createCampaign(
    scopeId: string,
    outboundId: string,
    brief: CampaignBrief,
  ): Promise<KlaviyoCampaignResult>;

  /**
   * Read campaign status from Klaviyo for reconciliation.
   *
   * Read-only. Does not mutate campaign state.
   */
  getCampaignStatus(
    scopeId: string,
    campaignId: string,
  ): Promise<KlaviyoCampaignStatus>;
}

export interface CampaignBrief {
  name: string;
  subject: string;
  audience_list_id?: string;
  audience_segment_id?: string;
  from_email: string;
  content_html?: string;
  content_text?: string;
  scheduled_time?: string;
}

export interface KlaviyoCampaignResult {
  status: "submitted" | "failed_retryable" | "failed_terminal";
  outboundId: string;
  campaignId?: string;
  message?: string;
}

export interface KlaviyoCampaignStatus {
  campaignId: string;
  state: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  updatedAt: string;
}
```

### 2.1 Error Classification

The adapter must classify every Klaviyo API error as either **retryable** or **terminal**:

| Error Condition | Classification | Retry Behavior |
|-----------------|----------------|----------------|
| HTTP 429 (rate limited) | `failed_retryable` | Respect `Retry-After` header, or exponential backoff |
| HTTP 503 / 504 (Klaviyo unavailable) | `failed_retryable` | Exponential backoff |
| Network timeout / DNS failure | `failed_retryable` | Exponential backoff |
| HTTP 401 (unauthorized) | `failed_terminal` | Fail-fast; credential rotation required |
| HTTP 403 (forbidden) | `failed_terminal` | Fail-fast; policy amendment required |
| HTTP 400 (bad request) | `failed_terminal` | Fail-fast; brief validation required |
| HTTP 404 (campaign not found on read) | `failed_terminal` | Reconciliation treats as missing / deleted |
| HTTP 422 (unprocessable entity) | `failed_terminal` | Fail-fast; brief schema mismatch |

### 2.2 Bounded Retry

- Max retry attempts: **5**
- Backoff: exponential, starting at 1 second, doubling each attempt (`1s → 2s → 4s → 8s → 16s`)
- After 5 `failed_retryable` outcomes, the adapter returns `failed_terminal`
- Total max wait: ~31 seconds per command
- The adapter must not block the worker indefinitely; each attempt is a separate execution attempt row

---

## 3. Credential Binding

Klaviyo credentials are **fail-closed**. Missing credentials must not fall back to defaults or empty strings.

### 3.1 Credential Sources (precedence: highest first)

| Source | Env Var | Secure Storage Key | Config Key |
|--------|---------|-------------------|------------|
| Private API Key (read + write) | `KLAVIYO_API_KEY` | `klaviyo.api_key` | `klaviyo.api_key` |
| Private API Key (read-only fallback) | `KLAVIYO_PRIVATE_API_KEY` | `klaviyo.private_api_key` | `klaviyo.private_api_key` |

### 3.2 Resolution Rules

1. **Environment variables** take highest precedence.
2. **Windows Credential Manager** (or macOS Keychain / Linux keyring) is used for secure storage references (`{ "$secure": "key" }`).
3. **Config file values** are lowest precedence and must be plain references, never literal secrets.
4. If **no credential is resolved**, the adapter constructor throws `KlaviyoCredentialError` with `status: 401`.
5. The effect worker maps `KlaviyoCredentialError` to `failed_terminal`.

### 3.3 Fail-Closed Validation

```typescript
export class KlaviyoCredentialError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
  }
}

export function createKlaviyoAdapter(env: KlaviyoEnv): KlaviyoEffectAdapter {
  const apiKey = resolveSecret(env, "klaviyo.api_key");
  if (!apiKey) {
    throw new KlaviyoCredentialError(
      "Klaviyo API key not found. Set KLAVIYO_API_KEY or bind a secure storage reference."
    );
  }
  // ...
}
```

### 3.4 v0 Posture

In v0, **no Klaviyo adapter is instantiated**. The Operation does not resolve Klaviyo credentials. If a Site config contains Klaviyo credential references, they are ignored until v1 policy enables the adapter.

---

## 4. Observation / Confirmation Model

Narada's two-stage completion semantics apply to Klaviyo campaign operations.

### 4.1 State Machine

```
operator approves brief
    ↓
foreman creates decision → outbound handoff creates command
    ↓
worker executes klaviyo_campaign_create intent
    ↓
Klaviyo API returns 20x → command status = SUBMITTED
    ↓
reconciliation polls getCampaignStatus()
    ↓
campaign observed in Klaviyo → command status = CONFIRMED
```

### 4.2 Confirmation Rules

| Condition | Status | Meaning |
|-----------|--------|---------|
| Klaviyo API returns 20x with campaign ID | `submitted` | Klaviyo accepted the request. Campaign may not yet be queryable. |
| `getCampaignStatus()` returns `draft` or `scheduled` | `confirmed` | Reconciliation has independently observed the campaign exists. |
| API returns 401/403 | `failed_terminal` | Credential or policy failure. Operator attention required. |
| API returns 429 × 5 | `failed_terminal` | Rate limit exhaustion. Operator attention required. |
| API returns 400/422 | `failed_terminal` | Brief validation failure. Operator attention required. |

### 4.3 No Self-Confirmation

**API success ≠ confirmed.** The worker must NOT transition the command to `confirmed` based on the API response alone. Confirmation is exclusively the reconciliation step's job.

This invariant preserves Narada's crash-recovery semantics: if the worker crashes after submitting but before confirming, reconciliation will later observe the campaign and complete the confirmation.

### 4.4 v0 Posture

In v0, **no Klaviyo confirmation exists** because no Klaviyo intents are executed. `campaign_brief` documents require no confirmation — they are surfaced for operator review and have no execution stage.

---

## 5. Rate-Limit and Backoff Behavior

### 5.1 Klaviyo API Rate Limits

Klaviyo imposes rate limits per API key. The adapter must:

1. Read the `Retry-After` response header on HTTP 429.
2. If `Retry-After` is present, wait that many seconds before retry.
3. If `Retry-After` is absent, use default exponential backoff: `2^n` seconds where `n` is the attempt number (0-indexed).
4. Max retry attempts: **5** (see §2.2).

### 5.2 Per-Command Retry Limit

Each `outbound_command` row tracks its execution attempts independently. The adapter does not maintain global retry state. After 5 `failed_retryable` attempts:

- The adapter returns `failed_terminal`.
- The worker records the terminal failure in the execution attempt row.
- The command remains in `failed_terminal` state.
- The attention queue derivation surfaces the item for operator review.

### 5.3 Worker Exclusivity

Only the designated Klaviyo worker may call `KlaviyoEffectAdapter.createCampaign()`. No charter, console, or observation code may invoke the adapter directly.

---

## 6. Attention Queue Derivation

When Klaviyo operations fail or require operator action, the attention queue must surface them with appropriate severity and remediation metadata.

| Condition | Attention Item Type | Severity | Remediation |
|-----------|---------------------|----------|-------------|
| `klaviyo_campaign_create` failed terminal | `credential_required` or `pending_outbound_command` | high | Check credentials, review brief, retry via operator action |
| Missing `KLAVIYO_API_KEY` | `credential_required` | high | Set env var or bind secure storage reference |
| `klaviyo_campaign_send` proposed by charter (forbidden) | `policy_violation` | high | Review charter capability binding; charter must not propose forbidden action types |
| Campaign stuck in `submitted` > 5 minutes | `pending_outbound_command` | medium | Reconciliation lag; check Klaviyo API health |

### 6.1 Credential-Required Items

Credential-required attention items must:
- Include the affected capability (`klaviyo_campaign_create`) and missing credential name (`KLAVIYO_API_KEY`)
- Include an operator remediation command (e.g., `narada doctor --site <site-id>`)
- **Never** include secret values, raw tokens, or sensitive config material
- Support subtype `interactive_auth_required` for cases requiring `az login` or similar interactive authentication

### 6.2 Interactive Auth Subtypes

If Klaviyo credentials are obtained via delegated authentication (e.g., Azure AD → Klaviyo SSO), the attention item must:
- Use subtype `interactive_auth_required`
- Present an operator-run command (e.g., `az login --tenant <tenant-id>`)
- **Never** invoke the command automatically
- **Never** spawn interactive subprocesses from the adapter or worker

---

## 7. v0 Posture Summary

| Capability | v0 | v1 |
|------------|----|----|
| `KlaviyoEffectAdapter` implementation | ❌ Not implemented | ✅ Implemented |
| `klaviyo_campaign_create` intent | ❌ Forbidden | ✅ Allowed with operator policy |
| `klaviyo_campaign_read` observation | ❌ Not needed | ✅ Implemented |
| `klaviyo_campaign_send` | ❌ Forbidden | ❌ Forbidden (requires policy amendment) |
| `klaviyo_list_update` | ❌ Forbidden | ❌ Forbidden |
| Credential resolution | ❌ Not executed | ✅ Executed at adapter construction |
| Campaign brief execution | ❌ Document-only, no worker | ❌ Document-only (manual operator entry) |
| Reconciliation | ❌ Only `send_reply` (Graph) | ✅ `send_reply` + `klaviyo_campaign_create` |

---

## 8. Mapping to AGENTS.md Invariants

| Invariant | Klaviyo Intent Boundary Preservation |
|-----------|--------------------------------------|
| 12. Worker Exclusivity | Only the Klaviyo worker may call `createCampaign()` |
| 17. Decision Before Command | `foreman_decision` → `outbound_handoff` → command. No direct adapter calls. |
| 32. Draft-First Delivery | `campaign_brief` is a draft document. `klaviyo_campaign_create` creates a draft campaign in Klaviyo. |
| 33. Two-Stage Completion | `submitted` on API acceptance, `confirmed` only after reconciliation observation. |
| 34. No External Draft Mutation | Only the Klaviyo worker may create or update campaigns in Klaviyo. |
| 35. Worker Exclusivity | Only the designated outbound worker may execute Klaviyo mutations. |

---

## 9. Closure Checklist

- [x] Intent type table exists with v0 / v1 / forbidden classification.
- [x] `KlaviyoEffectAdapter` interface is specified with `createCampaign`, `getCampaignStatus`, and error classification.
- [x] Credential binding is documented with precedence, fail-closed validation, and `KlaviyoCredentialError`.
- [x] Observation/confirmation model follows Narada semantics: API success ≠ confirmed.
- [x] Rate-limit and backoff behavior is documented (Retry-After, exponential backoff, 5-attempt limit).
- [x] v0 posture is explicit: no adapter, manual operator entry, `campaign_brief` is document-only.
- [x] Attention queue derivation covers credential-required and interactive-auth cases.
- [x] No secret material in public documentation.
