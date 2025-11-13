# Agenteract FastAPI Example

This example demonstrates how to use Agenteract with a Python FastAPI application.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Install Agenteract packages (at monorepo root):
```bash
pnpm install
```

3. Add Agenteract configuration:
```bash
pnpm agenteract add-config ./examples/fastapi-example fastapi-app "uvicorn main:app --reload --port 8000"
```

## Running the App

Start the dev server with Agenteract:
```bash
pnpm agenteract dev
```

Then open http://localhost:8000 in your browser.

## Features

- Simple task management API
- HTML frontend with AgentDebugBridge integration
- Demonstrates Agenteract's ability to interact with Python backend apps

## API Endpoints

- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create a new task
- `PUT /api/tasks/{id}` - Update a task
- `DELETE /api/tasks/{id}` - Delete a task
- `GET /health` - Health check

## Testing with Agenteract

You can use the `@agenteract/agents` CLI to interact with the frontend:

```bash
# Get UI hierarchy
pnpm agenteract-agents hierarchy fastapi-app

# Tap a button
pnpm agenteract-agents tap fastapi-app add-task-button

# Input text
pnpm agenteract-agents input fastapi-app task-input "New task"

# Check logs
pnpm agenteract-agents logs fastapi-app --since 20
```
