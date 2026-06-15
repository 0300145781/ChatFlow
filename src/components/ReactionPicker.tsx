"use client";

import { useState, useRef, useEffect } from "react";
import { SmilePlus } from "lucide-react";

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
}

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢"];

export default function ReactionPicker({ onSelect }: ReactionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative flex items-center" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all ${
          isOpen ? "opacity-100 bg-black/5 dark:bg-white/5" : "opacity-0 group-hover:opacity-100"
        }`}
        title="Add reaction"
      >
        <SmilePlus className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 flex items-center gap-1 bg-white dark:bg-[#202020] rounded-full px-2 py-1.5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-border animate-in fade-in zoom-in-95 duration-150 z-50">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji);
                setIsOpen(false);
              }}
              className="w-8 h-8 flex items-center justify-center text-lg hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-transform hover:scale-125 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
