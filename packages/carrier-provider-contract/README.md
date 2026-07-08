# @narada2/carrier-provider-contract

Shared carrier provider/admission contracts for Narada carrier surfaces.

This package owns provider registry metadata, provider support states, default provider selection, provider environment projection, provider cognition defaults, and provider adapter admission contract fixtures consumed by carrier implementations such as `agent-cli`, `agent-tui`, and Codex-as-carrier.

## Provider Registry Contract

The authoritative registry is `contracts/provider-registry.json`. Each provider entry declares:

- `default_model` and `available_models`.
- `cognition_defaults.low|medium|high`, each with `model` and `reasoning_effort`.
- adapter kind, support state, base URL/model/credential environment names, and credential requirement.

`cognition_defaults` is the durable source used by worker-delegation and delegated-task surfaces when launching `narada-agent-runtime-server` workers. Every cognition default model must be present in that provider's `available_models`; the package tests enforce this so registry drift is caught where the contract lives.

## Verified Runtime Providers

| Provider | Adapter | Required API key env | Model env | Base URL env |
| --- | --- | --- | --- | --- |
| `kimi-api` | OpenAI-compatible chat completions | `KIMI_API_KEY` | `KIMI_MODEL` | `KIMI_API_BASE_URL` |
| `kimi-code-api` | OpenAI-compatible chat completions | `KIMI_CODE_API_KEY` | `KIMI_CODE_MODEL` | `KIMI_CODE_API_BASE_URL` |
| `deepseek-api` | OpenAI-compatible chat completions | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | `DEEPSEEK_API_BASE_URL` |
| `glm-api` | OpenAI-compatible chat completions | `GLM_API_KEY` | `GLM_MODEL` | `GLM_API_BASE_URL` |
| `openrouter-api` | OpenAI-compatible chat completions | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `OPENROUTER_BASE_URL` or `OPENROUTER_API_BASE_URL` |

OpenRouter requests preserve the configured router model as OpenRouter model identity. Optional attribution headers are sourced from `OPENROUTER_SITE_URL`/`OPENROUTER_HTTP_REFERER` and `OPENROUTER_APP_NAME`/`OPENROUTER_X_TITLE`.
