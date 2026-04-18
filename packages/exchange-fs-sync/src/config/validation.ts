/**
 * Configuration validation utilities
 *
 * Centralized runtime validation for config that must fail before side effects.
 */

import type { ExchangeFsSyncConfig } from "./types.js";
import { loadCharterEnv } from "./env.js";

/**
 * Validate that the charter runtime configuration is sound.
 *
 * Fail-fast: throws if runtime is unsupported or required credentials are missing.
 */
export function validateCharterRuntimeConfig(cfg: ExchangeFsSyncConfig): void {
  const runtime = cfg.charter?.runtime ?? "mock";

  if (runtime === "codex-api" || runtime === "kimi-api") {
    const env = loadCharterEnv();
    const apiKey =
      cfg.charter?.api_key ??
      (runtime === "kimi-api" ? env.kimi_api_key : env.openai_api_key);
    if (!apiKey) {
      throw new Error(
        runtime === "kimi-api"
          ? "Charter runtime is configured as kimi-api but no API key is provided. Set config.charter.api_key or NARADA_KIMI_API_KEY / KIMI_API_KEY environment variable."
          : "Charter runtime is configured as codex-api but no API key is provided. Set config.charter.api_key or NARADA_OPENAI_API_KEY / OPENAI_API_KEY environment variable.",
      );
    }
    return;
  }

  if (runtime === "mock") {
    return;
  }

  throw new Error(`Invalid charter runtime: ${runtime}. Expected 'codex-api', 'kimi-api', or 'mock'.`);
}
