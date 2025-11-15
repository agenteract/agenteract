// packages/cli/src/commands/dev.ts
import fs from 'node:fs';
import { loadConfig, MissingConfigError, normalizeProjectConfig } from '../config.js';
import { detectInvoker } from '@agenteract/core';
const { pkgManager, isNpx } = detectInvoker();
import path from 'path';
import pty, { IPty } from 'node-pty';

const spawnBin = pkgManager === 'pnpm' ? 'pnpm' : 'npx';

const agentserverVersion = process.env.AGENTERACT_SERVER_VERSION ? `@${process.env.AGENTERACT_SERVER_VERSION}` : '';
const agenterServePackage = pkgManager === 'pnpm' ? 'agenterserve' : '@agenteract/server' + agentserverVersion;

// If we're in the agenteract monorepo, use the local packages
// get nearest package.json
const nearestPackageJson = findNearestPackageJson(process.cwd());
const isAgenteractPackage = nearestPackageJson?.name?.startsWith('@agenteract/') || nearestPackageJson?.name === 'agenteract';

// Generic PTY package name (used for all dev servers now)
const ptyPackageName = isAgenteractPackage ? 'agenterpty' : '@agenteract/pty';

// Legacy type-to-command map - deprecated but kept for backward compatibility
const typeToCommandMap: { [key: string]: string } = {
  expo: isAgenteractPackage ? 'agenterexpo' : '@agenteract/expo',
  vite: isAgenteractPackage ? 'agentervite' : '@agenteract/vite',
  flutter: isAgenteractPackage ? 'agenterflutter' : '@agenteract/flutter-cli',
};

interface Terminal {
  name: string;
  ptyProcess?: IPty; // Optional: not all terminals have a process
  buffer: string[];
  hasExited: boolean;
  exitCode?: number;
  canRestart: boolean;
  restartCommand?: string;
  restartCwd?: string;
}

function findNearestPackageJson(startDir: string): any | null {
  let currentDir = startDir;

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null; // reached root
    }
    currentDir = parentDir;
  }
}

const handleMissingConfig = (_: MissingConfigError) => {
  console.error('agenteract.config.js is missing. Use `npx @agenteract/cli add-config` to create it.');
  return;
}

