import { spawn } from 'node-pty';
import express from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Start Flutter dev server in a PTY with HTTP bridge
 *
 * This captures flutter run output (build status, device connection, hot reload)
 * Note: Runtime app logs come via WebSocket through AgentDebugBridge
 */
export function startFlutterPty(port: number, cwd?: string) {
    const app = express();

    // IMPORTANT: Use the passed cwd, which comes from the PTY spawn in dev.ts
    // process.cwd() is NOT reliable when spawned via shell
    const workingDir = cwd || process.cwd();
    const pubspecPath = path.join(workingDir, 'pubspec.yaml');

    console.log(`Flutter PTY starting...`);
    console.log(`Working directory (from cwd param): ${workingDir}`);
    console.log(`process.cwd() (unreliable when spawned via shell): ${process.cwd()}`);
    console.log(`Looking for pubspec.yaml at: ${pubspecPath}`);

    if (!fs.existsSync(pubspecPath)) {
        console.error('\n❌ Error: pubspec.yaml not found');
        console.error(`Expected location: ${pubspecPath}`);
        console.error('\nThis usually means the working directory is incorrect.');
        console.error('Make sure the "path" in agenteract.config.js points to your Flutter project.');
        process.exit(1);
    }

    console.log('✓ Found pubspec.yaml');

    // Use flutter command directly
    // Flutter should be in PATH
    const command = 'flutter';
    const commandArgs = ['run'];

    console.log(`Starting Flutter dev server...`);
    console.log(`Command: ${command} ${commandArgs.join(' ')}`);
    console.log(`Working directory: ${workingDir}`);

    // Start flutter run inside a pseudo-terminal with explicit cwd
    const shell = spawn(command, commandArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: workingDir,  // This ensures flutter runs in the correct directory
        env: process.env,
    });

    const logBuffer: string[] = [];
    const MAX_LINES = 2000;
    let hasCommandNotFoundError = false;

    function addLine(line: string) {
        logBuffer.push(line);
        if (logBuffer.length > MAX_LINES) logBuffer.shift();

        // Detect "command not found" errors in output
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('command not found') ||
            lowerLine.includes('not found') ||
            lowerLine.includes('no such file')) {
            hasCommandNotFoundError = true;
        }
    }

    shell.onData((data) => {
        process.stdout.write(data);
        data.split(/\r?\n/).forEach((l) => l && addLine(l));
    });

    shell.onExit((e: { exitCode: number; signal?: number }) => {
        if (e.exitCode !== 0) {
            // Write error info to stderr (will be captured by parent PTY)
            const errorHeader = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[ERROR] Flutter dev server failed\nExit code: ${e.exitCode}\nCommand: ${command} ${commandArgs.join(' ')}\nWorking directory: ${workingDir}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

            process.stderr.write(errorHeader + '\n');

            // Exit code 1 with no output usually means command not found for node-pty
            const likelyNotFound = (e.exitCode === 1 && logBuffer.length === 0) ||
                                   hasCommandNotFoundError ||
                                   e.exitCode === 127 ||
                                   e.exitCode === 254;

            if (likelyNotFound) {
                const helpText = '\n❌ The "flutter" command was not found\n\n📋 To fix this:\n   1. Check if Flutter is installed:\n      $ flutter --version\n\n   2. If not installed:\n      https://docs.flutter.dev/get-started/install\n\n   3. If installed but not in PATH:\n      - Add Flutter bin directory to your shell profile\n      - Restart your terminal\n';
                process.stderr.write(helpText);
            } else {
                const helpText = '\n💡 Check the output above for error details\n';
                process.stderr.write(helpText);
            }
        }
        process.exit(e.exitCode);
    });

    // Forward stdin to the PTY (for keyboard input from multiplexer)
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    process.stdin.on('data', (data: Buffer) => {
        shell.write(data.toString('utf8'));
    });

    // HTTP API for agent integration
    app.get('/logs', (req, res) => {
        const { since = 0 } = req.query;
        const start = Math.max(0, logBuffer.length - Number(since));
        res.json({ lines: logBuffer.slice(start) });
    });

    app.post('/cmd', express.json(), (req, res) => {
        const { cmd } = req.body;
        // Send raw keystrokes to the PTY
        // Common Flutter commands:
        // 'r' - hot reload
        // 'R' - hot restart
        // 'q' - quit
        // 'h' - help
        shell.write(cmd);
        res.sendStatus(204);
    });

    app.listen(port, () => {
        console.log(`Flutter PTY bridge running on :${port}`);
        console.log(`  GET  /logs?since=N  - Get buffered flutter run output`);
        console.log(`  POST /cmd {cmd: "r"} - Send keystrokes (r=reload, R=restart, q=quit)`);
        console.log(`\nNote: Runtime app logs (debugPrint) come via WebSocket, not PTY`);
    });
}
