import { createAgentBinding } from '@agenteract/react';
import { useState, useRef } from 'react';
import './App.css';

function App() {
  const [username, setUsername] = useState('');
  const [cardPosition, setCardPosition] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current;
    setCardPosition(deltaX);
  };

  const handleTouchEnd = () => {
    if (Math.abs(cardPosition) > 100) {
      console.log('Swipe completed:', cardPosition > 0 ? 'right' : 'left');
    }
    setCardPosition(0);
  };

  return (
    <div className="app-container">
      <h1>Agenteract Web Demo</h1>

      <div className="section">
        <h2>Button</h2>
        <button {...createAgentBinding({
          testID: 'test-button',
          onClick: () => console.log('Simulate button pressed'),
        })}>
          Simulate Target
        </button>
      </div>

      <div className="section">
        <h2>Text Input</h2>
        <input
          type="text"
          placeholder="Enter username"
          value={username}
          className="text-input"
          {...createAgentBinding({
            testID: 'username-input',
            onChange: (e) => setUsername(e.target.value),
          })}
        />
        <p>Current value: {username}</p>
      </div>

      <div className="section">
        <h2>Swipeable Card (touch-enabled)</h2>
        <div
          className="swipe-card"
          style={{ transform: `translateX(${cardPosition}px)` }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          {...createAgentBinding({
            testID: 'swipeable-card',
            onSwipe: (direction, velocity) => {
              console.log('Agent swipe detected:', direction, 'velocity:', velocity);
              const distance = velocity === 'fast' ? 200 : velocity === 'medium' ? 100 : 50;
              const offset = direction === 'left' ? -distance : direction === 'right' ? distance : 0;
              setCardPosition(offset);
              setTimeout(() => setCardPosition(0), 500);
            },
          })}
        >
          <p>Swipe me! (or use touch on mobile)</p>
        </div>
      </div>

      <div className="section">
        <h2>Horizontal Scroll</h2>
        <div
          className="horizontal-scroll"
          {...createAgentBinding({
            testID: 'horizontal-scroll',
          })}
        >
          {Array.from({ length: 20 }).map((_, index) => (
            <div key={index} className="horizontal-item">
              Item {index + 1}
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Vertical Scroll</h2>
        <div
          className="vertical-scroll"
          {...createAgentBinding({
            testID: 'main-list',
          })}
        >
          {Array.from({ length: 100 }).map((_, index) => (
            <div key={index} className="list-item">
              Scroll item {index + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;