# @agenteract/flutter-cli

Flutter dev server PTY bridge for Agenteract.

## What it does

This package wraps `flutter run` in a pseudo-terminal (PTY) and provides an HTTP API for:
- Reading buffered dev server logs (build errors, device connection, hot reload status)
- Sending commands to the Flutter dev server (hot reload, restart, quit)

## Important Note

This captures **dev server logs** from `flutter run`. Runtime application logs from `debugPrint` are sent via WebSocket through the `AgentDebugBridge` widget in your Flutter app.

## Usage

Typically used via `pnpm agenteract dev` from the monorepo root, not directly.

### Direct usage:

```bash
# In your Flutter project directory
npx @agenteract/flutter-cli --port 8792
```

### Commands

The PTY bridge accepts Flutter's standard keyboard commands:
- `r` - Hot reload
- `R` - Hot restart
- `q` - Quit
- `h` - Help

### HTTP API

- `GET /logs?since=N` - Get last N lines of flutter run output
- `POST /cmd` - Send keystroke to dev server
  ```json
  { "cmd": "r" }
  ```

## License

MIT
