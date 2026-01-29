import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AgentDebugBridge } from '@agenteract/react'

// Handler for agentLink from tests
const handleAgentLink = async (url: string): Promise<boolean> => {
  console.log('[AgentLink] Received:', url);
  
  try {
    const uri = new URL(url);
    const action = uri.hostname || uri.pathname.replace('/', '');
    
    switch (action) {
      case 'reset_state':
        console.log('[AgentLink] Resetting app state');
        // Dispatch custom event to reset app
        window.dispatchEvent(new CustomEvent('agenteract:reset'));
        console.log('App state cleared');
        return true;
      
      case 'navigate':
        const screen = uri.searchParams.get('screen');
        console.log(`[AgentLink] Navigate to screen: ${screen}`);
        return true;
      
      default:
        console.log('[AgentLink] Unknown action:', action);
        return false;
    }
  } catch (error) {
    console.error('[AgentLink] Error handling agent link:', error);
    return false;
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
    <AgentDebugBridge projectName="react-app" onAgentLink={handleAgentLink} />
    <App />
    </>
  </StrictMode>,
)
