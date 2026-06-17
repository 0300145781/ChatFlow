"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { SmilePlus, Plus } from "lucide-react";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";
import { triggerEmojiConfetti } from "../../lib/confetti";

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  isActive?: boolean;
  isMine?: boolean;
}

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢"];

export default function ReactionPicker({ onSelect, isActive = false, isMine = false }: ReactionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowFullPicker(false);
      }
    };
    if (isOpen || showFullPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, showFullPicker]);

  const handleEmojiSelect = (emoji: string, e: React.MouseEvent) => {
    triggerEmojiConfetti(emoji, e.clientX, e.clientY);
    onSelect(emoji);
    setIsOpen(false);
    setShowFullPicker(false);
  };

  const handleFullEmojiClick = (emojiData: EmojiClickData, e: MouseEvent) => {
    triggerEmojiConfetti(emojiData.emoji, e.clientX, e.clientY);
    onSelect(emojiData.emoji);
    setIsOpen(false);
    setShowFullPicker(false);
  };

  return (
    <div className="relative flex items-center" ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
          setShowFullPicker(false);
        }}
        className={`w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all ${
          isOpen || showFullPicker || isActive ? "opacity-100 bg-black/5 dark:bg-white/5" : "opacity-0 md:group-hover:opacity-100"
        }`}
        title="Add reaction"
      >
        <SmilePlus className="w-4 h-4" />
      </button>

      {isOpen && !showFullPicker && (
        <div className={`absolute ${isMine ? 'right-0' : 'left-0'} bottom-full mb-2 flex items-center gap-1 bg-white/60 dark:bg-[#202020]/60 backdrop-blur-md rounded-full px-2 py-1.5 shadow-xl border border-white/20 dark:border-white/10 animate-in fade-in zoom-in-95 duration-150 z-50`}>
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={(e) => handleEmojiSelect(emoji, e)}
              className="w-8 h-8 flex items-center justify-center text-lg hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-transform hover:scale-125 active:scale-95"
            >
              {emoji}
            </button>
          ))}
          <div className="w-px h-5 bg-border/50 mx-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowFullPicker(true);
            }}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-transform hover:scale-125 active:scale-95"
            title="More emojis"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      {showFullPicker && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              setShowFullPicker(false);
            }}
          />
          <div className="relative w-[320px] sm:w-[360px] h-[480px] sm:h-[520px] max-h-[85vh] bg-white/60 dark:bg-[#202020]/60 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden">
            <EmojiPicker 
              onEmojiClick={handleFullEmojiClick}
              theme={Theme.AUTO}
              searchDisabled={false}
              skinTonesDisabled
              previewConfig={{ showPreview: false }}
              width="100%"
              height="100%"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
