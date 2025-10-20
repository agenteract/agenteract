import { spawn } from 'node-pty';
import express from 'express';

export function startPty(bin: string, args: string[], port: number, cwd?: string) {
    const app = express();

    // Use npx for better compatibility with tools like expo and vite
    // pnpm dlx has issues with Metro bundler and file resolution
    const command = 'npx';
    const commandArgs = [bin, ...args];
    
    // Start command inside a pseudo-terminal
    const shell = spawn(command, commandArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: cwd || process.cwd(),
        env: process.env,
    });

    const logBuffer: string[] = [];
    const MAX_LINES = 2000;

    function addLine(line: string) {
        logBuffer.push(line);
        if (logBuffer.length > MAX_LINES) logBuffer.shift();
    }

    shell.onData((data) => {
        process.stdout.write(data);
        data.split(/\r?\n/).forEach((l) => l && addLine(l));
    });

    // Forward stdin to the PTY (for keyboard input from multiplexer)
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    process.stdin.on('data', (data: Buffer) => {
        shell.write(data.toString('utf8'));
    });

    app.get('/logs', (req, res) => {
        const { since = 0 } = req.query;
        const start = Math.max(0, logBuffer.length - Number(since));
        res.json({ lines: logBuffer.slice(start) });
    });

    app.post('/cmd', express.json(), (req, res) => {
        const { cmd } = req.body;
        // send raw keystrokes to the PTY
        shell.write(cmd);
        res.sendStatus(204);
    });

    app.listen(port, () => console.log(`PTY bridge running on :${port}`));
}
