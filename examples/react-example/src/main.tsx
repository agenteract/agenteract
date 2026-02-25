import { StrictMode, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AgentDebugBridge } from '@agenteract/react'
import { parseURL } from './utils/deepLinkUtils'

function Root() {
  const handleAgentLink = useCallback(async (url: string): Promise<boolean> => {
    console.log('[App] Agent link received:', url);

    try {
      const { hostname, queryParams } = parseURL(url);
      console.log('[App] Parsed hostname:', hostname, 'params:', queryParams);

      switch (hostname) {
        case 'reset_state':
          console.log('[App] Resetting app state');
          // In a real app, you would clear your app state here
          console.log('[App] App state cleared');
          return true;

        case 'reload':
          console.log('[App] Reload requested via agent link');
          window.location.reload();
          return true;

        default:
          console.log('[App] Agent link hostname not handled by app:', hostname);
          return false;
      }
    } catch (error) {
      console.error('[App] Error handling agent link:', error);
      return false;
    }
  }, []);

  return (
    <>
      <AgentDebugBridge projectName="react-app" onAgentLink={handleAgentLink} />
      <App />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
