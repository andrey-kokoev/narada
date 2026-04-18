/**
 * Charter Runtime Exports
 *
 * Runner-side: envelope building and runner implementations return output only.
 * Runtime integration: `persistEvaluation` is called by daemon dispatch before
 * foreman resolution; it is not a runner hook.
 */

export type { CharterRunner, MockCharterRunnerOptions } from "./runner.js";
export { MockCharterRunner } from "./runner.js";

export type {
  BuildInvocationEnvelopeDeps,
  BuildInvocationEnvelopeOptions,
  BuildEvaluationRecordOptions,
  ContextMaterializer,
  MaterializerFactory,
} from "./envelope.js";
export {
  buildInvocationEnvelope,
  buildEvaluationRecord,
  persistEvaluation,
  VerticalMaterializerRegistry,
  TimerContextMaterializer,
  WebhookContextMaterializer,
  FilesystemContextMaterializer,
} from "./envelope.js";


