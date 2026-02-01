import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from './GameEngine';
import Peer from 'peerjs';
import * as THREE from 'three';

const MOVE_SPEED = 0.02; // Radians per tick
const TURN_SPEED = 0.05; // Radians per tick

const Game = ({ username, isHost, roomId, mapType, inputType, onGameOver }) => {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const [peerId, setPeerId] = useState('');
  const [status, setStatus] = useState('Initializing...');
  
  // Game State Refs
  const gameState = useRef({
    players: {}, // { id: { quaternion: {x,y,z,w}, color } }
    map: mapType
  });
  
  const myIdRef = useRef(null);
  const connections = useRef({}); 
  const hostConn = useRef(null);
  
  // Input State
  const inputState = useRef({
      turn: 0 // -1 (left), 0, 1 (right)
  });

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') inputState.current.turn = -1;
        if (e.key === 'ArrowRight' || e.key === 'd') inputState.current.turn = 1;
    };
    const handleKeyUp = (e) => {
        if ((e.key === 'ArrowLeft' || e.key === 'a') && inputState.current.turn === -1) inputState.current.turn = 0;
        if ((e.key === 'ArrowRight' || e.key === 'd') && inputState.current.turn === 1) inputState.current.turn = 0;
    };
    
    // Mouse (simplified: left/right of screen center turns left/right)
    const handleMouseMove = (e) => {
        if (inputType !== 'mouse') return;
        const centerX = window.innerWidth / 2;
        if (e.clientX < centerX - 50) inputState.current.turn = -1;
        else if (e.clientX > centerX + 50) inputState.current.turn = 1;
        else inputState.current.turn = 0;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    if (inputType === 'mouse') window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [inputType]);

  // Game Loop (Host only)
  useEffect(() => {
    if (!isHost) return;
    
    const interval = setInterval(() => {
      updateGameState();
      broadcastState();
    }, 1000 / 30);
    
    return () => clearInterval(interval);
  }, [isHost]);

  // Send Input to Host (Client)
  useEffect(() => {
      if (isHost || !hostConn.current) return;
      
      const interval = setInterval(() => {
          if (hostConn.current.open) {
              hostConn.current.send({ type: 'INPUT', turn: inputState.current.turn });
          }
      }, 1000 / 30);
      return () => clearInterval(interval);
  }, [isHost]);

  const updateGameState = () => {
    Object.keys(gameState.current.players).forEach(id => {
      const p = gameState.current.players[id];
      const turn = (id === myIdRef.current) ? inputState.current.turn : (p.turn || 0);
      
      // Update Quaternion
      if (!p.q) {
          p.q = new THREE.Quaternion(p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w);
      }
      
      const q = p.q;
      
      // Rotate around Local Y (Up) for Turn
      if (turn !== 0) {
          const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn * TURN_SPEED * -1);
          q.multiply(rot);
      }
      
      // Rotate around Local X (Right) for Forward Movement
      const move = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), MOVE_SPEED);
      q.multiply(move);
      
      // Normalize
      q.normalize();
      
      // Sync back to serializable state
      p.quaternion = { x: q.x, y: q.y, z: q.z, w: q.w };
      
      // Painting
      if (engineRef.current) {
          // Update Engine Visuals
          engineRef.current.updatePlayerState(id, q);
          
          // Paint
          const uv = engineRef.current.getUVForPlayer(id);
          if (uv) {
              engineRef.current.paintAtUV(uv, p.color);
          }
      }
    });
  };

  const broadcastState = () => {
    const update = { type: 'UPDATE', players: gameState.current.players };
    Object.values(connections.current).forEach(conn => {
      if (conn.open) conn.send(update);
    });
  };

  // PeerJS Setup
  useEffect(() => {
    const peer = new Peer();
    
    peer.on('open', (id) => {
      setPeerId(id);
      myIdRef.current = id;
      
      if (isHost) {
        setStatus(`Hosting. Room ID: ${id}`);
        // Init self
        const q = new THREE.Quaternion(); // Identity = Top of sphere (if mapped correctly)
        // Actually, Identity might be (0,0,0) -> Inside?
        // No, Quaternion Identity represents "No Rotation".
        // In GameEngine, pos = Up.applyQuaternion(q).
        // So Identity -> Pos = Up (0, 10, 0). Correct.
        
        gameState.current.players[id] = {
          quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
          q: q,
          color: '#' + Math.floor(Math.random()*16777215).toString(16),
          username
        };
        
        if (!engineRef.current) {
           engineRef.current = new GameEngine(containerRef.current, mapType, true, onGameOver);
           engineRef.current.myId = id;
           engineRef.current.addPlayer(id, gameState.current.players[id].color, q);
        }
      } else {
        setStatus(`Connecting to ${roomId}...`);
        const conn = peer.connect(roomId);
        hostConn.current = conn;
        
        conn.on('open', () => {
          setStatus('Connected!');
          conn.send({ type: 'JOIN', username });
        });
        
        conn.on('data', (data) => {
          if (data.type === 'UPDATE') {
             if (!engineRef.current) return;
             const serverPlayers = data.players;
             Object.keys(serverPlayers).forEach(pid => {
                if (!engineRef.current.players[pid]) {
                    const sq = serverPlayers[pid].quaternion;
                    const q = new THREE.Quaternion(sq.x, sq.y, sq.z, sq.w);
                    engineRef.current.addPlayer(pid, serverPlayers[pid].color, q);
                }
                const sq = serverPlayers[pid].quaternion;
                const q = new THREE.Quaternion(sq.x, sq.y, sq.z, sq.w);
                engineRef.current.updatePlayerState(pid, q);
             });
          } else if (data.type === 'INIT') {
             if (!engineRef.current) {
                 engineRef.current = new GameEngine(containerRef.current, data.map, false, onGameOver);
                 engineRef.current.myId = id;
                 const serverPlayers = data.players;
                 Object.keys(serverPlayers).forEach(pid => {
                    const sq = serverPlayers[pid].quaternion;
                    const q = new THREE.Quaternion(sq.x, sq.y, sq.z, sq.w);
                    engineRef.current.addPlayer(pid, serverPlayers[pid].color, q);
                 });
             }
          }
        });
      }
    });

    peer.on('connection', (conn) => {
      if (!isHost) return; 
      conn.on('open', () => {
        connections.current[conn.peer] = conn;
        // Send Init
        conn.send({ type: 'INIT', map: mapType, players: gameState.current.players });
      });
      conn.on('data', (data) => {
        if (data.type === 'JOIN') {
            const q = new THREE.Quaternion(); // Start at top
            gameState.current.players[conn.peer] = {
                quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
                q: q,
                color: '#' + Math.floor(Math.random()*16777215).toString(16),
                username: data.username
            };
            if (engineRef.current) {
                engineRef.current.addPlayer(conn.peer, gameState.current.players[conn.peer].color, q);
            }
        } else if (data.type === 'INPUT') {
            if (gameState.current.players[conn.peer]) {
                gameState.current.players[conn.peer].turn = data.turn;
            }
        }
      });
    });

    return () => {
      peer.destroy();
      if (engineRef.current) {
          engineRef.current.dispose();
          engineRef.current = null;
      }
    };
  }, [isHost, roomId, mapType]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'black', zIndex: 100, pointerEvents: 'none' }}>
        <h3>Status: {status}</h3>
        {isHost && <div>Share this ID: <strong>{peerId}</strong></div>}
      </div>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default Game;
