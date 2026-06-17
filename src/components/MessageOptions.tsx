"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, Trash2, Eraser, Reply } from "lucide-react";

interface MessageOptionsProps {
  isMine: boolean;
  isActive?: boolean;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onReply: () => void;
}

export default function MessageOptions({ isMine, isActive = false, onDeleteForMe, onDeleteForEveryone, onReply }: MessageOptionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground transition-all hover:bg-black/5 dark:hover:bg-white/5 ${
          isActive || isOpen ? "opacity-100" : "opacity-0 md:group-hover:opacity-100"
        }`}
        title="Message options"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute z-10 top-8 right-0 w-48 bg-white dark:bg-[#202020] rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <button
            onClick={() => {
              setIsOpen(false);
              onReply();
            }}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <Reply className="w-4 h-4 opacity-70" />
            Reply
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              onDeleteForMe();
            }}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <Eraser className="w-4 h-4 opacity-70" />
            Delete for me
          </button>
          {isMine && (
            <button
              onClick={() => {
                setIsOpen(false);
                onDeleteForEveryone();
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4 opacity-70" />
              Delete for everyone
            </button>
          )}
        </div>
      )}
    </div>
  );
}