export async function runDevCommand(args: { config: string }) {
  const rootDir = path.dirname(path.resolve(args.config));
  let config: any;
  try {
    config = await loadConfig(rootDir);
  } catch (error) {
    if (error instanceof MissingConfigError) {
      handleMissingConfig(error);
      return;
    }
    throw error;
  }

  if (!config || !config.projects) {
    console.error('Invalid config: projects array not found.');
    return;
  }

  const commands = [
    {
      command: `${spawnBin} ${agenterServePackage} --port ${config.port}`,
      name: 'agent-server',
      cwd: rootDir,
      type: 'pty',
    },
  ];

  if (config.projects.some((p: any) => p.type === 'native')) {
    commands.push({
      command: `${spawnBin} ${agenterServePackage} --log-only`,
      name: 'log-server',
      cwd: rootDir,
      type: 'pty',
    });
  }

  commands.push(...config.projects.map((project: any) => {
    const normalizedProject = normalizeProjectConfig(project, rootDir);
    const projectPath = path.resolve(rootDir, normalizedProject.path);
    let command = '';

    // If project has a devServer config, use generic PTY
    if (normalizedProject.devServer) {
      const { devServer } = normalizedProject;
      const finalCwd = devServer.cwd ? path.resolve(projectPath, devServer.cwd) : projectPath;

      
      const escapedCommand = process.platform === 'win32' ? 
        devServer.command :
        // Escape double quotes in command string for shell safety
        devServer.command.replace(/"/g, '\\"');
      const escapedCwd = finalCwd.replace(/"/g, '\\"');

      // Build command for generic PTY package
      command = `${spawnBin} ${ptyPackageName} --command "${escapedCommand}" --port ${devServer.port} --cwd "${escapedCwd}"`;

      // Add validation if specified
      if (devServer.validation) {
        const validationJson = JSON.stringify(devServer.validation);
        // Escape single quotes in JSON for shell safety (JSON.stringify uses double quotes,
        // but escaping is defensive in case of edge cases)
        const escapedValidation = validationJson.replace(/'/g, "'\\''");
        command += ` --validate '${escapedValidation}'`;
      }

      // Add environment variables if specified
      if (devServer.env) {
        const envJson = JSON.stringify(devServer.env);
        // Escape single quotes in JSON for shell safety (JSON.stringify uses double quotes,
        // but escaping is defensive in case of edge cases)
        const escapedEnv = envJson.replace(/'/g, "'\\''");
        command += ` --env '${escapedEnv}'`;
      }
    }
    // Legacy: old type-based format (backward compatibility)
    else if (normalizedProject.type && normalizedProject.type !== 'native') {
      const baseCommand = `${spawnBin} ${typeToCommandMap[normalizedProject.type]} --port ${normalizedProject.ptyPort}`;

      // Flutter needs explicit --cwd because process.cwd() isn't reliable when spawned via shell
      if (normalizedProject.type === 'flutter') {
        command = `${baseCommand} --cwd "${projectPath}"`;
      } else {
        command = baseCommand;
      }
    }

    return {
      command,
      name: normalizedProject.name,
      cwd: projectPath,
      type: normalizedProject.type || 'generic'
    };
  }));

  const terminals: Terminal[] = [];
  let activeIndex = 0;
  const MAX_BUFFER_LINES = 1000;

  // --- Create all Terminals (PTY or Buffer-only) ---
  commands.forEach((cmdInfo, index) => {
    const buffer: string[] = [];
    let ptyProcess: IPty | undefined;
    let errorOutput: string[] = []; // Capture error output

    if (cmdInfo.type !== 'native' && cmdInfo.command) {
      console.log(`Spawning command: ${cmdInfo.command}`);
      const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/bash';
      const shellArg = process.platform === 'win32' ? '/C' : '-c';
      ptyProcess = pty.spawn(shell, [shellArg, cmdInfo.command], {
        name: 'xterm-color',
        cols: process.stdout.columns,
        rows: process.stdout.rows,
        cwd: cmdInfo.cwd,
        env: process.env as { [key: string]: string },
      });

      ptyProcess.onExit((e: { exitCode: number; signal?: number }) => {
        const { exitCode } = e;

        // Find this terminal and mark it as exited
        const terminal = terminals.find(t => t.ptyProcess === ptyProcess);
        if (terminal) {
          terminal.hasExited = true;
          terminal.exitCode = exitCode;
          terminal.ptyProcess = undefined; // Clear the process reference
        }

        const statusMsg = exitCode === 0
          ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✓ ${cmdInfo.name} exited successfully (code ${exitCode})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
          : `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✗ ${cmdInfo.name} exited with code ${exitCode}\nCommand: ${cmdInfo.command}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        // Add status to buffer so it persists in the terminal view
        buffer.push(statusMsg);

        // Write to console immediately so it's visible before screen clears
        if (exitCode !== 0) {
          console.error(statusMsg);

          // Show ALL captured error output immediately
          if (errorOutput.length > 0) {
            const allErrors = errorOutput.join('\n');
            console.error('\n📋 Error output from process:\n');
            console.error(allErrors);
            console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // Also add to buffer
            buffer.push(`\nError output:\n${allErrors}\n`);
          }
        } else {
          console.log(statusMsg);
        }

        // Add restart instructions if applicable
        if (terminal && terminal.canRestart) {
          const restartMsg = '\n💡 Press Enter to restart this process\n';
          buffer.push(restartMsg);
          if (activeIndex === index) {
            process.stdout.write(restartMsg);
          }
        }
      });

      ptyProcess.onData((data: string) => {
        // For active terminal, write directly to preserve all ANSI escape codes
        // This ensures spinners, progress bars, and other interactive elements work correctly
        if (activeIndex === index) {
          process.stdout.write(data);
        }

        // For buffering (inactive terminals), we still need to process the data
        const lines = data.split('\n');
        for (const line of lines) {
          if (!line) continue;

          // Capture potential error lines
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('error') ||
            lowerLine.includes('failed') ||
            lowerLine.includes('not found') ||
            lowerLine.includes('command not found')) {
            errorOutput.push(line);
            if (errorOutput.length > 20) errorOutput.shift(); // Keep last 20 error lines
          }

          // Exclusive handling for routed logs from the log-server
          if (cmdInfo.name === 'log-server') {
            const match = line.match(/^\[([^\]]+)\]/);
            const projectName = match ? match[1] : null;
            const targetTerminal = projectName ? terminals.find(t => t.name === projectName) : null;

            if (targetTerminal && projectName) {
              const logMessage = `[${new Date().toLocaleTimeString()}] ${line.substring(projectName.length + 2).trim()}\n`;
              targetTerminal.buffer.push(logMessage);
              if (targetTerminal.buffer.length > MAX_BUFFER_LINES) {
                targetTerminal.buffer.shift();
              }
              if (terminals[activeIndex].name === targetTerminal.name) {
                process.stdout.write(logMessage);
              }
              continue; // Consume the line
            }
          }

          // Exclusive handling for routed logs from the agent-server
          if (cmdInfo.name === 'agent-server' && line.startsWith('AGENT_LOG::')) {
            try {
              const logData = JSON.parse(line.substring(11));
              const targetTerminal = terminals.find(t => t.name === logData.project);
              if (targetTerminal) {
                const logMessage = `[${new Date().toLocaleTimeString()}] ${logData.log}\n`;
                targetTerminal.buffer.push(logMessage);
                if (targetTerminal.buffer.length > MAX_BUFFER_LINES) {
                  targetTerminal.buffer.shift();
                }
                // If the target terminal is active, write to it directly
                if (terminals[activeIndex].name === targetTerminal.name) {
                  process.stdout.write(logMessage);
                }
              }
            } catch (e) {
              // Failed to parse, so we don't log it anywhere to avoid clutter.
              // This line is now considered "consumed".
            }
            // Crucially, skip to the next line after handling the AGENT_LOG
            continue;
          }

          // todo(mribbons): use proper ansi code parsing for background tabs
          // For buffering: skip lines that are likely spinner/progress bar updates
          // These contain ANSI escape codes for cursor movement or carriage returns
          const hasSpinnerCodes = line.includes('\r') ||
            (line.includes('\x1b[') && (line.includes('A') || line.includes('K') || line.includes('J')));

          if (!hasSpinnerCodes) {
            // Only buffer stable lines (not spinner updates)
            buffer.push(line + '\n');
            if (buffer.length > MAX_BUFFER_LINES) {
              buffer.shift();
            }
          }
        }
      });
    } else if (cmdInfo.type === 'native') {
      buffer.push(`--- Logs for ${cmdInfo.name} ---\n\n`);
      buffer.push('Waiting for application to connect and send logs...\n');
    }

    terminals.push({
      name: cmdInfo.name,
      ptyProcess,
      buffer,
      hasExited: false,
      canRestart: cmdInfo.type !== 'native' && !!cmdInfo.command,
      restartCommand: cmdInfo.command,
      restartCwd: cmdInfo.cwd,
    });
  });

  const switchTo = (index: number) => {
    activeIndex = index;
    const activeTerminal = terminals[activeIndex];

    process.stdout.write('\x1b[2J\x1b[H'); // Clear screen and move cursor to home

    // Add status indicator to title
    const statusIndicator = activeTerminal.hasExited
      ? activeTerminal.exitCode === 0 ? ' ✓' : ' ✗'
      : '';
    process.stdout.write(`\x1b[1m--- ${activeTerminal.name}${statusIndicator} ---\x1b[0m (Tab: cycle, Ctrl+C: exit)\r\n\n`);

    // Only resize if it's a live PTY process (not exited)
    if (activeTerminal.ptyProcess && !activeTerminal.hasExited) {
      const { cols, rows } = { cols: process.stdout.columns, rows: process.stdout.rows };
      try {
        activeTerminal.ptyProcess.resize(cols, rows);
      } catch (err) {
        // Process may have exited between the check and resize, ignore
      }
    }

    const linesToShow = Math.min(process.stdout.rows - 3, activeTerminal.buffer.length);
    const startIdx = Math.max(0, activeTerminal.buffer.length - linesToShow);
    for (let i = startIdx; i < activeTerminal.buffer.length; i++) {
      process.stdout.write(activeTerminal.buffer[i]);
    }
  };

  // Function to restart a terminal process
  const restartTerminal = (terminal: Terminal) => {
    if (!terminal.canRestart || !terminal.restartCommand || !terminal.restartCwd) {
      return;
    }

    const restartMsg = `\n🔄 Restarting ${terminal.name}...\n`;
    terminal.buffer.push(restartMsg);
    process.stdout.write(restartMsg);

    terminal.hasExited = false;
    terminal.exitCode = undefined;

    const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/bash';
    const shellArg = process.platform === 'win32' ? '/C' : '-c';
    const newPtyProcess = pty.spawn(shell, [shellArg, terminal.restartCommand], {
      name: 'xterm-color',
      cols: process.stdout.columns,
      rows: process.stdout.rows,
      cwd: terminal.restartCwd,
      env: process.env as { [key: string]: string },
    });

    terminal.ptyProcess = newPtyProcess;

    // Reattach exit handler
    const terminalIndex = terminals.indexOf(terminal);
    const errorOutput: string[] = [];

    newPtyProcess.onExit((e: { exitCode: number }) => {
      const { exitCode } = e;

      terminal.hasExited = true;
      terminal.exitCode = exitCode;
      terminal.ptyProcess = undefined;

      const statusMsg = exitCode === 0
        ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✓ ${terminal.name} exited successfully (code ${exitCode})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
        : `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✗ ${terminal.name} exited with code ${exitCode}\nCommand: ${terminal.restartCommand}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      terminal.buffer.push(statusMsg);

      if (exitCode !== 0) {
        console.error(statusMsg);
        if (errorOutput.length > 0) {
          const allErrors = errorOutput.join('\n');
          console.error('\n📋 Error output from process:\n');
          console.error(allErrors);
          console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          terminal.buffer.push(`\nError output:\n${allErrors}\n`);
        }
      } else {
        console.log(statusMsg);
      }

      if (terminal.canRestart) {
        const restartMsg = '\n💡 Press Enter to restart this process\n';
        terminal.buffer.push(restartMsg);
        if (activeIndex === terminalIndex) {
          process.stdout.write(restartMsg);
        }
      }
    });

    // Reattach data handler
    newPtyProcess.onData((data: string) => {
      if (activeIndex === terminalIndex) {
        process.stdout.write(data);
      }

      const lines = data.split('\n');
      for (const line of lines) {
        if (!line) continue;

        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('error') ||
          lowerLine.includes('failed') ||
          lowerLine.includes('not found') ||
          lowerLine.includes('command not found')) {
          errorOutput.push(line);
          if (errorOutput.length > 20) errorOutput.shift();
        }

        const hasSpinnerCodes = line.includes('\r') ||
          (line.includes('\x1b[') && (line.includes('A') || line.includes('K') || line.includes('J')));

        if (!hasSpinnerCodes) {
          terminal.buffer.push(line + '\n');
          if (terminal.buffer.length > MAX_BUFFER_LINES) {
            terminal.buffer.shift();
          }
        }
      }
    });
  };

  // --- Initial Start ---
  process.stdout.write('--- Starting Agenteract Dev Environment ---\r\n');
  process.stdout.write('Initializing terminals...\r\n\n');

  await new Promise(resolve => setTimeout(resolve, 100));

  // --- Raw Input Handler ---
  if (process.stdin.isTTY && process.stdout.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
  }

  process.stdin.on('data', (key: string) => {
    if (key === '\t') {
      switchTo((activeIndex + 1) % terminals.length);
    } else if (key === '\u0003') { // Ctrl+C
      terminals.forEach(t => t.ptyProcess?.kill());
      process.exit(0);
    } else if (key === '\r' || key === '\n') { // Enter key
      const activeTerminal = terminals[activeIndex];
      // If terminal has exited and can restart, restart it
      if (activeTerminal.hasExited && activeTerminal.canRestart) {
        restartTerminal(activeTerminal);
      } else if (activeTerminal.ptyProcess) {
        // Otherwise pass the Enter key to the PTY
        activeTerminal.ptyProcess.write(key);
      }
    } else {
      // Only write to live PTY processes
      if (terminals[activeIndex].ptyProcess && !terminals[activeIndex].hasExited) {
        terminals[activeIndex].ptyProcess?.write(key);
      }
    }
  });

  process.stdout.on('resize', () => {
    terminals.forEach(term => {
      // Only resize live PTY processes (not exited)
      if (term.ptyProcess && !term.hasExited) {
        try {
          term.ptyProcess.resize(process.stdout.columns, process.stdout.rows);
        } catch (err) {
          // Process may have exited, ignore
        }
      }
    });
  });

  switchTo(0);

  const cleanup = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdout.write('\n--- Shutting down all processes... ---\n');
    terminals.forEach(t => t.ptyProcess?.kill());
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