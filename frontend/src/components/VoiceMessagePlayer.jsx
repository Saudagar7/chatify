import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration } from "../lib/time";

const SAMPLE_BARS = 48;

const generateFallbackBars = (key = "fallback") => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const bars = [];
  for (let i = 0; i < SAMPLE_BARS; i += 1) {
    const val = Math.abs(Math.sin(hash + i * 13.37)) * 0.6 + 0.2;
    bars.push(Math.min(1, Math.max(0.15, val)) * 100);
  }
  return bars;
};

const extractWaveform = async (src, signal) => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error("AudioContext unsupported");
  const response = await fetch(src, { signal });
  const arrayBuffer = await response.arrayBuffer();
  const audioCtx = new AudioCtx();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  const rawData = audioBuffer.getChannelData(0);
  const blockSize = Math.floor(rawData.length / SAMPLE_BARS) || 1;
  const waveform = [];
  for (let i = 0; i < SAMPLE_BARS; i += 1) {
    let sum = 0;
    for (let j = 0; j < blockSize; j += 1) {
      const dataIndex = i * blockSize + j;
      sum += Math.abs(rawData[dataIndex] || 0);
    }
    waveform.push(sum / blockSize);
  }
  const max = Math.max(...waveform, 1) || 1;
  audioCtx.close();
  return waveform.map((value) => Math.max(0.15, (value / max) * 0.95) * 100);
};

const intentTokens = {
  light: {
    idle: "rgba(255,255,255,0.45)",
    active: "rgba(255,255,255,0.95)",
    text: "rgba(255,255,255,0.85)",
    knob: "rgba(15,23,42,0.2)",
  },
  dark: {
    idle: "rgba(45,212,191,0.35)",
    active: "rgba(34,211,238,0.95)",
    text: "rgba(226,232,240,0.85)",
    knob: "rgba(15,23,42,0.35)",
  },
};

function VoiceMessagePlayer({ src, duration, intent = "dark" }) {
  const tokens = intentTokens[intent] || intentTokens.dark;
  const audioRef = useRef(null);
  const rafRef = useRef(null);
  const [bars, setBars] = useState(() => generateFallbackBars(src || ""));
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [computedDuration, setComputedDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = "auto";
    audio.src = src;

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };
    const handleLoaded = () => {
      if (!duration) {
        setComputedDuration(Math.round(audio.duration || 0));
      }
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoaded);

    return () => {
      audio.pause();
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoaded);
    };
  }, [src, duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const handleTimeUpdate = () => {
      if (!audio.duration) return;
      setProgress(audio.currentTime / audio.duration);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, []);

  useEffect(() => {
    if (!src) return () => {};
    if (typeof AbortController === "undefined") {
      extractWaveform(src)
        .then((waveform) => setBars(waveform))
        .catch(() => setBars(generateFallbackBars(src)));
      return () => {};
    }
    const controller = new AbortController();
    extractWaveform(src, controller.signal)
      .then((waveform) => setBars(waveform))
      .catch(() => setBars(generateFallbackBars(src)));
    return () => controller.abort();
  }, [src]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return () => {};
    }
    const sync = () => {
      const audio = audioRef.current;
      if (audio && audio.duration) {
        setProgress(audio.currentTime / audio.duration);
      }
      rafRef.current = requestAnimationFrame(sync);
    };
    rafRef.current = requestAnimationFrame(sync);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  const handleTogglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    try {
      await audio.play();
      setIsPlaying(true);
    } catch (error) {
      console.error("Unable to play audio", error);
    }
  };

  const durationLabel = useMemo(() => formatDuration(computedDuration || 0), [computedDuration]);

  return (
    <div className="flex w-full items-center gap-3">
      <button
        type="button"
        onClick={handleTogglePlay}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/40 text-slate-100 transition hover:bg-slate-900/70"
        style={{ boxShadow: "0 10px 25px rgba(0,0,0,0.25)", backgroundColor: tokens.knob }}
      >
        {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
      </button>
      <div className="flex flex-1 items-center gap-3">
        <div className="flex flex-1 items-end gap-[2px] h-12">
          {bars.map((height, idx) => {
            const filled = idx / bars.length <= progress;
            return (
              <span
                key={`${idx}-${height}`}
                className="w-[3px] rounded-full"
                style={{
                  height: `${Math.max(18, height)}%`,
                  backgroundColor: filled ? tokens.active : tokens.idle,
                  transition: "background-color 0.2s ease",
                }}
              />
            );
          })}
        </div>
        <span className="text-xs font-semibold" style={{ color: tokens.text }}>
          {durationLabel}
        </span>
      </div>
    </div>
  );
}

export default VoiceMessagePlayer;
