/**
 * Exchange-to-Fact compiler
 *
 * Re-exported from the generic record-to-fact mapper.
 * Exchange-specific semantics are resolved inside the generic mapper
 * by inspecting the NormalizedEvent payload shape.
 */

export { sourceRecordToFact } from "../../facts/record-to-fact.js";
