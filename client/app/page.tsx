// pages/index.tsx or app/page.tsx
'use client'; // Important if using the App Router

import { useState, useEffect, useRef } from 'react';
// Using Socket.IO client for easier WebSocket management (reconnects, etc.)
// Install with: npm install socket.io-client
// import io, { Socket } from 'socket.io-client';

// --- Configuration ---
// Now, the frontend talks to its OWN origin, and the K8s Ingress/Service
// will route requests for specific paths (like /api/start and /ws)
// to the internal Go backend service.
// Use a relative path or the frontend's own external URL.
const BASE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || ''; // Use empty string for relative path if deployed on same domain
const START_GAME_ENDPOINT = `${BASE_URL}/api/start`; // Map this path in your Ingress/proxy to the Go backend's /start
const WEBSOCKET_ENDPOINT = `${BASE_URL}/ws`; // Map this path in your Ingress/proxy to the Go backend's /ws

// Define the possible arrow keys
const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export default function GamePage() {
  // --- State Management ---
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [points, setPoints] = useState(0);
  const [replicaCount, setReplicaCount] = useState(1); // Start assuming 1 replica
  const [sequence, setSequence] = useState<string[]>([]); // The sequence user needs to press
  const [sequenceIndex, setSequenceIndex] = useState(0); // Current position in the sequence

  // Ref for the WebSocket connection
  // const socketRef = useRef<Socket | null>(null);

  // --- Game Logic Functions ---

  // Generates a random sequence of arrow keys
  const generateSequence = (length: number): string[] => {
    return Array.from({ length }, () => ARROW_KEYS[Math.floor(Math.random() * ARROW_KEYS.length)]);
  };

  // Handles the game start logic
  const startGame = async () => {
    setGameState('playing');
    setPoints(0);
    setReplicaCount(1); // Reset display to initial state
    setSequenceIndex(0);
    const initialSequence = generateSequence(5); // Start with a sequence of 5
    setSequence(initialSequence);

    // // 1. Trigger Scale Up via Backend HTTP Endpoint (routed through frontend's URL)
    // try {
    //   const response = await fetch(START_GAME_ENDPOINT, {
    //     method: 'POST',
    //     // Add headers if needed (e.g., for authentication)
    //   });

    //   if (!response.ok) {
    //     throw new Error(`HTTP error! status: ${response.status}`);
    //   }

    //   console.log('Scale up triggered successfully');

    // } catch (error) {
    //   console.error('Failed to trigger scale up:', error);
    //   // Handle error: maybe show a message to the user and reset state
    //   setGameState('idle');
    //   alert('Failed to start the game. Please check the backend connection.');
    //   return; // Stop here if the trigger failed
    // }

    // // 2. Establish WebSocket connection for Real-time Updates (routed through frontend's URL)
    // // Socket.IO client will handle connection attempts and re-attempts
    // const socket = io(WEBSOCKET_ENDPOINT); // Connect to the WebSocket endpoint on the frontend's URL
    // socketRef.current = socket;

    // socket.on('connect', () => {
    //   console.log('WebSocket connected');
    //   // You could potentially send a message here to subscribe to updates
    // });

    // // Listen for replica count updates from the backend
    // socket.on('replicaUpdate', (data: { replicas: number }) => {
    //   console.log('Received replica update:', data.replicas);
    //   setReplicaCount(data.replicas);

    //   // Check if Kubernetes scaling "won"
    //   if (data.replicas >= 50 && gameState === 'playing') {
    //     // Add a small delay so the user sees the final count before the alert
    //     setTimeout(() => {
    //       if (gameState === 'playing') { // Double check state in case user won points simultaneously
    //         setGameState('finished');
    //         alert(`Game Over! Kubernetes scaled to 50 replicas. Your final score: ${points}`);
    //         socket.disconnect(); // Disconnect WebSocket
    //       }
    //     }, 100); // Short delay
    //   }
    // });

    // socket.on('disconnect', (reason) => {
    //   console.log('WebSocket disconnected:', reason);
    //   // Handle disconnect - maybe show a message or attempt reconnect (Socket.IO does this by default)
    //   if (gameState === 'playing') {
    //     // If game is ongoing and socket disconnects, it's likely an issue
    //     setGameState('finished');
    //     alert('Game Over! Connection to backend lost.');
    //   }
    // });

    // socket.on('connect_error', (err) => {
    //   console.error('WebSocket connection error:', err);
    //   // Handle connection errors
    //   if (gameState === 'playing') {
    //     setGameState('finished'); // End game if connection fails
    //     alert('Game Over! Failed to connect to backend.');
    //   }
    // });
  };

  // Handles user pressing an arrow key during the game
  const handleArrowKeyPress = (key: string) => {
    if (gameState !== 'playing') return; // Only process input when playing

    if (key === sequence[sequenceIndex]) {
      // Correct key pressed!
      console.log('Correct key!');
      setPoints(prevPoints => {
        const newPoints = prevPoints + 1;
        // Check if user won
        if (newPoints >= 50) {
          setGameState('finished');
          alert(`You Win! You reached 50 points! Kubernetes replicas: ${replicaCount}`);
          // socketRef.current?.disconnect(); // Disconnect WebSocket
        }
        return newPoints;
      });

      setSequenceIndex(prevIndex => {
        const nextIndex = prevIndex + 1;
        if (nextIndex === sequence.length) {
          // Completed the current sequence, generate a new one
          const newSeqLength = Math.min(sequence.length + 1, 15); // Gradually increase difficulty up to 15 keys
          const newSequence = generateSequence(newSeqLength);
          setSequence(newSequence);
          return 0; // Reset index for the new sequence
        }
        return nextIndex;
      });

    } else {
      // Incorrect key pressed - handle failure
      console.log('Incorrect key!');
      // Optional: Penalize points, reset sequence, etc.
      // For simplicity, we'll just reset the sequence progress here
      setSequenceIndex(0);
      // setPoints(prevPoints => Math.max(0, prevPoints - 1)); // Example penalty
    }
  };

  // --- Effect Hook for Event Listeners ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (gameState === 'idle' && event.key === 'Enter') {
        startGame();
      } else if (gameState === 'playing' && ARROW_KEYS.includes(event.key)) {
        handleArrowKeyPress(event.key);
      }
    };

    // Add the global keydown listener
    window.addEventListener('keydown', handleKeyDown);

    // Clean up event listener and WebSocket connection on component unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // if (socketRef.current) {
      //   socketRef.current.disconnect();
      //   socketRef.current = null; // Clear the ref
      // }
    };
  }, [gameState, sequence, sequenceIndex, points, replicaCount]); // Dependencies for useEffect

  // Effect to ensure socket is disconnected if game state changes to finished by other means
  useEffect(() => {
    if (gameState === 'finished'
      // && socketRef.current
    ) {
      console.log("Game finished, ensuring socket is disconnected.");
      // socketRef.current.disconnect();
      // socketRef.current = null;
    }
  }, [gameState]);


  // --- Rendered UI ---
  return (
    <div style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '20px' }}>
      <h1>Kubernetes Scaling Race Game</h1>

      {gameState === 'idle' && (
        <div style={{ marginTop: '50px' }}>
          <p style={{ fontSize: '4em' }}>Press **Enter** to start the race!</p>
          <p>Compete against Kubernetes scaling!</p>
        </div>
      )}

      {gameState === 'playing' && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            {/* Player Info */}
            <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', minWidth: '200px' }}>
              <h2 style={{fontSize: '2em'}}>Your Points: <span style={{ color: 'green' }}>{points}</span> / 50</h2>
              <p>Press the sequence:</p>
              <div style={{ minHeight: '1.5em' }}> {/* Reserve space */}
                {sequence.map((key, index) => (
                  <span
                    key={index}
                    style={{
                      marginRight: '8px',
                      fontWeight: index === sequenceIndex ? 'bold' : 'normal',
                      color: index < sequenceIndex ? 'green' : (index === sequenceIndex ? 'blue' : 'black'),
                      fontSize: '4em'
                    }}
                  >
                    {/* Display arrow symbols or text */}
                    {key === 'ArrowUp' && '↑'}
                    {key === 'ArrowDown' && '↓'}
                    {key === 'ArrowLeft' && '←'}
                    {key === 'ArrowRight' && '→'}
                    {/* Or use text: {key.replace('Arrow', '')} */}
                  </span>
                ))}
              </div>
            </div>

            {/* Kubernetes Info */}
            <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', minWidth: '200px', backgroundColor: replicaCount >= 50 ? '#fdd' : 'transparent' }}>
              <h2>Kubernetes Replicas: <span style={{ color: replicaCount >= 50 ? 'red' : 'orange' }}>{replicaCount}</span> / 50</h2>
              {replicaCount < 50 && <p>Scaling...</p>}
              {replicaCount >= 50 && <p style={{ color: 'red', fontWeight: 'bold' }}>Scale Up Complete!</p>}
            </div>
          </div>

          {/* Game Status / Win/Loss Message */}
          {points >= 50 && ( // Show temporary message before alert
            <p style={{ color: 'green', fontWeight: 'bold', fontSize: '1.5em', marginTop: '20px' }}>
              You reached 50 points! Waiting for final K8s count...
            </p>
          )}

        </div>
      )}

      {gameState === 'finished' && (
        <div style={{ marginTop: '50px' }}>
          <h2>Game Over!</h2>
          <p style={{ fontSize: '1.2em' }}>Your final score: <span style={{ fontWeight: 'bold' }}>{points}</span></p>
          <p style={{ fontSize: '1.2em' }}>Final Kubernetes replicas: <span style={{ fontWeight: 'bold' }}>{replicaCount}</span></p>
          <button
            onClick={() => setGameState('idle')}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              fontSize: '1em',
              cursor: 'pointer',
              borderRadius: '5px',
              border: 'none',
              backgroundColor: '#0070f3',
              color: 'white'
            }}
          >
            Play Again?
          </button>
        </div>
      )}

      {/* Basic Instructions */}
      <div style={{ marginTop: '40px', fontSize: '0.9em', color: '#555' }}>
        <p>Instructions: Press the arrow keys (↑, ↓, ←, →) in the order shown to gain points.</p>
        <p>Race to 50 points before Kubernetes scales the target application to 50 replicas!</p>
      </div>
    </div>
  );
}
