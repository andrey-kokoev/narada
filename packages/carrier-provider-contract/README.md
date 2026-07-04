# @narada2/carrier-provider-contract

Shared carrier provider/admission contracts for Narada carrier surfaces.

This package owns provider registry metadata, provider support states, default provider selection, provider environment projection, and provider adapter admission contract fixtures consumed by carrier implementations such as `agent-cli`, `agent-tui`, and Codex-as-carrier.

## Verified Runtime Providers

| Provider | Adapter | Required API key env | Model env | Base URL env |
| --- | --- | --- | --- | --- |
| `kimi-api` | OpenAI-compatible chat completions | `KIMI_API_KEY` | `KIMI_MODEL` | `KIMI_API_BASE_URL` |
| `kimi-code-api` | OpenAI-compatible chat completions | `KIMI_CODE_API_KEY` | `KIMI_CODE_MODEL` | `KIMI_CODE_API_BASE_URL` |
| `deepseek-api` | OpenAI-compatible chat completions | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | `DEEPSEEK_API_BASE_URL` |
| `openrouter-api` | OpenAI-compatible chat completions | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `OPENROUTER_BASE_URL` or `OPENROUTER_API_BASE_URL` |

OpenRouter requests preserve the configured router model as OpenRouter model identity. Optional attribution headers are sourced from `OPENROUTER_SITE_URL`/`OPENROUTER_HTTP_REFERER` and `OPENROUTER_APP_NAME`/`OPENROUTER_X_TITLE`.
