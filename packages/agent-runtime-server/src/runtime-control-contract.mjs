export const NARS_RUNTIME_SERVER_METHOD_LIST = Object.freeze([
  'runtime.intelligence.reconfigure',
]);

const methodSet = new Set(NARS_RUNTIME_SERVER_METHOD_LIST);

export function isNarsRuntimeServerMethod(method) {
  return methodSet.has(method);
}

