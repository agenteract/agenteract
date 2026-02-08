import { listAndroidDevices } from '../../packages/core/src/node/device-manager.js';

async function test() {
  const devices = await listAndroidDevices();
  console.log('Android devices:');
  devices.forEach(d => console.log(`  - ID: ${d.id}, Name: ${d.name}, AVD: ${d.avdName || 'N/A'}`));
}

test().catch(console.error);
