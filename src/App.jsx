import React, { useState, useEffect } from 'react';
import Game from './Game';
import StartScreen from './StartScreen';
import { getHourlyMap } from './utils';

function App() {
  const [gameState, setGameState] = useState('start'); // start, playing
  const [username, setUsername] = useState('');
  const [currentMap, setCurrentMap] = useState(getHourlyMap());
  const [roomId, setRoomId] = useState(null); // For P2P connection

  useEffect(() => {
    // Check for map updates every minute
    const interval = setInterval(() => {
      const map = getHourlyMap();
      // If map changes while playing, we DON'T kick the player (per user request).
      // But we update the 'currentMap' state which new players will use.
      setCurrentMap(map);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = (name, isHost, connectToId, inputType) => {
    setUsername(name);
    setRoomId(connectToId); // If joining
    setGameState(isHost ? 'hosting' : 'joining');
    setInputMethod(inputType);
  };
  
  const [inputMethod, setInputMethod] = useState('keyboard');

  return (
    <div className="App">
      {gameState === 'start' && (
        <StartScreen onStart={handleStart} currentMap={currentMap} />
      )}
      {(gameState === 'hosting' || gameState === 'joining') && (
        <Game 
          username={username} 
          isHost={gameState === 'hosting'} 
          roomId={roomId}
          mapType={currentMap} 
          inputType={inputMethod}
          onGameOver={() => setGameState('start')}
        />
      )}
      <div className="map-info">
        Current Global Map: {currentMap.name} (Resets hourly)
      </div>
    </div>
  );
}

export default App;
