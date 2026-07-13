export function toSessionProtocolFrame(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value;
  if (typeof candidate.method !== 'string' || !candidate.method) return null;
  const params = candidate.params;
  if (params !== undefined && (!params || typeof params !== 'object' || Array.isArray(params))) return null;
  return {
    ...(typeof candidate.id === 'string' ? { id: candidate.id } : {}),
    method: candidate.method,
    ...(params === undefined ? {} : { params }),
  };
}
