# FastAPI E2E Test

This test demonstrates Agenteract working with a Python FastAPI backend.

## Architecture

The test sets up a complete stack:

```
┌─────────────────────────────────────────┐
│  Puppeteer (Headless Browser)          │
│  ↓                                      │
│  Vite Dev Server (React Frontend)      │
│  - Includes AgentDebugBridge            │
│  - Proxies API calls to FastAPI         │
│  ↓                                      │
│  FastAPI Backend (Python)               │
│  - uvicorn server on port 8000          │
│  - REST API endpoints                   │
└─────────────────────────────────────────┘
           ↕
    Agenteract CLI
    - hierarchy
    - tap
    - input
    - logs
```

## Prerequisites

- Python 3.8+
- pip3
- Node.js 20+
- pnpm

## What This Test Validates

1. ✅ FastAPI backend starts and serves API
2. ✅ Vite frontend builds and connects to FastAPI
3. ✅ AgentDebugBridge establishes WebSocket connection
4. ✅ UI hierarchy can be fetched via agenteract-agents
5. ✅ Can input text via agenteract-agents
6. ✅ Can tap buttons via agenteract-agents
7. ✅ Frontend makes successful API calls to FastAPI
8. ✅ Data flows: UI → FastAPI → Response → UI
9. ✅ Console logs are captured

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
   - Install Python dependencies via pip

2. **Backend Phase**
   - Start FastAPI backend with uvicorn
   - Wait for health check endpoint to respond

3. **Frontend Phase**
   - Create agenteract config for the app
   - Start agenteract dev (which starts Vite)
   - Launch Puppeteer to open the frontend
   - Wait for AgentDebugBridge to connect

4. **Testing Phase**
   - Fetch UI hierarchy
   - Verify API health status
   - Input text into task field
   - Tap "Add Task" button
   - Verify task creation in logs
   - Verify task appears in UI
   - Verify task exists in backend API

5. **Cleanup Phase**
   - Close browser
   - Stop FastAPI backend
   - Stop agenteract dev
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

In this test, we configure Agenteract with:

```bash
pnpm agenteract add-config ./examples/fastapi-example fastapi-app 'npm run dev'
```

This creates an entry in `agenteract.config.js` that tells Agenteract to:
1. Run `npm run dev` (which starts Vite)
2. Name this project "fastapi-app"
3. Allow agents to interact with it via the CLI

You could also run the FastAPI backend through Agenteract:

```bash
pnpm agenteract add-config ./examples/fastapi-example fastapi-backend 'uvicorn main:app --reload'
```

This would let you monitor FastAPI logs via:

```bash
pnpm agenteract-agents dev-logs fastapi-backend --since 20
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
