# @agenteract/core

Core message schema, bridge protocol, and shared utilities for [Agenteract](https://github.com/agenteract/agenteract).

Agenteract is an experimental bridge that lets coding agents view and interact with running applications — React Native / Expo, React, Flutter, Kotlin Multiplatform, and SwiftUI.

## Installation

```bash
npm install @agenteract/core
```

## What's included

### Protocol types and utilities

```ts
import { AgentCommand, AgentResponse, encodeMessage, decodeMessage, AGENTERACT_PROTOCOL_VERSION } from '@agenteract/core';
```

- **`AgentCommand`** — `{ action: string; [key: string]: any }` — a command sent from an agent to an app
- **`AgentResponse`** — `{ status: 'success' | 'error' | 'received'; [key: string]: any }` — response from the app
- **`encodeMessage(obj)`** — JSON-stringifies a message with a protocol version tag
- **`decodeMessage<T>(json)`** — JSON-parses a message
- **`AGENTERACT_PROTOCOL_VERSION`** — current protocol version string

### Configuration types

```ts
import { AgenteractConfig, ProjectConfig, DevServerConfig } from '@agenteract/core';
```

Used by `agenteract.config.js` in your project root.

### Node.js utilities (server-side only)

```ts
import { startApp, stopApp, restartApp, getDeviceState } from '@agenteract/core/node';
```

App lifecycle management, device detection, platform utilities, and the `AgentClient` for programmatic agent interactions. See the [full documentation](https://github.com/agenteract/agenteract#readme) for details.

## Full documentation

See the [Agenteract README](https://github.com/agenteract/agenteract#readme) for full setup guides, configuration reference, and platform-specific instructions.

## License

Apache-2.0
