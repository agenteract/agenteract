# Generic PTY Configuration Guide

Agenteract now supports **any** development server through a generic PTY (pseudo-terminal) configuration. This allows you to use Agenteract with custom dev servers, frameworks not officially supported, or any tool that runs in a terminal.

## Quick Start

Add a `devServer` configuration to your project in `agenteract.config.js`:

```javascript
export default {
  port: 8766,
  projects: [
    {
      name: 'my-next-app',
      path: './apps/web',
      devServer: {
        command: 'npm run dev',
        port: 8793
      }
    }
  ]
};
```

That's it! Agenteract will now:
- Start your dev server in a PTY
- Capture all console output
- Allow interactive commands via the multiplexer
- Route logs to the appropriate terminal

## Configuration Options

### Basic Configuration

```javascript
{
  name: 'project-name',        // Unique identifier
  path: './path/to/project',   // Relative to config file
  devServer: {
    command: 'npm run dev',    // Command to start dev server
    port: 8793                  // PTY bridge port (must be unique)
  }
}
```

### Advanced Configuration

```javascript
{
  name: 'advanced-project',
  path: './apps/advanced',
  devServer: {
    command: 'npm run dev',
    port: 8794,

    // Override working directory (relative to project path)
    cwd: './client',

    // Additional environment variables
    env: {
      NODE_ENV: 'development',
      API_URL: 'http://localhost:3000'
    },

    // Pre-flight validation
    validation: {
      fileExists: ['package.json', '.env'],
      commandInPath: 'node',
      errorHints: {
        'command not found': 'Install Node.js from https://nodejs.org',
        'No package.json': 'This doesn't appear to be a Node.js project'
      }
    },

    // Interactive commands (for documentation purposes)
    keyCommands: {
      reload: 'r',
      restart: 'R',
      quit: 'q'
    }
  }
}
```

## Configuration Fields

### `command` (required)
The shell command to start your dev server. Can be any command that runs in a terminal.

**Examples:**
```javascript
command: 'npm run dev'
command: 'pnpm start'
command: 'yarn dev'
command: 'flutter run'
command: 'python manage.py runserver'
command: 'cargo run'
```

### `port` (required)
The port for the PTY HTTP bridge. Each project needs a unique port. The bridge provides two endpoints:
- `GET /logs?since=N` - Retrieve buffered dev server output
- `POST /cmd {cmd: "..."}` - Send keystrokes to the PTY

**Default ports by type:**
- Expo: 8790
- Vite: 8791
- Flutter: 8792
- Custom: 8793+

### `cwd` (optional)
Override the working directory. By default, the command runs in the project's `path` directory. Use `cwd` if you need to run the command in a subdirectory.

**Examples:**
```javascript
// Run in project root
cwd: undefined  // default

// Run in subdirectory
cwd: './client'
cwd: './packages/web'
```

### `env` (optional)
Additional environment variables to pass to the dev server process. These are merged with the parent process environment.

**Examples:**
```javascript
env: {
  NODE_ENV: 'development',
  PORT: '3000',
  DEBUG: 'app:*'
}
```

### `validation` (optional)
Pre-flight checks before starting the dev server. If validation fails, the process exits immediately with a helpful error message.

#### `validation.fileExists`
Array of file paths (relative to working directory) that must exist.

**Examples:**
```javascript
validation: {
  fileExists: ['package.json']  // Node.js project
  fileExists: ['pubspec.yaml']  // Flutter project
  fileExists: ['Cargo.toml']    // Rust project
  fileExists: ['.env', 'package.json']  // Multiple files
}
```

#### `validation.commandInPath`
Command that must be available in PATH. Checks using `command -v`.

**Examples:**
```javascript
validation: {
  commandInPath: 'node'    // Node.js
  commandInPath: 'flutter' // Flutter
  commandInPath: 'cargo'   // Rust
  commandInPath: 'python3' // Python
}
```

#### `validation.errorHints`
Custom error messages for common issues. Provides helpful guidance when validation fails.

**Examples:**
```javascript
validation: {
  commandInPath: 'flutter',
  errorHints: {
    'command not found': 'Install Flutter: https://flutter.dev/docs/get-started/install',
    'No pubspec.yaml': 'Flutter projects require a pubspec.yaml file'
  }
}
```

### `keyCommands` (optional)
Documentation of interactive commands your dev server supports. This field is for reference only and doesn't affect behavior.

