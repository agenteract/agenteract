import { loadRuntimeConfig } from '@agenteract/core/node';
import qrcode from 'qrcode-terminal';
import { spawn } from 'child_process';
import { networkInterfaces } from 'os';

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

export async function runConnectCommand(args: { scheme: string }) {
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

  console.log('\n🔗 Pair your device with this Deep Link:\n');
  console.log(url);
  console.log('\n📱 Scan this QR code with your device camera:\n');
  
  qrcode.generate(url, { small: true });

  // For simulators running on the SAME machine, localhost is fine/better
  // But the deep link logic in the app will likely save what we send.
  // If we send the IP, it works for both.
  
  console.log('\n🤖 Attempting to open on simulators...\n');
  
  // iOS Simulator
  // xcrun simctl openurl booted "scheme://..."
  const xcrun = spawn('xcrun', ['simctl', 'openurl', 'booted', url]);
  xcrun.on('error', () => {}); // Ignore errors if xcrun missing (e.g. Windows/Linux)
  
  // Android Emulator
  // adb shell am start -W -a android.intent.action.VIEW -d "scheme://..."
  const adb = spawn('adb', ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url]);
  adb.on('error', () => {}); // Ignore errors if adb missing
}
