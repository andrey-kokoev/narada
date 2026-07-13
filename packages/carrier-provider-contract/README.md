# @narada2/carrier-provider-contract

Shared carrier provider/admission contracts for Narada carrier surfaces.

This package owns provider registry metadata, provider support states, default provider selection, provider environment projection, provider cognition defaults, and provider adapter admission contract fixtures consumed by carrier implementations such as `agent-cli`, `agent-tui`, and Codex-as-carrier.

## Provider Registry Contract

The authoritative registry is `contracts/provider-registry.json`. Each provider entry declares:

- `default_model`, `default_thinking` (optional; defaults to `medium`), and `available_models`.
- `cognition_defaults.low|medium|high`, each with `model` and `reasoning_effort`.
- adapter kind, support state, base URL/model/credential environment names, and credential requirement.

`cognition_defaults` is the durable source used by worker-delegation and delegated-task surfaces when launching `narada-agent-runtime-server` workers. Every cognition default model must be present in that provider's `available_models`; the package tests enforce this so registry drift is caught where the contract lives.

`available_models` is declared fallback policy, not proof of current account availability. Providers with a live account-local catalog, such as `codex-subscription`, may replace it at runtime and must expose catalog provenance.
The optional `model_catalog` contract declares the observation mechanism and freshness policy. `codex_local_cache.max_age_ms` is the canonical freshness threshold for Codex subscription cache evidence.

## Runtime Binding Boundary

Before a carrier runtime or delegated NARS worker starts, it must resolve exactly one `narada.carrier.provider_runtime_binding.v1` from the registry entry selected by `NARADA_INTELLIGENCE_PROVIDER`.

The binding is the runtime authority for the provider tuple:

- provider identity
- endpoint
- model and reasoning effort
- selected credential requirement and credential fingerprint

`NARADA_AI_API_KEY`, `NARADA_AI_BASE_URL`, `NARADA_AI_MODEL`, and `NARADA_AI_THINKING` are the canonical projection of that tuple. They are accepted as input only when their accompanying `NARADA_INTELLIGENCE_PROVIDER` matches the selected provider. Provider-specific variables are input adapters for that same provider only; they must never be selected by cross-provider fallback order.

Runtimes may retain other credentials in their parent process when independent MCP surfaces require them, but a delegated worker child receives only the selected binding's canonical variables and selected provider aliases. Bindings exposed in logs, run records, or tool results must be redacted and may contain only a credential fingerprint, never the credential itself.

## Verified Runtime Providers

| Provider | Adapter | Required API key env | Model env | Base URL env |
| --- | --- | --- | --- | --- |
| `kimi-api` | OpenAI-compatible chat completions | `KIMI_API_KEY` | `KIMI_MODEL` | `KIMI_API_BASE_URL` |
| `kimi-code-api` | OpenAI-compatible chat completions | `KIMI_CODE_API_KEY` | `KIMI_CODE_MODEL` | `KIMI_CODE_API_BASE_URL` |
| `deepseek-api` | OpenAI-compatible chat completions | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | `DEEPSEEK_API_BASE_URL` |
| `glm-api` | OpenAI-compatible chat completions | `GLM_API_KEY` | `GLM_MODEL` | `GLM_API_BASE_URL` |
| `openrouter-api` | OpenAI-compatible chat completions | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `OPENROUTER_BASE_URL` or `OPENROUTER_API_BASE_URL` |

OpenRouter requests preserve the configured router model as OpenRouter model identity. Optional attribution headers are sourced from `OPENROUTER_SITE_URL`/`OPENROUTER_HTTP_REFERER` and `OPENROUTER_APP_NAME`/`OPENROUTER_X_TITLE`.
