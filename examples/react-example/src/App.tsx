import { createAgentBinding } from '@agenteract/react';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <h1>Home</h1>
      <div>
      <button {...createAgentBinding({
        testID: 'button',
        onClick: () => console.log('Simulate button pressed'),
      })}>
        Simulate Target
      </button>
      </div>
    </div>
  );
}

export default App;