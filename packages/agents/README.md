# @agenteract/agents

Agent instructions installer for [Agenteract](https://github.com/agenteract/agenteract).

Agenteract is an experimental bridge that lets coding agents view and interact with running applications — React Native / Expo, React, Flutter, Kotlin Multiplatform, and SwiftUI.

## Usage

The quickest way to get started with Agenteract is to generate an `AGENTS.md` file that your coding agent can read to understand how to set up and use the bridge:

```bash
npx @agenteract/agents
```

This appends Agenteract setup instructions to `AGENTS.md` (creating it if it doesn't exist).

You can also target a different filename — useful for Claude, Cursor, or other agents that use a different conventions:

```bash
npx @agenteract/agents CLAUDE.md
npx @agenteract/agents CURSOR.md
```

Once the file is created, restart your coding CLI or open a new chat tab, then ask your agent:

> "Please add Agenteract support and make sure it works."

## Programmatic API

This package also exports app lifecycle utilities from `@agenteract/core` for use in agent scripts:

```ts
import { startApp, stopApp, restartApp } from '@agenteract/agents';
import type { AppLifecycleOptions, Device } from '@agenteract/agents';
```

## Full documentation

See the [Agenteract README](https://github.com/agenteract/agenteract#readme) for full setup guides, configuration reference, and platform-specific instructions.

## License

Apache-2.0
