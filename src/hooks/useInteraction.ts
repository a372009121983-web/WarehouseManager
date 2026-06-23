import { useCallback } from 'react';

type SoundType = 'click' | 'success' | 'warning' | 'error' | 'nav' | 'delete' | 'add' | 'transfer';

const playSound = (type: SoundType) => {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    const configs: Record<SoundType, { freq: number[]; duration: number[]; type: OscillatorType; gain: number }> = {
      click: {
        freq: [800, 600],
        duration: [0.02, 0.05],
        type: 'sine',
        gain: 0.15,
      },
      nav: {
        freq: [440, 550],
        duration: [0.03, 0.06],
        type: 'sine',
        gain: 0.1,
      },
      success: {
        freq: [523, 659, 784],
        duration: [0.1, 0.1, 0.15],
        type: 'sine',
        gain: 0.2,
      },
      warning: {
        freq: [440, 330],
        duration: [0.1, 0.15],
        type: 'triangle',
        gain: 0.18,
      },
      error: {
        freq: [300, 200],
        duration: [0.1, 0.2],
        type: 'sawtooth',
        gain: 0.12,
      },
      delete: {
        freq: [400, 250, 150],
        duration: [0.05, 0.07, 0.1],
        type: 'triangle',
        gain: 0.15,
      },
      add: {
        freq: [600, 750, 900],
        duration: [0.06, 0.06, 0.1],
        type: 'sine',
        gain: 0.18,
      },
      transfer: {
        freq: [523, 587, 659, 784],
        duration: [0.08, 0.08, 0.08, 0.12],
        type: 'sine',
        gain: 0.16,
      },
    };

    const config = configs[type];
    let startTime = ctx.currentTime;

    config.freq.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = config.type;
      oscillator.frequency.setValueAtTime(freq, startTime);

      gainNode.gain.setValueAtTime(config.gain, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + config.duration[i]);

      oscillator.start(startTime);
      oscillator.stop(startTime + config.duration[i]);
      startTime += config.duration[i] * 0.8;
    });

    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Silent fail
  }
};

const triggerVibration = (pattern: number | number[]) => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silent fail
  }
};

const vibrationPatterns: Record<SoundType, number | number[]> = {
  click: [30],
  nav: [20],
  success: [50, 30, 80],
  warning: [80, 40, 80],
  error: [100, 50, 100, 50, 100],
  delete: [60, 30, 60],
  add: [40, 20, 60],
  transfer: [30, 20, 30, 20, 60],
};

export const useInteraction = () => {
  const interact = useCallback((type: SoundType = 'click') => {
    playSound(type);
    triggerVibration(vibrationPatterns[type]);
  }, []);

  return { interact };
};
