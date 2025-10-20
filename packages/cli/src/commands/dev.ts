// packages/cli/src/commands/dev.ts
import { loadConfig } from '../config.js';
import path from 'path';
import pty, { IPty } from 'node-pty';

const typeToCommandMap: { [key: string]: string } = {
  expo: 'agenterexpo',
  vite: 'agentervite',
};

export async function runDevCommand(args: { config: string }) {
  const rootDir = path.dirname(path.resolve(args.config));
  const config = await loadConfig(rootDir);

  if (!config || !config.projects) {
    console.error('Invalid config: projects array not found.');
    return;
  }

  const commands = [
    {
      command: `pnpm agenterserve --port ${config.port}`,
      name: 'agent-server',
      cwd: rootDir,
    },
    ...config.projects.map((project: any) => ({
      command: `pnpm ${typeToCommandMap[project.type]} --port ${project.ptyPort}`,
      name: project.name,
      cwd: path.resolve(rootDir, project.path),
    })),
  ];

  const terminals: { 
    name: string; 
    ptyProcess: IPty;
    buffer: string[];
  }[] = [];
  let activeIndex = 0;
  const MAX_BUFFER_LINES = 1000;

  // --- Create all PTYs ---
  commands.forEach((cmdInfo, index) => {
    // Use shell to execute the command properly
    const shell = process.env.SHELL || '/bin/bash';
    const ptyProcess = pty.spawn(shell, ['-c', cmdInfo.command], {
      name: 'xterm-color',
      cols: process.stdout.columns,
      rows: process.stdout.rows,
      cwd: cmdInfo.cwd,
      env: process.env as { [key: string]: string },
    });
    
    const buffer: string[] = [];
    
    // Set up a listener for each terminal that:
    // 1. Buffers output for later replay
    // 2. Writes to stdout if this is the active terminal
    ptyProcess.onData((data: string) => {
      // Add to buffer (keep only last MAX_BUFFER_LINES)
      buffer.push(data);
      if (buffer.length > MAX_BUFFER_LINES) {
        buffer.shift();
      }
      
      // Only write to stdout if this is the active terminal
      if (activeIndex === index) {
        process.stdout.write(data);
      }
    });
    
    terminals.push({ name: cmdInfo.name, ptyProcess, buffer });
  });

  const switchTo = (index: number) => {
    activeIndex = index;
    const activeTerminal = terminals[activeIndex];
    
    // Clear screen
    process.stdout.write('\x1b[2J\x1b[H'); // Clear screen and move cursor to home
    process.stdout.write(`\x1b[1m--- ${activeTerminal.name} ---\x1b[0m (Tab: cycle, Ctrl+C: exit)\r\n\n`);
    
    // Trigger a redraw by doing a fake resize (resize to same size)
    // This causes many programs to redraw their screen
    const { cols, rows } = { cols: process.stdout.columns, rows: process.stdout.rows };
    activeTerminal.ptyProcess.resize(cols, rows);
    
    // Also replay buffered output as fallback
    const linesToShow = Math.min(rows - 3, activeTerminal.buffer.length);
    const startIdx = Math.max(0, activeTerminal.buffer.length - linesToShow);
    for (let i = startIdx; i < activeTerminal.buffer.length; i++) {
      process.stdout.write(activeTerminal.buffer[i]);
    }
  };

  // --- Initial Start ---
  process.stdout.write('--- Starting Agenteract Dev Environment ---\r\n');
  process.stdout.write('Initializing terminals...\r\n\n');
  
  // Small delay to let processes start
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // --- Raw Input Handler ---
  if (process.stdin.isTTY && process.stdout.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
  }
  
  // Use the 'data' event for raw input
  process.stdin.on('data', (data: string | Buffer) => {
    const key = typeof data === 'string' ? data : data.toString('utf8');
    
    if (key === '\t') {
      // Switch to next terminal
      switchTo((activeIndex + 1) % terminals.length);
    } else if (key === '\u0003') { // Ctrl+C
      terminals.forEach(t => t.ptyProcess.kill());
      process.exit(0);
    } else {
      // Write input directly to the active PTY
      terminals[activeIndex].ptyProcess.write(key);
    }
  });

  // Handle terminal resizing
  process.stdout.on('resize', () => {
    terminals.forEach(term => {
      term.ptyProcess.resize(process.stdout.columns, process.stdout.rows);
    });
  });

  switchTo(0);

  // --- Cleanup ---
  const cleanup = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdout.write('\n--- Shutting down all processes... ---\n');
    terminals.forEach(t => t.ptyProcess.kill());
  };
  
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}