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

  return (
    <div className="app">
      <h1>Agenteract FastAPI Demo</h1>

      {apiHealth && (
        <div {...createAgentBinding({ testID: 'api-status' })} className="api-status">
          API Status: {apiHealth}
        </div>
      )}

      <div className="add-task-section">
        <h2>Add New Task</h2>
        <div className="input-group">
          <input
            {...createAgentBinding({
              testID: 'task-input',
              onChange: (e) => setNewTaskTitle(e.target.value),
            })}
            type="text"
            value={newTaskTitle}
            placeholder="Enter task title..."
            onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
          />
          <button
            {...createAgentBinding({
              testID: 'add-task-button',
              onClick: handleAddTask,
            })}
          >
            Add Task
          </button>
        </div>
        {statusMessage && (
          <div {...createAgentBinding({ testID: 'status-message' })} className="status-message">
            {statusMessage}
          </div>
        )}
      </div>

      <div className="tasks-section">
        <h2>Tasks ({tasks.length})</h2>
        {tasks.length === 0 ? (
          <p {...createAgentBinding({ testID: 'no-tasks-message' })}>
            No tasks yet. Add one above!
          </p>
        ) : (
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id} {...createAgentBinding({ testID: `task-${task.id}` })}>
                {task.title} {task.completed && '✓'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default App
