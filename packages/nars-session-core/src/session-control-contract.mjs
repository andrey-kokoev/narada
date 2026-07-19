// The session core owns the controls that may cross into its runtime boundary.
export const NARS_SESSION_CORE_METHOD_LIST = Object.freeze([
  'session.events.subscribe',
  'session.events.read',
  'session.submit',
  'session.command.execute',
  'session.health',
  'session.recovery',
  'session.cancel',
  'session.close',
]);

export const NARS_SESSION_CORE_METHODS = new Set(NARS_SESSION_CORE_METHOD_LIST);

export function isNarsSessionCoreMethod(method) {
  return NARS_SESSION_CORE_METHODS.has(method);
}
