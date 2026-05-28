export const TO_DATA_PACKET_SCHEMA = 'https://narada.dev/schemas/narada-native/to-data-packet/v0';

export const TO_DATA_READ_FAMILIES = Object.freeze([
  'task_packet',
  'work_next_peek',
  'inbox_summary',
  'readiness_snapshot',
  'evidence_ref_summary',
  'bounded_file_excerpt',
]);

export function buildToDataPacketFixture(readFamily, overrides = {}) {
  if (!TO_DATA_READ_FAMILIES.includes(readFamily)) {
    throw new Error(`unsupported_to_data_read_family:${readFamily}`);
  }
  const base = {
    schema: TO_DATA_PACKET_SCHEMA,
    read_family: readFamily,
    carrier_session_id: 'carrier_session_fixture',
    agent_id: 'narada.builder',
    source_surface: sourceSurfaceFor(readFamily),
    capability_ref: {
      kind: 'read_capability',
      ref: `capability:${readFamily}:read`,
      posture: 'projected_not_secret',
    },
    attribution: {
      observed_by: 'narada-native-carrier',
      observed_at: '2026-05-16T00:00:00.000Z',
      authority_locus: 'narada-proper',
      evidence_ref: `fixture:${readFamily}`,
    },
    freshness: {
      posture: 'bounded_snapshot',
      captured_at: '2026-05-16T00:00:00.000Z',
      expires_at: null,
    },
    bounded_summary: boundedSummaryFor(readFamily),
    raw_values_recorded: false,
    authority_mutation_performed: false,
  };
  return deepMerge(base, overrides);
}

export function validateToDataPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return ['packet must be an object'];
  for (const field of [
    'schema',
    'read_family',
    'carrier_session_id',
    'agent_id',
    'source_surface',
    'capability_ref',
    'attribution',
    'freshness',
    'bounded_summary',
  ]) {
    if (!(field in packet)) errors.push(`${field} is required`);
  }
  if (packet.schema !== TO_DATA_PACKET_SCHEMA) errors.push('schema must be to-data packet v0');
  if (!TO_DATA_READ_FAMILIES.includes(packet.read_family)) errors.push(`unsupported read_family: ${packet.read_family}`);
  if (packet.raw_values_recorded !== false) errors.push('raw_values_recorded must be false');
  if (packet.authority_mutation_performed !== false) errors.push('authority_mutation_performed must be false');
  if (!isRecord(packet.capability_ref)) errors.push('capability_ref must be an object');
  if (!isRecord(packet.attribution)) errors.push('attribution must be an object');
  if (!isRecord(packet.freshness)) errors.push('freshness must be an object');
  if (!isRecord(packet.bounded_summary)) errors.push('bounded_summary must be an object');
  if (isRecord(packet.bounded_summary) && packet.bounded_summary.raw_value) errors.push('bounded_summary must not include raw_value');
  return errors;
}

function sourceSurfaceFor(readFamily) {
  switch (readFamily) {
    case 'task_packet':
      return 'narada task read --format json';
    case 'work_next_peek':
      return 'narada task peek-next --format json';
    case 'inbox_summary':
      return 'narada inbox next --format json';
    case 'readiness_snapshot':
      return 'narada-native readiness inspect';
    case 'evidence_ref_summary':
      return 'narada task evidence list --format json';
    case 'bounded_file_excerpt':
      return 'bounded file excerpt adapter';
    default:
      return 'unknown';
  }
}

function boundedSummaryFor(readFamily) {
  return {
    summary_kind: readFamily,
    item_count: 1,
    excerpt: `${readFamily} fixture summary`,
    limit: 1,
    truncated: false,
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function deepMerge(base, override) {
  const output = { ...base };
  for (const [key, value] of Object.entries(override)) {
    output[key] = isRecord(value) && isRecord(output[key])
      ? deepMerge(output[key], value)
      : value;
  }
  return output;
}
