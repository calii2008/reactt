import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_WIDTH = SCREEN_WIDTH;
const GAME_HEIGHT = SCREEN_HEIGHT * 0.96;
const GROUND_HEIGHT = 70;
const GROUND_Y = GAME_HEIGHT - GROUND_HEIGHT;
const PLAYER_SIZE = 30;
const PLAYER_X = 70;
const PLAYER_START_Y = GROUND_Y - PLAYER_SIZE;
const GRAVITY = 1600;
const JUMP_FORCE = -620;
const STORAGE_KEY = 'neon-jump-best-score';

function loadBestScore() {
  if (typeof window === 'undefined' || !window.localStorage) return 0;

  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY) || '0');
    return Number.isFinite(saved) ? saved : 0;
  } catch (error) {
    return 0;
  }
}

function saveBestScore(value) {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch (error) {
    // ignore storage failures
  }
}

export default function MainScreen() {
  const [phase, setPhase] = useState('start');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(loadBestScore());
  const [soundOn, setSoundOn] = useState(true);
  const [playerY, setPlayerY] = useState(PLAYER_START_Y);
  const [obstacles, setObstacles] = useState([]);

  const playerYRef = useRef(PLAYER_START_Y);
  const velocityRef = useRef(0);
  const scoreRef = useRef(0);
  const obstaclesRef = useRef([]);
  const spawnTimerRef = useRef(0);
  const animationFrameRef = useRef(null);
  const audioContextRef = useRef(null);
  const phaseRef = useRef('start');
  const bestScoreRef = useRef(bestScore);

  useEffect(() => {
    bestScoreRef.current = bestScore;
  }, [bestScore]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault();
        handleJump();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const playTone = (type) => {
    if (!soundOn || typeof window === 'undefined') return;

    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtor();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.type = type === 'jump' ? 'square' : 'sawtooth';
      oscillator.frequency.setValueAtTime(type === 'jump' ? 640 : 220, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.18);
    } catch (error) {
      // ignore audio errors
    }
  };

  const updateBest = (value) => {
    const nextBest = Math.max(bestScoreRef.current, value);
    bestScoreRef.current = nextBest;
    setBestScore(nextBest);
    saveBestScore(nextBest);
  };

  const startGame = () => {
    velocityRef.current = 0;
    playerYRef.current = PLAYER_START_Y;
    scoreRef.current = 0;
    spawnTimerRef.current = 0;
    obstaclesRef.current = [];
    setPlayerY(PLAYER_START_Y);
    setScore(0);
    setObstacles([]);
    setPhase('playing');
    playTone('jump');
  };

  const endGame = () => {
    if (phaseRef.current !== 'playing') return;

    cancelAnimationFrame(animationFrameRef.current);
    setPhase('gameover');
    updateBest(Math.floor(scoreRef.current));
    playTone('hit');
  };

  const handleJump = () => {
    if (phase === 'start' || phase === 'gameover') {
      startGame();
      return;
    }

    if (phase !== 'playing') return;

    if (playerYRef.current >= PLAYER_START_Y - 2) {
      velocityRef.current = JUMP_FORCE;
      playTone('jump');
    }
  };

  useEffect(() => {
    if (phase !== 'playing') return;

    let lastTimestamp = 0;

    const tick = (timestamp) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.033);
      lastTimestamp = timestamp;

      let nextVelocity = velocityRef.current + GRAVITY * delta;
      let nextPlayerY = playerYRef.current + nextVelocity * delta;

      if (nextPlayerY >= PLAYER_START_Y) {
        nextPlayerY = PLAYER_START_Y;
        nextVelocity = 0;
      }

      velocityRef.current = nextVelocity;
      playerYRef.current = nextPlayerY;
      setPlayerY(nextPlayerY);

      const nextSpeed = 290 + scoreRef.current * 1.3;
      scoreRef.current += delta * 19;
      const roundedScore = Math.floor(scoreRef.current);
      setScore(roundedScore);
      updateBest(roundedScore);

      spawnTimerRef.current += delta;
      const spawnInterval = Math.max(1.1, 1.9 - roundedScore * 0.015);

      if (spawnTimerRef.current >= spawnInterval) {
        const width = 24 + Math.random() * 18;
        const height = 44 + Math.random() * 96;
        const obstacle = {
          id: Date.now() + Math.random(),
          x: GAME_WIDTH + 30,
          width,
          height,
        };

        obstaclesRef.current = [...obstaclesRef.current, obstacle];
        spawnTimerRef.current = 0;
      }

      const movedObstacles = obstaclesRef.current
        .map((item) => ({ ...item, x: item.x - nextSpeed * delta }))
        .filter((item) => item.x + item.width > -30);

      const playerRect = {
        left: PLAYER_X,
        right: PLAYER_X + PLAYER_SIZE,
        top: nextPlayerY,
        bottom: nextPlayerY + PLAYER_SIZE,
      };

      const hitObstacle = movedObstacles.some((item) => {
        const obstacleRect = {
          left: item.x,
          right: item.x + item.width,
          top: GROUND_Y - item.height,
          bottom: GROUND_Y,
        };

        return (
          playerRect.right > obstacleRect.left &&
          playerRect.left < obstacleRect.right &&
          playerRect.bottom > obstacleRect.top &&
          playerRect.top < obstacleRect.bottom
        );
      });

      if (hitObstacle) {
        endGame();
        return;
      }

      obstaclesRef.current = movedObstacles;
      setObstacles(movedObstacles);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [phase]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Pressable
        style={styles.gameArea}
        onPress={handleJump}
      >
        <View style={styles.backgroundGlowOne} />
        <View style={styles.backgroundGlowTwo} />
        <View style={styles.backgroundGlowThree} />

        <View style={styles.hud}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Score</Text>
            <Text style={styles.scoreValue}>{score}</Text>
          </View>

          <Pressable
            style={styles.soundButton}
            onPress={(event) => {
              event.stopPropagation();
              setSoundOn((prev) => !prev);
            }}
          >
            <Text style={styles.soundText}>{soundOn ? '🔊' : '🔇'}</Text>
          </Pressable>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Best</Text>
            <Text style={styles.scoreValue}>{bestScore}</Text>
          </View>
        </View>

        <View style={styles.ground} />

        {obstacles.map((obstacle) => (
          <View
            key={obstacle.id}
            style={[
              styles.obstacle,
              {
                width: obstacle.width,
                height: obstacle.height,
                left: obstacle.x,
                top: GROUND_Y - obstacle.height,
              },
            ]}
          />
        ))}

        <View
          style={[
            styles.player,
            {
              left: PLAYER_X,
              top: playerY,
            },
          ]}
        />

        {phase === 'start' && (
          <View style={styles.overlay}>
            <Text style={styles.title}>Neon Jump</Text>
            <Text style={styles.subtitle}>Tap, click, or press Space</Text>
            <Pressable style={styles.primaryButton} onPress={startGame}>
              <Text style={styles.primaryButtonText}>Play</Text>
            </Pressable>
          </View>
        )}

        {phase === 'gameover' && (
          <View style={styles.overlay}>
            <Text style={styles.title}>Game Over</Text>
            <Text style={styles.subtitle}>Score: {score}</Text>
            <Pressable style={styles.primaryButton} onPress={startGame}>
              <Text style={styles.primaryButtonText}>Restart</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050814',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameArea: {
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#090d1a',
    overflow: 'hidden',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#46d9ff55',
    shadowColor: '#00d3ff',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  backgroundGlowOne: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#3c8bff22',
    left: -70,
    top: 40,
  },
  backgroundGlowTwo: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#d949ff22',
    right: -70,
    top: 120,
  },
  backgroundGlowThree: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#ff4fb722',
    left: SCREEN_WIDTH * 0.32,
    bottom: 120,
  },
  hud: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 8,
  },
  scoreBox: {
    backgroundColor: '#0d1325cc',
    borderWidth: 1,
    borderColor: '#5ad5ff55',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 92,
    alignItems: 'center',
  },
  scoreLabel: {
    color: '#9ec4ff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  scoreValue: {
    color: '#f5f9ff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  soundButton: {
    backgroundColor: '#121c30',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ff63dfaa',
    shadowColor: '#ff63df',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  soundText: {
    fontSize: 20,
  },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: GROUND_HEIGHT,
    backgroundColor: '#111827',
    borderTopWidth: 2,
    borderTopColor: '#3ad0ff',
    shadowColor: '#3ad0ff',
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
  },
  player: {
    position: 'absolute',
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    backgroundColor: '#52d8ff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#d0f8ff',
    shadowColor: '#45d7ff',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  obstacle: {
    position: 'absolute',
    backgroundColor: '#ff5edb',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ffd1fa',
    shadowColor: '#ff57dc',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(4, 6, 15, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9,
  },
  title: {
    color: '#f1f5ff',
    fontSize: 38,
    fontWeight: '900',
    marginBottom: 12,
    textShadowColor: '#32d7ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  subtitle: {
    color: '#b7c7ff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#5b6dff',
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#9ac8ff',
    shadowColor: '#67d5ff',
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});