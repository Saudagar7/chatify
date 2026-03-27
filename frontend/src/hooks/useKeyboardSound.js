import { useCallback, useEffect, useRef } from "react";

const FREQUENCIES = [220, 240, 260, 280, 300, 320];

function useKeyboardSound() {
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);

  const ensureAudioGraph = () => {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    if (!gainNodeRef.current) {
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0.08;
      gainNode.connect(audioContextRef.current.destination);
      gainNodeRef.current = gainNode;
    }
  };

  const playRandomKeyStrokeSound = useCallback(() => {
    ensureAudioGraph();
    const audioCtx = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    if (!audioCtx || !gainNode) return;

    const oscillator = audioCtx.createOscillator();
    oscillator.type = "square";
    const baseFrequency = FREQUENCIES[Math.floor(Math.random() * FREQUENCIES.length)];
    oscillator.frequency.value = baseFrequency + Math.random() * 20 - 10;

    oscillator.connect(gainNode);
    const now = audioCtx.currentTime;
    oscillator.start(now);
    oscillator.stop(now + 0.07);
  }, []);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        gainNodeRef.current = null;
      }
    };
  }, []);

  return { playRandomKeyStrokeSound };
}

export default useKeyboardSound;
