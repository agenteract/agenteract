import { loadRuntimeConfig, loadConfig, findConfigRoot, setDefaultDevice } from '@agenteract/core/node';
import qrcode from 'qrcode-terminal';
import { spawn, execFile } from 'child_process';
import { networkInterfaces } from 'os';
import { promisify } from 'util';
import readline from 'readline';

const execFileAsync = promisify(execFile);

// Helper to prompt user for y/n
async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

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
      await execFileAsync('xcrun', ['simctl', 'openurl', device.id, url]); // don't quote url with simctl
      console.log(`✅ Opened URL on ${device.name}`);
    } catch (error) {
      console.error(`❌ Failed to open URL on ${device.name}:`, (error as Error).message);
      throw error;
    }
  } else if (device.type === 'android-emulator') {
    try {
      await execFileAsync('adb', ['-s', device.id, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `"${url}"`]);
      console.log(`✅ Opened URL on ${device.name}`);
    } catch (error) {
      console.error(`❌ Failed to open URL on ${device.name}:`, (error as Error).message);
      throw error;
    }
  }
}

export async function runConnectCommand(args: {
  scheme?: string;
  device?: string;
  all?: boolean;
  qrOnly?: boolean;
}) {
  const runtimeConfig = await loadRuntimeConfig();

  if (!runtimeConfig) {
    console.error('❌ Error: Agenteract dev server is not running.');
    console.error('Please run `npx @agenteract/cli dev` in another terminal first.');
    process.exit(1);
  }

  // Try to load scheme from config if not provided
  let scheme = args.scheme;
  if (!scheme) {
    const configRoot = await findConfigRoot();
    if (configRoot) {
      try {
        const agenteractConfig = await loadConfig(configRoot);
        // Find first project with a scheme
        const projectWithScheme = agenteractConfig.projects.find(p => p.scheme);
        if (projectWithScheme) {
          scheme = projectWithScheme.scheme;
          console.log(`Using scheme "${scheme}" from project "${projectWithScheme.name}"`);
        }
      } catch (error) {
        // Config might not exist or be invalid, that's okay
      }
    }
  }

  // If still no scheme, show error
  if (!scheme) {
    console.error('❌ Error: No URL scheme provided.');
    console.error('Please provide a scheme either:');
    console.error('  1. Via command line: npx @agenteract/cli connect <scheme>');
    console.error('  2. Via config: npx @agenteract/cli add-config <path> <name> <type> --scheme <scheme>');
    process.exit(1);
  }

  const ip = getIpAddress();
  // Use IP for the QR code so physical devices can connect
  const host = ip === 'localhost' ? 'YOUR_MACHINE_IP' : ip;

  // Expo Go uses a special deep link format: exp://ip:port/--/path
  // For other apps, use the standard scheme://path format
  let url: string;
  if (scheme === 'exp' || scheme === 'exps') {
    // Expo Go format - assumes Expo dev server on 8081
    const expoPort = 8081;
    url = `${scheme}://${host}:${expoPort}/--/agenteract/config?host=${host}&port=${runtimeConfig.port}&token=${runtimeConfig.token}`;
  } else {
    // Standard deep link format
    url = `${scheme}://agenteract/config?host=${host}&port=${runtimeConfig.port}&token=${runtimeConfig.token}`;
  }

  console.log('\n🔗 Deep Link URL:\n');
  console.log(url);
  console.log('\n📱 Scan this QR code with your device camera:\n');

  qrcode.generate(url, { small: true });

  // Track most recently connected device
  let mostRecentDevice: { deviceId: string; info: { deviceName: string; deviceModel: string; osVersion: string; isSimulator: boolean } } | null = null;

  // Poll the dev server for new device connections
  const seenDevices = new Set<string>();
  let pollInterval: NodeJS.Timeout | null = null;

  // Get project name for polling
  const configRoot = await findConfigRoot();
  let projectName: string | undefined;
  if (configRoot) {
    try {
      const agenteractConfig = await loadConfig(configRoot);
      projectName = agenteractConfig.projects[0]?.name;
    } catch (error) {
      // Config might not exist or be invalid
    }
  }

  // Handler for new device connections
  const handleNewDevice = async (device: any, promptImmediately: boolean) => {
    if (!seenDevices.has(device.deviceId) && device.deviceInfo) {
      seenDevices.add(device.deviceId);
      const info = device.deviceInfo;
      const deviceType = info.isSimulator ? 'simulator' : 'device';
      console.log(`\n📱 New ${deviceType} connected: ${info.deviceName} (${info.deviceModel}, ${info.osVersion})`);

      if (promptImmediately) {
        // In QR-only mode, prompt immediately
        const setAsDefault = await promptYesNo('Set as default device for this project? (y/n): ');
        if (setAsDefault && projectName) {
          await setDefaultDevice(projectName, device.deviceId);
          console.log(`✅ Set ${info.deviceName} as default device for project "${projectName}"`);
        }
      } else {
        // In interactive mode, just show hint
        console.log(`💡 Press 'y' to set as default device\n`);
        mostRecentDevice = { deviceId: device.deviceId, info };
      }
    }
  };

  // Start polling for device connections
  if (projectName) {
    // Use httpPort if available, otherwise fall back to 8766
    const httpPort = runtimeConfig.httpPort || 8766;

    const pollForDevices = async (promptImmediately: boolean) => {
      try {
        const url = `http://localhost:${httpPort}/devices?project=${encodeURIComponent(projectName!)}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          for (const device of data.devices) {
            await handleNewDevice(device, promptImmediately);
          }
        }
      } catch (e) {
        // Ignore polling errors (server might be temporarily unavailable)
      }
    };

    // Initial poll
    await pollForDevices(args.qrOnly || false);

    // Set up interval
    pollInterval = setInterval(() => pollForDevices(args.qrOnly || false), 2000);
  }

  // Cleanup polling when process exits
  const cleanup = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  if (args.qrOnly) {
    console.log('\n✨ QR code generated. Scan with your device to connect.');
    console.log('👀 Watching for new device connections...\n');

    // Keep process alive to watch for connections
    await new Promise(() => {}); // Never resolves - wait for Ctrl+C
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

    // Check if user pressed 'y' to set most recent device as default
    if (trimmedAnswer === 'y' || trimmedAnswer === 'Y') {
      if (!mostRecentDevice) {
        console.log('\n⚠️  No new device has connected yet\n');
        cleanup();
        return;
      }
      const device = mostRecentDevice as { deviceId: string; info: { deviceName: string; deviceModel: string; osVersion: string; isSimulator: boolean } };
      const deviceId = device.deviceId;
      const info = device.info;
      const configRoot = await findConfigRoot();
      if (configRoot) {
        const agenteractConfig = await loadConfig(configRoot);
        const projectName = agenteractConfig.projects[0]?.name;
        if (projectName) {
          await setDefaultDevice(projectName, deviceId);
          console.log(`\n✅ Set ${info.deviceName} as default device for project "${projectName}"\n`);
        } else {
          console.log('\n⚠️  No projects found in config to set default device\n');
        }
      }
      cleanup();
      return;
    }

    // Check if it's a device ID first
    const deviceById = allDevices.find(d => d.id === trimmedAnswer);
    if (deviceById) {
      console.log(`\n📤 Sending to ${deviceById.name}...\n`);
      await openUrlOnDevice(deviceById, url);

      // Wait for device connection and offer to set as default
      await waitForConnectionAndPrompt(projectName);
      return;
    }

    // Otherwise, treat as a number choice
    const choice = parseInt(trimmedAnswer);

    if (choice === 0 || isNaN(choice)) {
      console.log('\n❌ Cancelled.\n');
      cleanup();
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

      // Wait for device connections and offer to set as default
      await waitForConnectionAndPrompt(projectName);
    } else if (choice >= 1 && choice <= allDevices.length) {
      const device = allDevices[choice - 1];
      console.log(`\n📤 Sending to ${device.name}...\n`);
      await openUrlOnDevice(device, url);

      // Wait for device connection and offer to set as default
      await waitForConnectionAndPrompt(projectName);
    } else {
      console.error(`\n❌ Error: Invalid choice. Please enter a number between 0 and ${allDevices.length + 1}, or a device ID.\n`);
      cleanup();
      process.exit(1);
    }
  }

  // Helper function to wait for connection and prompt for default device
  async function waitForConnectionAndPrompt(projectName: string | undefined) {
    console.log('👀 Waiting for device to connect...');
    console.log('💡 Press \'y\' when the device connects to set it as default, or Ctrl+C to exit\n');

    // Set up readline for listening to 'y' key
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Enable raw mode to detect single key press
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('data', async (key) => {
      const char = key.toString();

      if (char === 'y' || char === 'Y') {
        if (!mostRecentDevice) {
          console.log('\n⚠️  No new device has connected yet. Waiting...\n');
          return;
        }

        const device = mostRecentDevice as { deviceId: string; info: { deviceName: string; deviceModel: string; osVersion: string; isSimulator: boolean } };
        if (projectName) {
          await setDefaultDevice(projectName, device.deviceId);
          console.log(`\n✅ Set ${device.info.deviceName} as default device for project "${projectName}"\n`);
        }

        cleanup();
        rl.close();
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.exit(0);
      } else if (char === '\u0003') {
        // Ctrl+C
        cleanup();
        rl.close();
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.exit(0);
      }
    });

    // Keep process alive
    await new Promise(() => {});
  }

  // Should not reach here
  cleanup();
}
