import { useState, useEffect } from 'react'
import { createAgentBinding } from '@agenteract/react'
import './App.css'

interface Task {
  id: number
  title: string
  completed: boolean
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [apiHealth, setApiHealth] = useState<string>('')

  // Fetch tasks from FastAPI backend
  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks')
      const data = await response.json()
      setTasks(data.tasks)
      console.log('Tasks loaded:', data.tasks.length)
    } catch (error) {
      console.error('Error fetching tasks:', error)
      setStatusMessage('Error loading tasks')
    }
  }

  // Check API health
  const checkHealth = async () => {
    try {
      const response = await fetch('/health')
      const data = await response.json()
      setApiHealth(data.status)
      console.log('API health check:', data.status)
    } catch (error) {
      console.error('Error checking health:', error)
      setApiHealth('unhealthy')
    }
  }

  // Load tasks on mount
  useEffect(() => {
    fetchTasks()
    checkHealth()
  }, [])

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      setStatusMessage('Please enter a task title')
      return
    }

    const newTask: Task = {
      id: Date.now(),
      title: newTaskTitle,
      completed: false,
    }

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      })
      const data = await response.json()
      console.log('Task created:', data.message)
      setStatusMessage(data.message)
      setNewTaskTitle('')
      await fetchTasks()
    } catch (error) {
      console.error('Error creating task:', error)
      setStatusMessage('Error creating task')
    }
  }

  const handleToggleTask = async (task: Task) => {
    const updatedTask = { ...task, completed: !task.completed }

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTask),
      })
      const data = await response.json()
      console.log('Task updated:', data.message)
      await fetchTasks()
    } catch (error) {
      console.error('Error updating task:', error)
      setStatusMessage('Error updating task')
    }
  }

  const handleDeleteTask = async (taskId: number) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      console.log('Task deleted:', data.message)
      await fetchTasks()
    } catch (error) {
      console.error('Error deleting task:', error)
      setStatusMessage('Error deleting task')
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Agenteract FastAPI Demo</h1>
        <p className="subtitle">Task Management with Python Backend</p>
        {apiHealth && (
          <div {...createAgentBinding({ testID: 'api-status' })} className="api-status">
            API Status: {apiHealth}
          </div>
        )}
      </header>

      <main>
        <section className="add-task-section">
          <h2>Add New Task</h2>
          <div className="input-group">
            <input
              {...createAgentBinding({
                testID: 'task-input',
                onChangeText: (text) => setNewTaskTitle(text),
              })}
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Enter task title..."
              onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
            />
            <button
              {...createAgentBinding({
                testID: 'add-task-button',
                onPress: handleAddTask,
              })}
              onClick={handleAddTask}
            >
              Add Task
            </button>
          </div>
          {statusMessage && (
            <div {...createAgentBinding({ testID: 'status-message' })} className="status-message">
              {statusMessage}
            </div>
          )}
        </section>

        <section className="tasks-section">
          <h2>Tasks</h2>
          {tasks.length === 0 ? (
            <p {...createAgentBinding({ testID: 'no-tasks-message' })} className="empty-message">
              No tasks yet. Add one above!
            </p>
          ) : (
            <ul className="task-list">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  {...createAgentBinding({ testID: `task-${task.id}` })}
                  className={`task-item ${task.completed ? 'completed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggleTask(task)}
                    {...createAgentBinding({
                      testID: `task-checkbox-${task.id}`,
                      onPress: () => handleToggleTask(task),
                    })}
                  />
                  <span className="task-title">{task.title}</span>
                  <button
                    {...createAgentBinding({
                      testID: `delete-task-${task.id}`,
                      onPress: () => handleDeleteTask(task.id),
                    })}
                    onClick={() => handleDeleteTask(task.id)}
                    className="delete-button"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="info-section">
          <h3>About This Demo</h3>
          <p>
            This demonstrates Agenteract working with a Python FastAPI backend.
            The frontend is React with Vite, communicating with FastAPI via REST APIs.
          </p>
          <p>
            You can use the <code>@agenteract/agents</code> CLI to interact with this app:
          </p>
          <ul>
            <li><code>pnpm agenteract-agents hierarchy fastapi-app</code></li>
            <li><code>pnpm agenteract-agents tap fastapi-app add-task-button</code></li>
            <li><code>pnpm agenteract-agents input fastapi-app task-input "New task"</code></li>
          </ul>
        </section>
      </main>
    </div>
  )
}

export default App