**Examples:**
```javascript
// React/Vite
keyCommands: {
  reload: 'r',
  quit: 'q'
}

// Flutter
keyCommands: {
  reload: 'r',
  restart: 'R',
  quit: 'q',
  help: 'h'
}

// Expo
keyCommands: {
  reload: 'r',
  ios: 'i',
  android: 'a'
}
```

## Example Configurations

### Next.js

```javascript
{
  name: 'next-app',
  path: './apps/web',
  devServer: {
    command: 'npm run dev',
    port: 8793,
    validation: {
      fileExists: ['package.json', 'next.config.js']
    }
  }
}
```

### Astro

```javascript
{
  name: 'astro-site',
  path: './apps/site',
  devServer: {
    command: 'npm run dev',
    port: 8794,
    validation: {
      fileExists: ['astro.config.mjs']
    }
  }
}
```

### Python Django

```javascript
{
  name: 'django-api',
  path: './backend',
  devServer: {
    command: 'python manage.py runserver',
    port: 8795,
    env: {
      DJANGO_DEBUG: 'True'
    },
    validation: {
      fileExists: ['manage.py'],
      commandInPath: 'python'
    }
  }
}
```

### Rust (Cargo)

```javascript
{
  name: 'rust-server',
  path: './server',
  devServer: {
    command: 'cargo run',
    port: 8796,
    validation: {
      fileExists: ['Cargo.toml'],
      commandInPath: 'cargo',
      errorHints: {
        'command not found': 'Install Rust: https://rustup.rs'
      }
    }
  }
}
```

### Monorepo with Turborepo

```javascript
{
  name: 'turbo-web',
  path: './',
  devServer: {
    command: 'pnpm turbo dev --filter=web',
    port: 8797,
    validation: {
      fileExists: ['turbo.json', 'package.json']
    }
  }
}
```

## Using Agent Commands

Once configured, use these commands to interact with your dev server:

### Get Dev Server Logs
```bash
pnpm agenteract-agents dev-logs <project-name> --since 50
```

### Send Commands to Dev Server
```bash
pnpm agenteract-agents cmd <project-name> r
```

### Get App Runtime Logs
```bash
pnpm agenteract-agents logs <project-name> --since 20
```

### Get UI Hierarchy
```bash
pnpm agenteract-agents hierarchy <project-name>
```

## Differences from Type-Based Config

**Old (deprecated):**
```javascript
{
  name: 'expo-app',
  type: 'expo',
  path: './apps/mobile',
  ptyPort: 8790
}
```

**New (generic):**
```javascript
{
  name: 'expo-app',
  path: './apps/mobile',
  devServer: {
    command: 'npx expo start',
    port: 8790,
    keyCommands: { reload: 'r', ios: 'i', android: 'a' }
  }
}
```

**Benefits:**
- ✅ Works with any dev server
- ✅ Explicit command (no hidden magic)
- ✅ Validation support
- ✅ Environment variables
- ✅ No need for type-specific packages

## Troubleshooting

### Dev server fails to start

1. **Check validation errors**: Look for pre-flight check failures
2. **Verify command**: Make sure the command works in your terminal
3. **Check working directory**: Ensure `cwd` is correct if specified
4. **Review logs**: Use `pnpm agenteract-agents dev-logs <project>` to see errors

### Port conflicts

If you get "port already in use" errors:
1. Each project needs a unique `port`
2. Check what's running: `lsof -i :8793`
3. Choose a different port number

### Command not found

If you get "command not found" errors:
1. Add `validation.commandInPath` to check at startup
2. Make sure the command is in your PATH
3. Use absolute paths if needed: `/usr/local/bin/node`

### Process exits immediately

1. Check if the command is interactive (requires stdin)
2. Verify the command runs standalone in a terminal
3. Check for missing dependencies or configuration files

## Best Practices

1. **Use validation**: Always add `validation.fileExists` to catch setup issues early
2. **Unique ports**: Assign unique ports to avoid conflicts
3. **Document commands**: Use `keyCommands` to document interactive keys
4. **Environment variables**: Use `env` instead of hardcoding in commands
5. **Descriptive names**: Use clear project names that match your app structure

## Migration from Type-Based Config

See [MIGRATION_V2.md](./MIGRATION_V2.md) for detailed migration instructions.
