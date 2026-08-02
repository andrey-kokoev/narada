import { posix, win32 } from 'node:path';
import { defaultHostFleetMachinePaths } from './config.js';

export const HOST_FLEET_SERVICE_NAME = 'NaradaHostFleet';

export interface HostFleetServiceCommand {
  command: string;
  args: string[];
}

export interface HostFleetServiceFile {
  path: string;
  content: string;
  mode: number | null;
}

export interface HostFleetServiceBinaryCopy {
  from: string;
  to: string;
}

export interface HostFleetServicePlan {
  schema: 'narada.host_fleet.service_plan.v1';
  platform: 'windows' | 'linux';
  requires_elevation: true;
  config_path: string;
  state_path: string;
  files: HostFleetServiceFile[];
  binary_copies: HostFleetServiceBinaryCopy[];
  install_commands: HostFleetServiceCommand[];
  restart_commands: HostFleetServiceCommand[];
  registration_status_commands: HostFleetServiceCommand[];
  status_commands: HostFleetServiceCommand[];
  uninstall_commands: HostFleetServiceCommand[];
  uninstall_finalize_commands: HostFleetServiceCommand[];
}

export function hostFleetLinuxPathHiddenByProtectHome(value: string): boolean {
  const normalized = posix.resolve(value);
  return normalized === '/root'
    || normalized.startsWith('/root/')
    || normalized === '/home'
    || normalized.startsWith('/home/')
    || normalized === '/run/user'
    || normalized.startsWith('/run/user/');
}

export function planHostFleetService(input: {
  platform?: NodeJS.Platform;
  node_path: string;
  cli_entrypoint: string;
  config_path?: string;
  windows_service_wrapper_path?: string;
}): HostFleetServicePlan {
  const platform = input.platform ?? process.platform;
  if (platform !== 'win32' && platform !== 'linux') throw new Error('host_fleet_service_platform_unsupported');
  const targetPath = platform === 'win32' ? win32 : posix;
  const paths = defaultHostFleetMachinePaths(platform);
  const configPath = targetPath.resolve(input.config_path ?? paths.config_path);
  const nodePath = targetPath.resolve(input.node_path);
  const cliEntrypoint = targetPath.resolve(input.cli_entrypoint);
  const runArgs = [
    '--disable-warning=ExperimentalWarning',
    cliEntrypoint,
    'host-fleet',
    'run',
    '--config',
    configPath,
  ];
  if (platform === 'win32') {
    const serviceRoot = win32.dirname(configPath);
    const wrapperPath = win32.join(serviceRoot, `${HOST_FLEET_SERVICE_NAME}.exe`);
    const wrapperSource = input.windows_service_wrapper_path
      ? win32.resolve(input.windows_service_wrapper_path)
      : wrapperPath;
    const wrapperConfigPath = win32.join(serviceRoot, `${HOST_FLEET_SERVICE_NAME}.xml`);
    const wrapperConfig = [
      '<service>',
      `  <id>${HOST_FLEET_SERVICE_NAME}</id>`,
      '  <name>Narada Host Fleet</name>',
      '  <description>Machine-level Narada Host Fleet authority or publisher</description>',
      `  <executable>${xmlEscape(nodePath)}</executable>`,
      `  <arguments>${runArgs.map(windowsArgument).join(' ')}</arguments>`,
      `  <workingdirectory>${xmlEscape(win32.dirname(cliEntrypoint))}</workingdirectory>`,
      '  <startmode>Automatic</startmode>',
      '  <stoptimeout>15sec</stoptimeout>',
      '  <onfailure action="restart" delay="5 sec" />',
      '  <onfailure action="restart" delay="15 sec" />',
      '  <log mode="roll" />',
      '</service>',
      '',
    ].join('\n');
    return {
      schema: 'narada.host_fleet.service_plan.v1',
      platform: 'windows',
      requires_elevation: true,
      config_path: configPath,
      state_path: paths.state_path,
      files: [{ path: wrapperConfigPath, content: wrapperConfig, mode: null }],
      binary_copies: wrapperSource.toLowerCase() === wrapperPath.toLowerCase() ? [] : [{ from: wrapperSource, to: wrapperPath }],
      install_commands: [
        { command: wrapperPath, args: ['install'] },
        { command: wrapperPath, args: ['start'] },
      ],
      restart_commands: [{ command: wrapperPath, args: ['restart'] }],
      registration_status_commands: [{ command: 'sc.exe', args: ['query', HOST_FLEET_SERVICE_NAME] }],
      status_commands: [{ command: 'sc.exe', args: ['query', HOST_FLEET_SERVICE_NAME] }],
      uninstall_commands: [
        { command: wrapperPath, args: ['stop'] },
        { command: wrapperPath, args: ['uninstall'] },
      ],
      uninstall_finalize_commands: [],
    };
  }
  if (hostFleetLinuxPathHiddenByProtectHome(nodePath) || hostFleetLinuxPathHiddenByProtectHome(cliEntrypoint)) {
    throw new Error('host_fleet_service_executable_hidden_by_protect_home');
  }
  const unitPath = paths.service_definition_path!;
  const unit = [
    '[Unit]',
    'Description=Narada Host Fleet authority or publisher',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${systemdEscape(nodePath)} ${runArgs.map(systemdEscape).join(' ')}`,
    'Restart=on-failure',
    'RestartSec=5',
    'UMask=0077',
    'NoNewPrivileges=true',
    'PrivateTmp=true',
    'ProtectSystem=strict',
    'ProtectHome=true',
    'ReadWritePaths=/var/lib/narada/host-fleet',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
  return {
    schema: 'narada.host_fleet.service_plan.v1',
    platform: 'linux',
    requires_elevation: true,
    config_path: configPath,
    state_path: paths.state_path,
    files: [{ path: unitPath, content: unit, mode: 0o644 }],
    binary_copies: [],
    install_commands: [
      { command: 'systemctl', args: ['daemon-reload'] },
      { command: 'systemctl', args: ['enable', '--now', 'narada-host-fleet.service'] },
    ],
    restart_commands: [{ command: 'systemctl', args: ['restart', 'narada-host-fleet.service'] }],
    registration_status_commands: [{ command: 'systemctl', args: ['cat', '--no-pager', 'narada-host-fleet.service'] }],
    status_commands: [{ command: 'systemctl', args: ['is-active', '--quiet', 'narada-host-fleet.service'] }],
    uninstall_commands: [{ command: 'systemctl', args: ['disable', '--now', 'narada-host-fleet.service'] }],
    uninstall_finalize_commands: [{ command: 'systemctl', args: ['daemon-reload'] }],
  };
}

function windowsArgument(value: string): string {
  return `&quot;${xmlEscape(value)}&quot;`;
}

function systemdEscape(value: string): string {
  if (/[\n\r\0]/.test(value)) throw new Error('host_fleet_service_argument_invalid');
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function xmlEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
