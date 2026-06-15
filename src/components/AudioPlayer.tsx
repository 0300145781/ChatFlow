"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";

export default function AudioPlayer({ src }: { src: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const setAudioData = () => {
      if (audio.duration === Infinity) {
        // Workaround for WebM blobs missing duration headers
        audio.currentTime = 1e101;
        const handleTimeUpdate = () => {
          audio.removeEventListener("timeupdate", handleTimeUpdate);
          setDuration(audio.duration);
          audio.currentTime = 0;
        };
        audio.addEventListener("timeupdate", handleTimeUpdate);
      } else if (!isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const setAudioEnd = () => setIsPlaying(false);
    const setAudioError = () => {
      setHasError(true);
    };

    audio.addEventListener("loadedmetadata", setAudioData);
    audio.addEventListener("timeupdate", setAudioTime);
    audio.addEventListener("ended", setAudioEnd);
    audio.addEventListener("error", setAudioError);

    if (audio.readyState > 0) {
      setAudioData();
    }

    return () => {
      audio.removeEventListener("loadedmetadata", setAudioData);
      audio.removeEventListener("timeupdate", setAudioTime);
      audio.removeEventListener("ended", setAudioEnd);
      audio.removeEventListener("error", setAudioError);
      audio.pause();
    };
  }, [src]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (hasError) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm font-medium bg-red-500/10 px-3 py-1.5 rounded-full">
        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
        Unplayable audio
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <button
        onClick={togglePlayPause}
        className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center shrink-0 hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
      >
        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
      </button>
      
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-current transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] font-medium opacity-70">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
