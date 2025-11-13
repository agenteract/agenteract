#!/usr/bin/env python3
"""
Simple FastAPI example for Agenteract E2E testing
"""

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List

app = FastAPI(title="Agenteract FastAPI Demo")


class Task(BaseModel):
    id: int
    title: str
    completed: bool = False


# In-memory task storage
tasks: List[Task] = [
    Task(id=1, title="Learn Agenteract", completed=False),
    Task(id=2, title="Build FastAPI app", completed=True),
]


@app.get("/api/tasks")
async def get_tasks():
    """Get all tasks"""
    return {"tasks": tasks}


@app.post("/api/tasks")
async def create_task(task: Task):
    """Create a new task"""
    tasks.append(task)
    return {"task": task, "message": "Task created successfully"}


@app.put("/api/tasks/{task_id}")
async def update_task(task_id: int, task: Task):
    """Update a task"""
    for i, t in enumerate(tasks):
        if t.id == task_id:
            tasks[i] = task
            return {"task": task, "message": "Task updated successfully"}
    return {"error": "Task not found"}


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int):
    """Delete a task"""
    global tasks
    tasks = [t for t in tasks if t.id != task_id]
    return {"message": "Task deleted successfully"}


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
