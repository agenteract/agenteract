import { spawn } from 'node-pty';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
/**
 * Validate environment before starting PTY
 * Throws descriptive errors if validation fails
 */
function validateEnvironment(validation, workingDir) {
    if (!validation)
        return;
    console.log(`Performing pre-flight validation...`);
    // Check required files exist
    if (validation.fileExists) {
        for (const file of validation.fileExists) {
            const filePath = path.join(workingDir, file);
            if (!fs.existsSync(filePath)) {
                const hint = validation.errorHints?.['No ' + file] ||
                    `Required file not found: ${file}`;
                console.error(`\n❌ Validation failed: ${file} not found`);
                console.error(`Expected location: ${filePath}`);
                console.error(`\n${hint}\n`);
                process.exit(1);
            }
            console.log(`✓ Found ${file}`);
        }
    }
    // Check required command is in PATH
    if (validation.commandInPath) {
        const cmd = validation.commandInPath;
        try {
            execSync(`command -v ${cmd}`, { stdio: 'pipe' });
            console.log(`✓ Command '${cmd}' found in PATH`);
        }
        catch (error) {
            const hint = validation.errorHints?.['command not found'] ||
                `Command '${cmd}' not found in PATH. Please install it and try again.`;
            console.error(`\n❌ Validation failed: '${cmd}' command not found`);
            console.error(`\n${hint}\n`);
            process.exit(1);
        }
    }
    console.log(`✓ All validation checks passed\n`);
}
/**
 * Parse command string into executable and arguments
 * Handles quoted arguments properly
 */
function parseCommand(commandStr) {
    // Simple split on spaces (doesn't handle quotes yet, but sufficient for most cases)
    // TODO: Add proper shell parsing for quoted arguments
    const parts = commandStr.trim().split(/\s+/);
    return {
        bin: parts[0],
        args: parts.slice(1)
    };
}
/**
 * Start a generic PTY with HTTP bridge for logs and commands
 * Supports validation, custom environments, and enhanced error handling
 */
export function startPty(options) {
    const workingDir = options.cwd || process.cwd();
    const mergedEnv = { ...process.env, ...options.env };
    console.log(`Starting PTY...`);
    console.log(`Working directory: ${workingDir}`);
    console.log(`Command: ${options.command}`);
    // Pre-flight validation
    validateEnvironment(options.validation, workingDir);
    const { bin, args } = parseCommand(options.command);
    console.log(`Parsed: ${bin} ${args.join(' ')}`);
    const app = express();
    // Start command inside a pseudo-terminal
    const shell = spawn(bin, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: workingDir,
        env: mergedEnv,
    });
    const logBuffer = [];
    const MAX_LINES = 2000;
    let hasCommandNotFoundError = false;
    function addLine(line) {
        logBuffer.push(line);
        if (logBuffer.length > MAX_LINES)
            logBuffer.shift();
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
    shell.onExit((e) => {
        if (e.exitCode !== 0) {
            // Write error info to stderr (captured by parent PTY)
            const errorHeader = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[ERROR] PTY process failed\nExit code: ${e.exitCode}\nCommand: ${options.command}\nWorking directory: ${workingDir}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            process.stderr.write(errorHeader + '\n');
            // Exit code 1 with no output, or specific exit codes = command not found
            const likelyNotFound = (e.exitCode === 1 && logBuffer.length === 0) ||
                hasCommandNotFoundError ||
                e.exitCode === 127 ||
                e.exitCode === 254;
            if (likelyNotFound) {
                const hint = options.validation?.errorHints?.['command not found'] ||
                    `Command '${bin}' not found. Check that it's installed and in PATH.`;
                process.stderr.write(`\n❌ ${hint}\n`);
            }
            else {
                process.stderr.write('\n💡 Check the output above for error details\n');
            }
        }
        process.exit(e.exitCode);
    });
    // Forward stdin to the PTY (for keyboard input from multiplexer)
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    process.stdin.on('data', (data) => {
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
        shell.write(cmd);
        res.sendStatus(204);
    });
    app.listen(options.port, () => {
        console.log(`PTY bridge running on :${options.port}`);
        console.log(`  GET  /logs?since=N  - Get buffered output`);
        console.log(`  POST /cmd {cmd: "..."} - Send keystrokes\n`);
    });
}
/**
 * Legacy function signature for backward compatibility
 * @deprecated Use startPty(options) instead
 */
export function startPtyLegacy(bin, args, port, cwd) {
    console.warn('⚠️  startPtyLegacy is deprecated. Use startPty(options) instead.');
    startPty({
        command: `npx ${bin} ${args.join(' ')}`,
        port,
        cwd
    });
}
