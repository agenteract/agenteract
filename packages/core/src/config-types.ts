export interface DevServerConfig {
  command: string;        // e.g., 'npm run dev', 'flutter run', 'pnpm expo start'
  port: number;           // PTY bridge port
  cwd?: string;           // Override working directory (absolute or relative to project path)
  env?: Record<string, string>;  // Additional environment variables
  validation?: {
    fileExists?: string[];      // Pre-flight check: require files like ['pubspec.yaml']
    commandInPath?: string;     // Pre-flight check: require command in PATH like 'flutter'
    errorHints?: Record<string, string>;  // Custom error messages for common issues
  };
  keyCommands?: Record<string, string>;  // Interactive commands, e.g., { reload: 'r', restart: 'R' }
}

export interface ProjectConfig {
  name: string;
  path: string;
  // Deprecated: use devServer instead. Kept for backward compatibility.
  type?: 'expo' | 'vite' | 'flutter' | 'native' | 'auto';
  // Deprecated: use devServer.port instead. Kept for backward compatibility.
  ptyPort?: number;
  // New generic dev server configuration
  devServer?: DevServerConfig;
  // Optional: URL scheme for deep linking (e.g., 'myapp')
  scheme?: string;
}

export interface AgenteractConfig {
  server?: {
    port?: number;
    wsPort?: number;
    logPort?: number;
  };
  port?: number; // Deprecated: legacy server port
  projects: ProjectConfig[];
}
