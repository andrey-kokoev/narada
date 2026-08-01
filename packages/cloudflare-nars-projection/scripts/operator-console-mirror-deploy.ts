import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface OperatorConsoleMirrorDeployInput {
  gateway_url?: string;
  gateway_origin_pin?: string;
  gateway_token?: string;
  bridge_token?: string;
  gateway_transport?: string;
  access_required?: string | boolean;
  access_team_domain?: string;
  access_audience?: string;
}

export interface OperatorConsoleMirrorDeployPlan {
  variables: Record<string, string>;
  secret_names: string[];
}

export class OperatorConsoleMirrorDeployError extends Error {
  readonly code = 'operator_console_mirror_deploy_preflight_failed';
  readonly validation_errors: string[];

  constructor(validationErrors: string[]) {
    super('operator_console_mirror_deploy_preflight_failed');
    this.name = 'OperatorConsoleMirrorDeployError';
    this.validation_errors = validationErrors;
  }
}

export function operatorConsoleMirrorDeployInputFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OperatorConsoleMirrorDeployInput {
  return {
    gateway_url: env.OPERATOR_CONSOLE_GATEWAY_URL,
    gateway_origin_pin: env.OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN,
    gateway_token: env.OPERATOR_CONSOLE_GATEWAY_TOKEN,
    bridge_token: env.NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN,
    gateway_transport: env.OPERATOR_CONSOLE_GATEWAY_TRANSPORT ?? 'public-tunnel',
    access_required: env.OPERATOR_CONSOLE_ACCESS_REQUIRED ?? 'true',
    access_team_domain: env.OPERATOR_CONSOLE_ACCESS_TEAM_DOMAIN,
    access_audience: env.OPERATOR_CONSOLE_ACCESS_AUDIENCE,
  };
}

export function buildOperatorConsoleMirrorDeployPlan(
  input: OperatorConsoleMirrorDeployInput,
): OperatorConsoleMirrorDeployPlan {
  const errors: string[] = [];
  const gatewayTransport = input.gateway_transport?.trim() || 'public-tunnel';
  if (gatewayTransport !== 'public-tunnel' && gatewayTransport !== 'vpc-service') {
    errors.push('gateway_transport_invalid');
  }
  const allowHttpGatewayOrigin = gatewayTransport === 'vpc-service';
  const gatewayOrigin = parseOrigin(input.gateway_url, 'gateway_url', errors, allowHttpGatewayOrigin);
  const pinnedOrigin = parseOrigin(input.gateway_origin_pin, 'gateway_origin_pin', errors, allowHttpGatewayOrigin);
  if (gatewayOrigin && pinnedOrigin && gatewayOrigin !== pinnedOrigin) {
    errors.push('gateway_url_and_origin_pin_must_match');
  }
  const accessTeamDomain = parseOrigin(input.access_team_domain, 'access_team_domain', errors, false);
  const accessAudience = input.access_audience?.trim();
  if (!accessAudience) errors.push('access_audience_required');
  if (!isTrue(input.access_required)) errors.push('access_required_must_be_true');
  if (!input.gateway_token?.trim()) errors.push('gateway_token_required');
  if (!input.bridge_token?.trim()) errors.push('bridge_token_required');
  if (input.gateway_token?.trim() && input.bridge_token?.trim() && input.gateway_token.trim() !== input.bridge_token.trim()) {
    errors.push('gateway_token_and_bridge_token_must_match');
  }
  if (errors.length > 0) throw new OperatorConsoleMirrorDeployError(errors);
  return {
    variables: {
      OPERATOR_CONSOLE_GATEWAY_URL: gatewayOrigin as string,
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: pinnedOrigin as string,
      OPERATOR_CONSOLE_GATEWAY_TRANSPORT: gatewayTransport,
      OPERATOR_CONSOLE_ACCESS_REQUIRED: 'true',
      OPERATOR_CONSOLE_ACCESS_TEAM_DOMAIN: accessTeamDomain as string,
      OPERATOR_CONSOLE_ACCESS_AUDIENCE: accessAudience as string,
    },
    secret_names: ['OPERATOR_CONSOLE_GATEWAY_TOKEN'],
  };
}

export async function deployOperatorConsoleMirror(
  input: OperatorConsoleMirrorDeployInput = operatorConsoleMirrorDeployInputFromEnv(),
  options: { cwd?: string; command?: string } = {},
): Promise<OperatorConsoleMirrorDeployPlan> {
  const plan = buildOperatorConsoleMirrorDeployPlan(input);
  const cwd = resolve(options.cwd ?? dirname(fileURLToPath(import.meta.url)), '..');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'narada-operator-console-mirror-'));
  const secretsFile = join(temporaryRoot, 'secrets.json');
  try {
    await writeFile(secretsFile, `${JSON.stringify({ OPERATOR_CONSOLE_GATEWAY_TOKEN: input.gateway_token })}\n`, { encoding: 'utf8', mode: 0o600 });
    const command = options.command ?? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
    const args = ['exec', 'wrangler', 'deploy', '--config', 'wrangler.toml', '--keep-vars'];
    for (const [key, value] of Object.entries(plan.variables)) args.push('--var', `${key}:${value}`);
    args.push('--secrets-file', secretsFile);
    await runChild(command, args, cwd);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  return plan;
}

function parseOrigin(value: string | undefined, field: string, errors: string[], allowHttp: boolean): string | null {
  const raw = value?.trim();
  if (!raw) {
    errors.push(`${field}_required`);
    return null;
  }
  try {
    const parsed = new URL(raw);
    const allowedProtocol = parsed.protocol === 'https:' || (allowHttp && parsed.protocol === 'http:');
    if (!allowedProtocol || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      errors.push(allowHttp ? `${field}_must_be_http_or_https_origin` : `${field}_must_be_https_origin`);
      return null;
    }
    return parsed.origin;
  } catch {
    errors.push(`${field}_must_be_https_origin`);
    return null;
  }
}

function isTrue(value: string | boolean | undefined): boolean {
  return value === true || value === 'true';
}

function runChild(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: 'inherit', windowsHide: true });
    child.once('error', (error) => reject(new Error(`wrangler_deploy_spawn_failed:${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`wrangler_deploy_failed:${signal ?? code ?? 'unknown'}`));
    });
  });
}

const preflightOnly = process.argv.includes('--preflight');
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const plan = buildOperatorConsoleMirrorDeployPlan(operatorConsoleMirrorDeployInputFromEnv());
    if (preflightOnly) {
      console.log(JSON.stringify({ schema: 'narada.operator_console_mirror.deploy_preflight.v1', status: 'ready', variables: plan.variables, secret_names: plan.secret_names }, null, 2));
    } else {
      await deployOperatorConsoleMirror();
      console.log(JSON.stringify({ schema: 'narada.operator_console_mirror.deploy.v1', status: 'deployed', variables: plan.variables, secret_names: plan.secret_names }, null, 2));
    }
  } catch (error) {
    if (error instanceof OperatorConsoleMirrorDeployError) {
      console.error(JSON.stringify({ schema: 'narada.operator_console_mirror.deploy_preflight.v1', status: 'refused', code: error.code, validation_errors: error.validation_errors }, null, 2));
    } else {
      console.error(`operator_console_mirror_deploy_failed:${error instanceof Error ? error.message : 'unknown'}`);
    }
    process.exitCode = 1;
  }
}
