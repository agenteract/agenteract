# FastAPI E2E Test

This test demonstrates Agenteract working with a Python FastAPI backend.

## Architecture

The test sets up a complete stack where **both** the FastAPI backend and Vite frontend are managed by `@agenteract/server`:

```
┌────────────────────────────────────────────────────┐
│  @agenteract/server (Manages both apps)            │
│  ├─ fastapi-backend (PTY port 8790)                │
│  │  └─ python3 -m uvicorn main:app --port 8000     │
│  │     - REST API endpoints                        │
│  │     - Agent can access dev-logs                 │
│  │                                                  │
│  └─ fastapi-frontend (PTY port 8791)               │
│     └─ npm run dev (Vite on port 5174)             │
│        - Includes AgentDebugBridge                 │
│        - Proxies API calls to FastAPI              │
│        - Agent can access dev-logs                 │
└────────────────────────────────────────────────────┘
              ↕                        ↕
    Puppeteer Browser          Agenteract CLI
    (Opens frontend)           - hierarchy fastapi-frontend
                               - tap fastapi-frontend
                               - input fastapi-frontend
                               - logs fastapi-frontend
                               - dev-logs fastapi-backend
                               - dev-logs fastapi-frontend
```

**Key Point**: Both apps are managed by Agenteract, so the agent has full access to both backend and frontend logs!

## Prerequisites

- Python 3.8+
- pip3
- Node.js 20+
- pnpm

## What This Test Validates

1. ✅ **Backend management**: FastAPI backend managed by `@agenteract/server`
2. ✅ **Frontend management**: Vite frontend managed by `@agenteract/server`
3. ✅ **Agent access to backend**: Can fetch FastAPI dev-logs via CLI
4. ✅ **Agent access to frontend**: Can fetch Vite dev-logs via CLI
5. ✅ **AgentDebugBridge connection**: WebSocket connection established
6. ✅ **UI hierarchy**: Can be fetched via `hierarchy fastapi-frontend`
7. ✅ **UI interaction**: Can input text and tap buttons
8. ✅ **Backend integration**: Frontend makes successful API calls to FastAPI
9. ✅ **Data flow**: UI → FastAPI → Response → UI
10. ✅ **Console logs**: Captured from React frontend

## Running the Test

### Prerequisites

- Python 3.11+ with pip
- Chrome/Chromium for Puppeteer (auto-installed in CI)

### Local Development

From the monorepo root:

```bash
# Install Chrome for Puppeteer (if not already installed)
npx puppeteer browsers install chrome

# Install dependencies
pnpm install

# Run the FastAPI e2e test
pnpm test:e2e:fastapi
```

### CI Environment

The test runs automatically in GitHub Actions via `.github/workflows/e2e-fastapi.yml` on:
- Pull requests to `main`
- Pushes to `main` or `release/**` branches
- Manual workflow dispatch

## Test Flow

1. **Setup Phase**
   - Start Verdaccio (local npm registry)
   - Publish @agenteract packages to Verdaccio
   - Copy fastapi-example to /tmp
   - Install Node.js dependencies from Verdaccio
   - Set up Python virtual environment (non-CI only)
   - Install Python dependencies via pip

2. **Configuration Phase**
   - Install CLI packages in isolated test directory
   - Create `agenteract.config.js` with **both** apps:
     - `fastapi-backend`: Runs `python3 -m uvicorn main:app --reload --port 8000`
     - `fastapi-frontend`: Runs `npm run dev` (Vite on port 5174)

3. **Server Phase**
   - Start `npx @agenteract/cli dev` (manages both apps via `@agenteract/server`)
   - FastAPI backend starts on port 8000 (PTY port 8790)
   - Vite frontend starts on port 5174 (PTY port 8791)
   - Verify agent can access dev-logs for both apps

4. **Browser Phase**
   - Launch Puppeteer headless browser
   - Navigate to http://localhost:5174
   - Wait for AgentDebugBridge to connect

5. **Testing Phase**
   - Fetch UI hierarchy via `hierarchy fastapi-frontend`
   - Verify API health status in UI
   - Input text via `input fastapi-frontend task-input`
   - Click button via `tap fastapi-frontend add-task-button`
   - Verify task creation in console logs
   - Verify task appears in updated UI hierarchy
   - Verify task exists in FastAPI backend (direct API call)

6. **Cleanup Phase**
   - Close browser
   - Stop agenteract dev (stops both FastAPI and Vite)
   - Remove temp directories

## Key Insights

This test demonstrates that Agenteract can work with **any dev server**, not just JavaScript-based ones. The new generic dev server support allows you to use Agenteract with:

- Python (FastAPI, Django, Flask)
- Ruby (Rails, Sinatra)
- Go (Gin, Echo)
- PHP (Laravel)
- Any framework that serves HTTP

As long as you have a frontend with AgentDebugBridge, you can use Agenteract to interact with it while your backend runs any technology.

## Configuration Example

In this test, we configure Agenteract with **both** apps in `agenteract.config.js`:

```javascript
export default {
  "port": 8766,
  "projects": [
    {
      "name": "fastapi-backend",
      "path": "/path/to/fastapi-example",
      "devServer": {
        "command": "python3 -m uvicorn main:app --reload --port 8000",
        "port": 8790  // PTY port for backend
      }
    },
    {
      "name": "fastapi-frontend",
      "path": "/path/to/fastapi-example",
      "devServer": {
        "command": "npm run dev",
        "port": 8791  // PTY port for frontend
      }
    }
  ]
};
```

When you run `npx @agenteract/cli dev`, both apps start and are managed by `@agenteract/server`.

You can then interact with both:

```bash
# Monitor FastAPI backend logs
npx @agenteract/agents dev-logs fastapi-backend --since 20

# Monitor Vite frontend logs
npx @agenteract/agents dev-logs fastapi-frontend --since 20

# Interact with the UI
npx @agenteract/agents hierarchy fastapi-frontend
npx @agenteract/agents tap fastapi-frontend add-task-button
```

## Troubleshooting

### Puppeteer 403 Error

If you see `Error: Got status code 403` when installing Chrome:

```bash
# This is a network/environment issue
# The test will work in CI where Chrome can be downloaded
# For local testing, ensure you have internet access and try:
npx puppeteer browsers install chrome
```

### Port Already in Use

If ports are already in use:

```bash
# Kill existing processes
lsof -ti:8765,8766,8790,8791,8792,5174,8000 | xargs kill -9

# Or use the cleanup in the test (runs automatically)
```

### Verdaccio Not Starting

```bash
# Stop existing instance
pnpm verdaccio:stop

# Start fresh
pnpm verdaccio:start
```

### Python Dependencies

If Python dependencies fail to install:

```bash
# Ensure pip is up to date
pip3 install --upgrade pip

# Install dependencies manually
cd examples/fastapi-example
pip3 install -r requirements.txt
```
