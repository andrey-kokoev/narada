export function valueAfterFlag(args: any = [], flag: any, { trim = false }: any = {}) {
  const index: any = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return null;
  const value: any = args[index + 1];
  if (!value) return null;
  const normalized: any = String(value);
  if (!normalized || normalized.startsWith('--')) return null;
  return trim ? normalized.trim() || null : normalized;
}

export function parseEndpointOptions(
  args: any = [],
  env: any = process.env,
  { disableFlag, hostFlag, portFlag, enabledEnv, hostEnv, portEnv, resultKey }: any,
) {
  const forwardedArgs: any = [];
  let enabled: any = env[enabledEnv] !== '0';
  let host: any = env[hostEnv] || '127.0.0.1';
  let port: any = Number.parseInt(env[portEnv] || '0', 10);
  for (let index = 0; index < args.length; index += 1) {
    const arg: any = args[index];
    if (arg === disableFlag) {
      enabled = false;
      continue;
    }
    if (arg === hostFlag) {
      const value: any = args[index + 1];
      if (value && !String(value).startsWith('--')) {
        host = String(value);
        index += 1;
      }
      continue;
    }
    if (arg === portFlag) {
      const value: any = args[index + 1];
      if (value && !String(value).startsWith('--')) {
        port = Number.parseInt(String(value), 10);
        index += 1;
      }
      continue;
    }
    forwardedArgs.push(arg);
  }
  return {
    forwardedArgs,
    [resultKey]: {
      enabled,
      host,
      port: Number.isFinite(port) && port >= 0 ? port : 0,
    },
  };
}
