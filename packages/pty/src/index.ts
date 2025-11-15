import { spawn } from 'node-pty';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface PtyValidation {
    fileExists?: string[];      // Files that must exist in the working directory
    commandInPath?: string;     // Command that must be available in PATH
    errorHints?: Record<string, string>;  // Custom error messages for common issues
}

export interface PtyOptions {
    command: string;            // Full command string (e.g., 'npm run dev', 'flutter run')
    port: number;               // HTTP bridge port
    cwd?: string;               // Working directory
    env?: Record<string, string>;  // Additional environment variables
    validation?: PtyValidation; // Pre-flight validation checks
}

/**
 * Validate environment before starting PTY
 * Throws descriptive errors if validation fails
 */
function validateEnvironment(validation: PtyValidation | undefined, workingDir: string): void {
    if (!validation) return;

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
        } catch (error) {
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
 * Handles quoted arguments properly (single quotes, double quotes, escaped characters)
 */
function parseCommand(commandStr: string): { bin: string; args: string[] } {
    const trimmed = commandStr.trim();
    if (!trimmed) {
        throw new Error('Command string cannot be empty');
    }

    const parts: string[] = [];
    let current = '';
    let inSingleQuotes = false;
    let inDoubleQuotes = false;
    let i = 0;

    while (i < trimmed.length) {
        const char = trimmed[i];
        const nextChar = i + 1 < trimmed.length ? trimmed[i + 1] : null;

        if (char === '\\' && nextChar !== null) {
            // Escaped character - add the next character literally
            current += nextChar;
            i += 2;
            continue;
        }

        if (char === "'" && !inDoubleQuotes) {
            // Toggle single quotes
            inSingleQuotes = !inSingleQuotes;
            i++;
            continue;
        }

        if (char === '"' && !inSingleQuotes) {
            // Toggle double quotes
            inDoubleQuotes = !inDoubleQuotes;
            i++;
            continue;
        }

        if (char === ' ' && !inSingleQuotes && !inDoubleQuotes) {
            // Space outside quotes - end of argument
            if (current) {
                parts.push(current);
                current = '';
            }
            i++;
            continue;
        }

        // Regular character
        current += char;
        i++;
    }

    // Add the last part
    if (current || parts.length === 0) {
        parts.push(current);
    }

    if (inSingleQuotes || inDoubleQuotes) {
        throw new Error('Unclosed quote in command string: ' + commandStr);
    }

    if (parts.length === 0) {
        throw new Error('Command string resulted in no parts');
    }

    // Add Windows specific prefix for command execution, prevents issues with binary lacking extension
    if (process.platform === 'win32') {
        parts.unshift('/C');
        parts.unshift('cmd.exe');
    }

    return {
        bin: parts[0],
        args: parts.slice(1)
    };
}

/**
 * Start a generic PTY with HTTP bridge for logs and commands
 * Supports validation, custom environments, and enhanced error handling
 */
export function startPty(options: PtyOptions): void {
    const workingDir = options.cwd || process.cwd();
    const mergedEnv = { ...process.env, ...options.env };

    console.log(`Starting PTY...`);
    console.log(`Working directory: ${workingDir}`);
    console.log(`Command: ${options.command}`);

    // Pre-flight validation
    validateEnvironment(options.validation, workingDir);
    
    let { bin, args } = parseCommand(options.command);
    if (process.platform === 'win32') args = args.map(arg => arg.replace(/\^/g, ''));
    console.log(`Parsed: 123 ${bin} ${args.join(' ')}`);
    if (process.platform === 'win32') { 
        // expand all args that are wrapped in quotes
        let args2: string[] = [];
        args.forEach(arg => {
            if (arg.startsWith('"') && arg.endsWith('"')) {
                args2.push(...arg.substring(1, arg.length - 1).split(' '));
            } else if (arg.includes(' ')) {
                args2.push(...arg.split(' '));
            } else {
                args2.push(arg);
            }
        });
        args = args2;
    }

    const app = express();

    // Start command inside a pseudo-terminal
    const shell = spawn(bin, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        // setting cwd on windows causes path to duplicate, possible but in node-pty / windowsTerminal
        cwd: process.platform === 'win32' ? undefined : process.cwd(),
        env: mergedEnv,
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
            } else {
                process.stderr.write('\n💡 Check the output above for error details\n');
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
export function startPtyLegacy(bin: string, args: string[], port: number, cwd?: string): void {
    console.warn('⚠️  startPtyLegacy is deprecated. Use startPty(options) instead.');

    startPty({
        command: `npx ${bin} ${args.join(' ')}`,
        port,
        cwd
    });
}
