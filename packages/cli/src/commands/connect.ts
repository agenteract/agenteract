import { loadRuntimeConfig } from '@agenteract/core/node';
import qrcode from 'qrcode-terminal';
import { spawn, execFile } from 'child_process';
import { networkInterfaces } from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface Device {
  id: string;
  name: string;
  type: 'ios-simulator' | 'android-emulator';
  state?: string;
}

function getIpAddress(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      // Handle both string 'IPv4' (Node < 18) and number 4 (Node 18+)
      const family = net.family as string | number;
      if ((family === 'IPv4' || family === 4) && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

async function checkCommandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [command]);
    return true;
  } catch {
    return false;
  }
}

async function getIOSSimulators(): Promise<Device[]> {
  if (process.platform !== 'darwin') {
    return [];
  }

  const hasXcrun = await checkCommandExists('xcrun');
  if (!hasXcrun) {
    return [];
  }

  try {
    const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
    const data = JSON.parse(stdout);
    const devices: Device[] = [];

    for (const runtime of Object.keys(data.devices)) {
      for (const device of data.devices[runtime]) {
        if (device.state === 'Booted') {
          devices.push({
            id: device.udid,
            name: `${device.name} (${runtime.replace('com.apple.CoreSimulator.SimRuntime.', '').replace(/-/g, ' ')})`,
            type: 'ios-simulator',
            state: device.state
          });
        }
      }
    }

    return devices;
  } catch (error) {
    console.error('⚠️  Warning: Failed to list iOS simulators:', (error as Error).message);
    return [];
  }
}

async function getAndroidEmulators(): Promise<Device[]> {
  const hasAdb = await checkCommandExists('adb');
  if (!hasAdb) {
    return [];
  }

  try {
    const { stdout } = await execFileAsync('adb', ['devices']);
    const lines = stdout.split('\n').slice(1); // Skip header
    const devices: Device[] = [];

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+device$/);
      if (match) {
        const id = match[1];
        // Get device name
        try {
          const { stdout: nameStdout } = await execFileAsync('adb', ['-s', id, 'shell', 'getprop', 'ro.product.model']);
          const name = nameStdout.trim() || id;
          devices.push({
            id,
            name: `${name} (Android)`,
            type: 'android-emulator'
          });
        } catch {
          devices.push({
            id,
            name: `${id} (Android)`,
            type: 'android-emulator'
          });
        }
      }
    }

    return devices;
  } catch (error) {
    console.error('⚠️  Warning: Failed to list Android emulators:', (error as Error).message);
    return [];
  }
}

async function openUrlOnDevice(device: Device, url: string): Promise<void> {
  if (device.type === 'ios-simulator') {
    try {
      await execFileAsync('xcrun', ['simctl', 'openurl', device.id, url]);
      console.log(`✅ Opened URL on ${device.name}`);
    } catch (error) {
      console.error(`❌ Failed to open URL on ${device.name}:`, (error as Error).message);
      throw error;
    }
  } else if (device.type === 'android-emulator') {
    try {
      await execFileAsync('adb', ['-s', device.id, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url]);
      console.log(`✅ Opened URL on ${device.name}`);
    } catch (error) {
      console.error(`❌ Failed to open URL on ${device.name}:`, (error as Error).message);
      throw error;
    }
  }
}

export async function runConnectCommand(args: {
  scheme: string;
  device?: string;
  all?: boolean;
  qrOnly?: boolean;
}) {
  const config = await loadRuntimeConfig();

  if (!config) {
    console.error('❌ Error: Agenteract dev server is not running.');
    console.error('Please run `npx @agenteract/cli dev` in another terminal first.');
    process.exit(1);
  }

  const ip = getIpAddress();
  // Use IP for the QR code so physical devices can connect
  const host = ip === 'localhost' ? 'YOUR_MACHINE_IP' : ip;

  const url = `${args.scheme}://agenteract/config?host=${host}&port=${config.port}&token=${config.token}`;

  console.log('\n🔗 Deep Link URL:\n');
  console.log(url);
  console.log('\n📱 Scan this QR code with your device camera:\n');

  qrcode.generate(url, { small: true });

  if (args.qrOnly) {
    console.log('\n✨ QR code generated. Scan with your device to connect.\n');
    return;
  }

  // Detect available devices
  console.log('\n🔍 Detecting available devices...\n');
  const [iosDevices, androidDevices] = await Promise.all([
    getIOSSimulators(),
    getAndroidEmulators()
  ]);

  const allDevices = [...iosDevices, ...androidDevices];

  if (allDevices.length === 0) {
    console.log('⚠️  No running simulators/emulators detected.');
    console.log('💡 Tip: Start a simulator/emulator or use the QR code above to connect a physical device.\n');
    return;
  }

  console.log(`Found ${allDevices.length} device(s):\n`);
  allDevices.forEach((device) => {
    console.log(`  • ${device.name}`);
    console.log(`    ID: ${device.id}\n`);
  });

  // Handle different modes
  if (args.all) {
    // Send to all devices
    console.log('📤 Sending to all devices...\n');
    const results = await Promise.allSettled(
      allDevices.map(device => openUrlOnDevice(device, url))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`\n✅ Successfully sent to ${succeeded} device(s)`);
    if (failed > 0) {
      console.log(`❌ Failed to send to ${failed} device(s)`);
    }
  } else if (args.device) {
    // Send to specific device by ID
    const device = allDevices.find(d => d.id === args.device);

    if (!device) {
      console.error(`❌ Error: Device with ID "${args.device}" not found.`);
      console.error(`\nAvailable devices:`);
      allDevices.forEach((d) => {
        console.error(`  • ${d.name} (${d.id})`);
      });
      process.exit(1);
    }

    console.log(`📤 Sending to ${device.name}...\n`);
    await openUrlOnDevice(device, url);
  } else {
    // Interactive mode - prompt user
    console.log('Select a device to send the deep link:');
    allDevices.forEach((device, i) => {
      console.log(`  [${i + 1}] ${device.name}`);
      console.log(`      ID: ${device.id}`);
    });
    console.log(`  [${allDevices.length + 1}] Send to all devices`);
    console.log('  [0] Cancel\n');

    // Read user input
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question('Enter your choice (number or device ID): ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });

    const trimmedAnswer = answer.trim();

    // Check if it's a device ID first
    const deviceById = allDevices.find(d => d.id === trimmedAnswer);
    if (deviceById) {
      console.log(`\n📤 Sending to ${deviceById.name}...\n`);
      await openUrlOnDevice(deviceById, url);
      console.log();
      return;
    }

    // Otherwise, treat as a number choice
    const choice = parseInt(trimmedAnswer);

    if (choice === 0 || isNaN(choice)) {
      console.log('\n❌ Cancelled.\n');
      return;
    }

    if (choice === allDevices.length + 1) {
      // Send to all
      console.log('\n📤 Sending to all devices...\n');
      const results = await Promise.allSettled(
        allDevices.map(device => openUrlOnDevice(device, url))
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`\n✅ Successfully sent to ${succeeded} device(s)`);
      if (failed > 0) {
        console.log(`❌ Failed to send to ${failed} device(s)`);
      }
    } else if (choice >= 1 && choice <= allDevices.length) {
      const device = allDevices[choice - 1];
      console.log(`\n📤 Sending to ${device.name}...\n`);
      await openUrlOnDevice(device, url);
    } else {
      console.error(`\n❌ Error: Invalid choice. Please enter a number between 0 and ${allDevices.length + 1}, or a device ID.\n`);
      process.exit(1);
    }
  }

  console.log();
}
