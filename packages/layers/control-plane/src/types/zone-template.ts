/**
 * Zone Template Taxonomy
 *
 * Narada's zones are authority-homogeneous regions connected by governed crossings.
 * Not every zone instantiates a reusable template, but many do. This file declares
 * the bounded taxonomy of zone templates and maps current Narada zones to them.
 *
 * Templates are descriptive, not prescriptive. They provide a vocabulary for
 * reasoning about zones but do not mandate runtime refactoring.
 */

/**
 * A zone template is a reusable pattern that multiple zones instantiate.
 * Templates are defined by invariant authority grammar, not by implementation
 * module or substrate.
 */
export type ZoneTemplate =
  | 'ingress'
  | 'canonicalization'
  | 'compilation'
  | 'governance'
  | 'effect_boundary'
  | 'performance'
  | 'verification'
  | 'observation';

/**
 * Core declaration of what a template means.
 */
export interface ZoneTemplateDeclaration {
  /** Canonical template identifier */
  template: ZoneTemplate;

  /**
   * The authority grammar that remains invariant across all instances
   * of this template. States who may act, what they may do, and what
   * they may not do.
   */
  invariant_authority_grammar: string;

  /** Artifacts typically produced by zones of this template */
  typical_artifacts: string[];

  /** Negative definition: what this template is explicitly not */
  not_a: string;
}

/**
 * Inventory entry: a documented template with metadata and current instances.
 */
export interface ZoneTemplateInventoryEntry extends ZoneTemplateDeclaration {
  /** Human-readable name of the template */
  name: string;

  /** One-paragraph description */
  description: string;

  /** Current Narada zones that instantiate this template */
  current_instances: string[];

  /**
   * How well the template fits its current instances:
   * - strong: all instances share the invariant authority grammar cleanly
   * - moderate: instances fit but with noted ambiguity
   * - single_instance_pattern: only one current instance, but the pattern
   *   is clear enough to serve as a reusable template for future zones
   */
  fit_strength: 'strong' | 'moderate' | 'single_instance_pattern';

  /** Optional note about ambiguity or disputed fit */
  ambiguous?: string;
}

// ---------------------------------------------------------------------------
// Canonical Inventory
// ---------------------------------------------------------------------------

