import React, { useState } from 'react';

function StartScreen({ onStart, currentMap }) {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState('menu'); // menu, join
  const [inputType, setInputType] = useState('keyboard'); // keyboard, mouse

  const handleHost = () => {
    if (!name) return alert('Please enter a name');
    onStart(name, true, null, inputType);
  };

  const handleJoin = () => {
    if (!name) return alert('Please enter a name');
    if (!roomId) return alert('Please enter a Room ID');
    onStart(name, false, roomId, inputType);
  };

  return (
    <div className="start-screen">
      <h1>3D Paper.io Clone</h1>
      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          placeholder="Enter Nickname" 
          value={name} 
          onChange={(e) => setName(e.target.value)}
          style={{ padding: '10px', fontSize: '1.2em', borderRadius: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ color: 'white', marginRight: '10px' }}>Controls:</label>
        <select 
          value={inputType} 
          onChange={(e) => setInputType(e.target.value)}
          style={{ padding: '5px', borderRadius: '5px' }}
        >
          <option value="keyboard">Keyboard (Arrows/WASD to Turn)</option>
          <option value="mouse">Mouse (Follow Cursor)</option>
        </select>
      </div>

      <div style={{ marginBottom: '20px', color: '#aaa' }}>
        Current Map: <strong>{currentMap.name.toUpperCase()}</strong><br/>
        <small>Next map shuffle in: {Math.floor((currentMap.endTime - new Date()) / 60000)} mins</small>
      </div>

      {mode === 'menu' && (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleHost}>Create Match (Host)</button>
          <button onClick={() => setMode('join')}>Join Match</button>
        </div>
      )}

      {mode === 'join' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="Enter Room ID" 
            value={roomId} 
            onChange={(e) => setRoomId(e.target.value)}
            style={{ padding: '10px', borderRadius: '5px' }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleJoin}>Connect</button>
            <button onClick={() => setMode('menu')}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default StartScreen;
