import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_WIDTH = Math.min(SCREEN_WIDTH - 24, 440);
const GAME_HEIGHT = Math.min(SCREEN_HEIGHT * 0.82, 720);
const GROUND_HEIGHT = 72;
const GROUND_Y = GAME_HEIGHT - GROUND_HEIGHT;
const PLAYER_SIZE = 30;
const PLAYER_X = 70;
const PLAYER_START_Y = GROUND_Y - PLAYER_SIZE;
const GRAVITY = 1600;
const JUMP_FORCE = -620;
const STORAGE_KEY = 'neon-jump-best-score';

const STAR_POINTS = [
  { left: 26, top: 52, size: 5, opacity: 0.7 },
  { left: 120, top: 90, size: 4, opacity: 0.9 },
  { left: 200, top: 62, size: 4, opacity: 0.8 },
  { left: 280, top: 110, size: 5, opacity: 0.7 },
  { left: 335, top: 58, size: 3, opacity: 0.9 },
  { left: 380, top: 128, size: 4, opacity: 0.8 },
  { left: 68, top: 150, size: 3, opacity: 0.7 },
  { left: 168, top: 178, size: 5, opacity: 0.8 },
  { left: 250, top: 162, size: 3, opacity: 0.9 },
  { left: 360, top: 190, size: 4, opacity: 0.8 },
];

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
        <View style={styles.gameFrame}>
          <View style={styles.backgroundGlowOne} />
          <View style={styles.backgroundGlowTwo} />
          <View style={styles.backgroundGlowThree} />

          {STAR_POINTS.map((star, index) => (
            <View
              key={`star-${index}`}
              style={[
                styles.star,
                {
                  left: star.left,
                  top: star.top,
                  width: star.size,
                  height: star.size,
                  opacity: star.opacity,
                },
              ]}
            />
          ))}

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
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#040914',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  gameArea: {
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 34,
    borderWidth: 1,
    borderColor: '#5ad9ff66',
    backgroundColor: '#07111b',
    shadowColor: '#41d3ff',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    overflow: 'hidden',
  },
  gameFrame: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#060d1a',
  },
  backgroundGlowOne: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#327dff33',
    left: -60,
    top: 30,
  },
  backgroundGlowTwo: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#b63dff2e',
    right: -80,
    top: 70,
  },
  backgroundGlowThree: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#ff4ea428',
    left: 110,
    bottom: 80,
  },
  star: {
    position: 'absolute',
    backgroundColor: '#d9ecff',
    borderRadius: 999,
    shadowColor: '#9CD8FF',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  hud: {
    position: 'absolute',
    top: 18,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 8,
  },
  scoreBox: {
    backgroundColor: 'rgba(13, 20, 38, 0.8)',
    borderWidth: 1,
    borderColor: '#68d1ff77',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 88,
    alignItems: 'center',
    shadowColor: '#4cc8ff',
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  scoreLabel: {
    color: '#9ec4ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  scoreValue: {
    color: '#f4f8ff',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  soundButton: {
    backgroundColor: 'rgba(16, 19, 31, 0.8)',
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ff73e3aa',
    shadowColor: '#ff79f4',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  soundText: {
    fontSize: 19,
  },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: GROUND_HEIGHT,
    backgroundColor: '#151d2f',
    borderTopWidth: 3,
    borderTopColor: '#55d6ff',
    shadowColor: '#4ccfff',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -2 },
  },
  player: {
    position: 'absolute',
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    backgroundColor: '#6fe7ff',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#f3faff',
    shadowColor: '#69d9ff',
    shadowOpacity: 1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 0 },
  },
  obstacle: {
    position: 'absolute',
    backgroundColor: '#ff5be0',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffd8f8',
    shadowColor: '#ff5ae0',
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(4, 7, 17, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9,
  },
  title: {
    color: '#edf8ff',
    fontSize: 38,
    fontWeight: '900',
    marginBottom: 10,
    textShadowColor: '#53d8ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  subtitle: {
    color: '#c3d7ff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 22,
  },
  primaryButton: {
    backgroundColor: '#5b7cff',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#b0d1ff',
    shadowColor: '#66d5ff',
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});