import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AgentDebugBridge } from '@agenteract/react'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <AgentDebugBridge projectName="fastapi-app" />
      <App />
    </>
  </StrictMode>,
)
