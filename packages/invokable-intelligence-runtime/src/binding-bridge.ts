/**
 * Bridge from a resolver InvocationPlan to the legacy runtime binding
 * seam (narada.carrier.provider_runtime_binding.v1): the plan's selected
 * refs become binding OVERRIDES, which beat env at every field — so the
 * plan is authoritative and env is inert. The bridge never carries
 * secrets; credentials stay locator references resolved by the runtime.
 */

import type { InvocationPlan, Model } from "@narada2/invokable-intelligence-contract";

export interface LegacyBindingOverrides {
  /** Legacy provider id (inference-provider id without the kind prefix). */
  provider: string;
  overrides: {
    model: string;
    thinking?: string;
    baseUrl?: string;
  };
}

export function planToLegacyBindingOverrides(plan: InvocationPlan, model: Model): LegacyBindingOverrides {
  const provider = plan.selected.inference_provider.id.replace(/^inference-provider:/, "");
  const thinking = typeof plan.options.thinking === "string" ? plan.options.thinking : undefined;
  return {
    provider,
    overrides: {
      model: model.display_name ?? model.id.replace(/^model:/, ""),
      ...(thinking ? { thinking } : {}),
    },
  };
}
