import { spawn } from 'node-pty';
import express from 'express';
import { detectInvoker } from '@agenteract/core';

export function startPty(bin: string, args: string[], port: number) {
    const app = express();

    const { pkgManager, isNpx, isPnpmDlx } = detectInvoker();

    const command = pkgManager === 'pnpm' ? 'pnpx' : isNpx ? 'npx' : 'npx';
    const commandArgs = isPnpmDlx ? ['pnpm', 'dlx', bin, ...args] : [bin, ...args];
    
    // Start command inside a pseudo-terminal
    const shell = spawn(command, commandArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: process.env,
    });

    const logBuffer: string[] = [];
    const MAX_LINES = 2000;

    function addLine(line: string) {
        logBuffer.push(line);
        if (logBuffer.length > MAX_LINES) logBuffer.shift();
    }

    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);       // immediate key events
        process.stdin.resume();               // start reading
        process.stdin.setEncoding('utf8');

        process.stdin.on('data', (key) => {
            // Optional: handle Ctrl+C manually
            if (key.toString() === '\u0003') {
                console.log('^C');
                shell.kill();                     // stop the PTY
                process.exit();
            }

            shell.write(key.toString());
        });
    }

    shell.onData((data) => {
        process.stdout.write(data);
        data.split(/\r?\n/).forEach((l) => l && addLine(l));
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
