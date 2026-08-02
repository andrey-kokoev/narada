import assert from 'node:assert/strict';
import test from 'node:test';
import { planHostFleetService } from '../src/service-plan.js';

test('Windows service plan is machine-level and uses the canonical CLI runtime command', () => {
  const plan = planHostFleetService({
    platform: 'win32',
    node_path: 'C:\\Program Files\\nodejs\\node.exe',
    cli_entrypoint: 'C:\\Program Files\\Narada\\cli.js',
    windows_service_wrapper_path: 'C:\\Tools\\WinSW.exe',
  });
  assert.equal(plan.platform, 'windows');
  assert.equal(plan.requires_elevation, true);
  assert.match(plan.config_path, /ProgramData/i);
  assert.deepEqual(plan.registration_status_commands[0], { command: 'sc.exe', args: ['query', 'NaradaHostFleet'] });
  assert.deepEqual(plan.status_commands[0], { command: 'sc.exe', args: ['query', 'NaradaHostFleet'] });
  assert.deepEqual(plan.uninstall_finalize_commands, []);
  assert.equal(plan.binary_copies[0]!.from, 'C:\\Tools\\WinSW.exe');
  assert.match(plan.files[0]!.content, /--disable-warning=ExperimentalWarning/);
  assert.match(plan.files[0]!.content, /host-fleet.*run/);
});

test('Linux service plan uses a hardened systemd system service', () => {
  const plan = planHostFleetService({ platform: 'linux', node_path: '/usr/bin/node', cli_entrypoint: '/opt/narada/cli.js' });
  assert.equal(plan.config_path, '/etc/narada/host-fleet/config.json');
  assert.equal(plan.state_path, '/var/lib/narada/host-fleet/state.sqlite');
  assert.equal(plan.files[0]!.path, '/etc/systemd/system/narada-host-fleet.service');
  assert.deepEqual(plan.binary_copies, []);
  assert.match(plan.files[0]!.content, /ProtectSystem=strict/);
  assert.match(plan.files[0]!.content, /UMask=0077/);
  assert.deepEqual(plan.registration_status_commands[0], {
    command: 'systemctl',
    args: ['cat', '--no-pager', 'narada-host-fleet.service'],
  });
  assert.deepEqual(plan.status_commands[0], {
    command: 'systemctl',
    args: ['is-active', '--quiet', 'narada-host-fleet.service'],
  });
  assert.deepEqual(plan.uninstall_finalize_commands, [{ command: 'systemctl', args: ['daemon-reload'] }]);
  assert.match(plan.files[0]!.content, /--disable-warning=ExperimentalWarning/);
  assert.match(plan.files[0]!.content, /host-fleet" "run/);
});

test('Linux service plan refuses executables hidden by ProtectHome', () => {
  assert.throws(
    () => planHostFleetService({ platform: 'linux', node_path: '/home/operator/.local/bin/node', cli_entrypoint: '/opt/narada/cli.js' }),
    /host_fleet_service_executable_hidden_by_protect_home/,
  );
  assert.throws(
    () => planHostFleetService({ platform: 'linux', node_path: '/usr/bin/node', cli_entrypoint: '/root/narada/cli.js' }),
    /host_fleet_service_executable_hidden_by_protect_home/,
  );
});
