# @agenteract/cli

Unified command-line interface for [Agenteract](https://github.com/agenteract/agenteract).

Agenteract is an experimental bridge that lets coding agents view and interact with running applications — React Native / Expo, React, Flutter, Kotlin Multiplatform, and SwiftUI.

## Installation

```bash
npm install -g @agenteract/cli
```

Or use without installing:

```bash
npx @agenteract/cli <command>
```

## Commands

### `dev`

Starts the Agenteract development environment — launches the bridge server and all configured dev servers:

```bash
agenteract dev
```

### `connect [scheme]`

Pairs a physical device via deep link QR code:

```bash
agenteract connect myapp
agenteract connect myapp --device <deviceId>
agenteract connect myapp --all      # show all devices
agenteract connect myapp --qr-only  # print QR code only
```

### `add-config`

Creates or updates `agenteract.config.js` with a new project entry:

```bash
agenteract add-config <path> <projectName> <command> [port] --scheme myapp
```

- `path` — path to the project directory
- `projectName` — project name as supplied to `AgentDebugBridge` in your app
- `command` — dev server command (e.g. `"npm run dev"`, `"flutter run"`)
- `port` — PTY bridge port (auto-assigned if omitted)
- `--scheme` — URL scheme used for QR code / deep link pairing
- `--wait-log-timeout` — timeout in ms to wait for the dev server to be ready

## Full documentation

See the [Agenteract README](https://github.com/agenteract/agenteract#readme) for full setup guides, configuration reference, and platform-specific instructions.

## License

MIT
