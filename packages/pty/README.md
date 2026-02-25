# @agenteract/pty

PTY process manager for [Agenteract](https://github.com/agenteract/agenteract).

Agenteract is an experimental bridge that lets coding agents view and interact with running applications — React Native / Expo, React, Flutter, Kotlin Multiplatform, and SwiftUI.

## What it does

This package wraps dev server processes in a pseudo-terminal (PTY) and exposes an HTTP API so agents can read output and send commands — without needing a real terminal session.

Used internally by `@agenteract/cli` to manage dev servers for each configured project.

## HTTP API

Each PTY process exposes:

- `GET /logs?since=N` — returns the last N lines of buffered dev server output (up to 2000 lines)
- `POST /cmd` — sends a keystroke to the dev server: `{ "cmd": "r" }`

## Programmatic API

```ts
import { startPty } from '@agenteract/pty';
import type { PtyOptions } from '@agenteract/pty';

await startPty({
  command: 'npm run dev',
  port: 8791,
  cwd: '/path/to/project',
  validation: {
    commandInPath: 'npm',
    errorHints: ['EADDRINUSE'],
  },
});
```

## Direct usage

```bash
npx @agenteract/pty --port 8791
```

## Full documentation

See the [Agenteract README](https://github.com/agenteract/agenteract#readme) for full setup guides, configuration reference, and platform-specific instructions.

## License

Apache-2.0
