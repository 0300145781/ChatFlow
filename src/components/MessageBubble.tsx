import React, { memo } from "react";
import { motion } from "framer-motion";
import { Eraser, CheckCheck, Check } from "lucide-react";
import { Message } from "../types";
import AudioPlayer from "./AudioPlayer";
import EncryptedMedia from "./EncryptedMedia";
import ReactionPicker from "./ReactionPicker";
import MessageOptions from "./MessageOptions";

interface MessageBubbleProps {
  msg: Message;
  currentUserId: string;
  isMine: boolean;
  activeMessageId: string | null;
  e2eKeysRef: React.MutableRefObject<any>;
  setActiveReply: (msg: Message) => void;
  setActiveMessageId: (id: string | null) => void;
  handleReaction: (msg: Message, emoji: string) => void;
  handleDeleteForMe: (msg: Message) => void;
  handleDeleteForEveryone: (msg: Message) => void;
  formatTime: (dateStr: string) => string;
}

const MessageBubble = memo(({
  msg,
  currentUserId,
  isMine,
  activeMessageId,
  e2eKeysRef,
  setActiveReply,
  setActiveMessageId,
  handleReaction,
  handleDeleteForMe,
  handleDeleteForEveryone,
  formatTime,
}: MessageBubbleProps) => {
  return (
    <div className={`flex w-full group ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`flex flex-col gap-1 w-full max-w-[70%] ${isMine ? "items-end" : "items-start"}`}>
        <div className={`flex items-center gap-2 w-full ${isMine ? "flex-row-reverse" : "flex-row"}`}>
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, info) => {
              if (Math.abs(info.offset.x) > 50) setActiveReply(msg);
            }}
            onDoubleClick={() => setActiveReply(msg)}
            onClick={(e) => {
              e.stopPropagation();
              setActiveMessageId(activeMessageId === msg.id ? null : msg.id);
            }}
            className={`relative flex flex-col text-[15px] leading-relaxed transition-all touch-pan-y ${
              msg.is_deleted
                ? "px-5 py-3 bg-black/5 dark:bg-white/5 text-muted-foreground italic rounded-3xl border border-dashed border-border shadow-none"
                : msg.decryptionFailed
                ? "px-5 py-3 bg-red-50 dark:bg-red-950/20 text-red-500/80 dark:text-red-400/80 text-sm italic rounded-3xl border border-dashed border-red-200 dark:border-red-900 shadow-none"
                : isMine
                ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-3xl rounded-br-sm shadow-md"
                : "bg-white dark:bg-[#202020] text-foreground rounded-3xl rounded-bl-sm shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] border border-border"
            }`}
          >
            {!msg.is_deleted && msg.reply_to && (
              <div className={`mt-1.5 mx-1.5 mb-2 px-3 py-2 text-sm rounded-2xl border-l-4 ${
                isMine ? "bg-black/10 border-white/40 text-white/90" : "bg-black/5 dark:bg-white/5 border-primary/40 text-muted-foreground"
              }`}>
                <div className="font-semibold text-xs mb-0.5 opacity-80">
                  {msg.reply_to.sender_id === currentUserId ? "You" : "Friend"}
                </div>
                <div className="line-clamp-2 text-xs opacity-90">
                  {msg.reply_to.is_deleted 
                    ? "This message was deleted" 
                    : msg.reply_to.decryptionFailed
                    ? "🔒 Encrypted (Key missing)"
                    : msg.reply_to.type === "audio" 
                    ? "🎤 Audio Message" 
                    : msg.reply_to.type === "image"
                    ? "📷 Image"
                    : msg.reply_to.content}
                </div>
              </div>
            )}

            <div className={`px-5 ${!msg.is_deleted && msg.reply_to ? "pb-3 pt-1" : "py-3"}`}>
              {(msg.sender_id === '00000000-0000-0000-0000-000000000000' || msg.is_ai) && (!isMine || msg.is_ai) && (
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400 mb-1 flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center">✨</span>
                  Groq AI
                </div>
              )}
              {msg.is_deleted ? (
                <span className="flex items-center gap-2 opacity-80 text-sm">
                  <Eraser className="w-4 h-4" />
                  This message was deleted
                </span>
              ) : msg.type === "audio" ? (
                <AudioPlayer src={msg.content} />
              ) : msg.type === "image" ? (
                <div className="-mx-3 -my-1">
                  <EncryptedMedia message={msg} e2eKeysRef={e2eKeysRef} currentUserId={currentUserId} />
                </div>
              ) : (
                msg.content
              )}
            </div>
          </motion.div>

          {!msg.is_deleted && (
            <div className="flex items-center gap-1 shrink-0">
              <ReactionPicker 
                onSelect={(emoji) => handleReaction(msg, emoji)} 
                isActive={activeMessageId === msg.id}
                isMine={isMine}
              />
              <MessageOptions 
                isMine={isMine} 
                isActive={activeMessageId === msg.id}
                onDeleteForMe={() => handleDeleteForMe(msg)}
                onDeleteForEveryone={() => handleDeleteForEveryone(msg)}
                onReply={() => setActiveReply(msg)}
              />
            </div>
          )}
        </div>

        {!msg.is_deleted && msg.reactions && msg.reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 ${isMine ? "justify-end mr-4" : "justify-start ml-4"}`}>
            {Object.entries(
              msg.reactions.reduce((acc, curr) => {
                acc[curr.emoji] = (acc[curr.emoji] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([emoji, count]) => {
              const iReacted = msg.reactions?.some(r => r.user_id === currentUserId && r.emoji === emoji);
              return (
                <button
                  key={emoji}
                  onClick={() => handleReaction(msg, emoji)}
                  aria-label={`Reacted with ${emoji} by ${count} ${count === 1 ? 'person' : 'people'}`}
                  className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all ${
                    iReacted 
                      ? "bg-primary/10 border-primary/20 text-primary" 
                      : "bg-white dark:bg-[#202020] border-border text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <span>{emoji}</span>
                  {count > 1 && <span>{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${isMine ? "mr-2" : "ml-2"}`}>
          {formatTime(msg.created_at)}
          {isMine && !msg.is_deleted && (
            msg.read_at ? (
              <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
            ) : (
              <Check className="w-3.5 h-3.5 opacity-70" />
            )
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to minimize re-renders
  // Note: activeMessageId changes only re-render if this message IS the active one or WAS the active one
  const isActiveChange = (prevProps.activeMessageId === prevProps.msg.id) !== (nextProps.activeMessageId === nextProps.msg.id);
  
  return (
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.msg.content === nextProps.msg.content &&
    prevProps.msg.is_deleted === nextProps.msg.is_deleted &&
    prevProps.msg.read_at === nextProps.msg.read_at &&
    prevProps.msg.reactions?.length === nextProps.msg.reactions?.length &&
    !isActiveChange
  );
});

MessageBubble.displayName = "MessageBubble";

export default MessageBubble;