export const ZONE_TEMPLATE_INVENTORY: ZoneTemplateInventoryEntry[] = [
  {
    template: 'ingress',
    name: 'Ingress',
    description:
      'A zone where external reality enters Narada\'s governed topology. ' +
      'Ingress zones are the boundary between the ungoverned world and ' +
      'Narada\'s authority-homogeneous regions.',
    invariant_authority_grammar:
      'Receives data from outside the governed topology. ' +
      'Produces the first internal representation. ' +
      'Does not govern, decide, or execute effects. ' +
      'Authority varies by ingress type (derive for automated, admin for human).',
    typical_artifacts: [
      'Remote records',
      'Checkpoints',
      'Cursors',
      'operator_action_request',
    ],
    not_a:
      'Governance zone, computation zone, or effect zone. ' +
      'Ingress is admission only; any transformation happens downstream.',
    current_instances: ['Source', 'Operator'],
    fit_strength: 'strong',
  },

  {
    template: 'canonicalization',
    name: 'Canonicalization',
    description:
      'A zone where external data becomes a canonical, content-addressed, ' +
      'durable artifact. This is the first durable boundary after ingress.',
    invariant_authority_grammar:
      'derive authority only. Computes declared outputs from declared inputs. ' +
      'No side effects, no lifecycle state changes. ' +
      'Content-addressed and idempotent by design. ' +
      'Safe to re-run.',
    typical_artifacts: ['fact_id', 'event_id', 'NormalizedPayload'],
    not_a:
      'Governance zone or effect zone. Canonicalization does not decide ' +
      'what proceeds; it only makes data durable and deterministic.',
    current_instances: ['Fact'],
    fit_strength: 'single_instance_pattern',
    ambiguous:
      'Only one current instance (Fact), but the pattern is clear: every ' +
      'vertical needs a first durable boundary where external data becomes ' +
      'canonical. Future verticals may instantiate this template.',
  },

  {
    template: 'compilation',
    name: 'Compilation',
    description:
      'A zone where computation transforms upstream artifacts into downstream ' +
      'artifacts without changing authority owner. Compilation zones are ' +
      'pure computation within the topology.',
    invariant_authority_grammar:
      'derive or propose authority. Requires upstream artifacts as input. ' +
      'Produces downstream artifacts as output. ' +
      'No direct authority change at the zone boundary. ' +
      'Safe to re-run (derive) or produces structured proposals (propose).',
    typical_artifacts: [
      'context_id',
      'revision_id',
      'PolicyContext',
      'evaluation_id',
      'CharterOutputEnvelope',
    ],
    not_a:
      'Governance zone. Compilation may feed governance but does not ' +
      'itself decide what proceeds.',
    current_instances: ['Context', 'Evaluation'],
    fit_strength: 'moderate',
    ambiguous:
      'Context (grouping/metadata) and Evaluation (intelligence/proposal) ' +
      'share "computation" but differ in nature. Context is organization; ' +
      'Evaluation is analysis that produces governance input. Evaluation ' +
      'is governance-adjacent, which makes the template boundary fuzzy.',
  },

  {
    template: 'governance',
    name: 'Governance',
    description:
      'A zone where authority decides whether artifacts may proceed, advances ' +
      'or blocks lifecycle state, and creates durable governance records.',
    invariant_authority_grammar:
      'resolve or claim authority. Decides what proceeds and what does not. ' +
      'Advances or blocks lifecycle state. ' +
      'Not safe to re-run without concurrency control (claim) or ' +
      'explicit governance rules (resolve).',
    typical_artifacts: [
      'work_item_id',
      'work_item status',
      'decision_id',
      'foreman_decision',
      'TaskAssignment',
      'TaskContinuation',
    ],
    not_a:
      'Computation zone or direct effect zone. Governance decides; ' +
      'it does not compute proposals or perform external mutations.',
    current_instances: ['Work', 'Decision', 'Task'],
    fit_strength: 'strong',
    ambiguous:
      'Work includes scheduling mechanics (leases) that are mechanical ' +
      'rather than purely governance. Task includes human review, which ' +
      'introduces a different authority grammar than automated governance. ' +
      'Both are still governance at the core: they decide what proceeds.',
  },

  {
    template: 'effect_boundary',
    name: 'Effect Boundary',
    description:
      'A zone that bridges governance and execution by creating a durable, ' +
      'universal representation of an intended effect before it is performed.',
    invariant_authority_grammar:
      'resolve → execute handoff. Governance produces the effect representation; ' +
      'execution claims it. Atomic creation under governance transaction. ' +
      'Idempotency key ensures safe re-execution.',
    typical_artifacts: ['intent_id', 'outbound_handoff', 'idempotency_key'],
    not_a:
      'Governance zone (it is the output of governance) or performance zone ' +
      '(it is the input to performance). It is the durable bridge between them.',
    current_instances: ['Intent'],
    fit_strength: 'single_instance_pattern',
    ambiguous:
      'Only one current instance, but the pattern is universal: every effect ' +
      'family (mail, process, future automations) passes through this boundary.',
  },

  {
    template: 'performance',
    name: 'Performance',
    description:
      'A zone where prepared effects are performed against external systems. ' +
      'Performance zones mutate world state and record the attempt.',
    invariant_authority_grammar:
      'execute authority only. Performs effects that mutate external state. ' +
      'Records attempt artifacts for observability and retry. ' +
      'Idempotent where possible; generally requires crash/retry handling.',
    typical_artifacts: [
      'execution_id',
      'execution_attempt',
      'outbound_command',
      'tool_call_record',
    ],
    not_a:
      'Governance zone or verification zone. Performance does the work; ' +
      'it does not decide whether to do it or verify that it succeeded.',
    current_instances: ['Execution'],
    fit_strength: 'single_instance_pattern',
    ambiguous:
      'Only one current instance, but the pattern is clear for future ' +
      'executor families. Each family would have its own performance zone.',
  },

  {
    template: 'verification',
    name: 'Verification',
    description:
      'A zone where external observation is bound to durable truth. ' +
      'Verification zones reconcile what happened in the external world ' +
      'with what Narada believes happened.',
    invariant_authority_grammar:
      'confirm authority only. Binds external observation to durable state. ' +
      'Idempotent by design. Requires inbound observation or reconciliation. ' +
      'API success alone is insufficient confirmation.',
    typical_artifacts: ['Confirmation status', 'apply_log', 'reconciliation record'],
    not_a:
      'Performance zone. Verification does not perform effects; it confirms ' +
      'that effects took hold. It is also not governance; it does not decide.',
    current_instances: ['Confirmation'],
    fit_strength: 'single_instance_pattern',
    ambiguous:
      'Only one current instance, but the pattern is universal: every ' +
      'effect family needs verification.',
  },

  {
    template: 'observation',
    name: 'Observation',
    description:
      'A read-only zone containing derived views over durable state. ' +
      'Observation zones are non-authoritative and rebuildable.',
    invariant_authority_grammar:
      'No mutating authority. Read-only by construction. ' +
      'Non-authoritative: may be deleted and rebuilt without affecting correctness. ' +
      'No scheduler, lease, executor, or sync path may depend on observation artifacts.',
    typical_artifacts: ['Derived views', 'projections', 'traces', 'search indexes'],
    not_a:
      'Any zone with mutating authority. Observation is strictly view-only.',
    current_instances: ['Observation'],
    fit_strength: 'single_instance_pattern',
    ambiguous:
      'Only one current instance, but the pattern is clear: any durable ' +
      'state may have read-only projections.',
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up the template inventory entry for a given zone name.
 * Returns undefined if the zone is not mapped to any template.
 */
export function getZoneTemplateForZone(
  zoneName: string,
): ZoneTemplateInventoryEntry | undefined {
  return ZONE_TEMPLATE_INVENTORY.find((entry) =>
    entry.current_instances.includes(zoneName),
  );
}

/**
 * List all zones that instantiate a given template.
 */
export function getZonesForTemplate(
  template: ZoneTemplate,
): string[] {
  const entry = ZONE_TEMPLATE_INVENTORY.find((e) => e.template === template);
  return entry?.current_instances ?? [];
}

/**
 * List all templates with a given fit strength.
 */
export function getTemplatesByFitStrength(
  strength: ZoneTemplateInventoryEntry['fit_strength'],
): ZoneTemplateInventoryEntry[] {
  return ZONE_TEMPLATE_INVENTORY.filter((e) => e.fit_strength === strength);
}
