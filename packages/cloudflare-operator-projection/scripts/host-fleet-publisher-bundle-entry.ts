import { readHostFleetRuntimeConfig } from '@narada-core/host-fleet-runtime/config';
import { createHostFleetPublisher } from '@narada-core/host-fleet-runtime/publisher';

const configPath = process.argv[2];
if (!configPath) throw new Error('host_fleet_publisher_config_required');

const config = await readHostFleetRuntimeConfig(configPath);
const publisher = createHostFleetPublisher({ config });
await publisher.publish();
process.stdout.write(JSON.stringify({ status: 'published', host_id: config.host_id }) + '\n');
