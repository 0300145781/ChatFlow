"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { Send, Loader2, Eraser, Check, CheckCheck } from "lucide-react";
import AudioPlayer from "./AudioPlayer";
import MessageOptions from "./MessageOptions";
import ReactionPicker from "./ReactionPicker";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  type: string;
  created_at: string;
  is_deleted?: boolean;
  deleted_for_users?: string[];
  reactions?: { user_id: string; emoji: string }[];
  read_at?: string | null;
  reply_to_id?: string | null;
  reply_to?: Message | null;
}

interface ChatInterfaceProps {
  currentUserId: string;
  contactId: string;
}

// Global singleton to prevent all WebSocket race conditions during React unmounts
let sharedChannel: any = null;
type Listener = (event: string, payload: any) => void;
const listeners = new Set<Listener>();

export default function ChatInterface({ currentUserId, contactId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("CONNECTING");
  const [activeReply, setActiveReply] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    fetchMessages();

    // Initialize the global WebSocket channel EXACTLY ONCE for the entire application lifecycle
    if (!sharedChannel) {
      sharedChannel = supabase
        .channel("global_chat_sync", {
          config: {
            broadcast: { ack: true },
            presence: { key: currentUserId },
          },
        })
        .on("broadcast", { event: "new_message" }, (p) => {
          listeners.forEach((l) => l("new_message", p.payload));
        })
        .on("broadcast", { event: "message_updated" }, (p) => {
          listeners.forEach((l) => l("message_updated", p.payload));
        })
        .on("broadcast", { event: "messages_read" }, (p) => {
          listeners.forEach((l) => l("messages_read", p.payload));
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
          listeners.forEach((l) => l("pg_insert", p.new));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (p) => {
          listeners.forEach((l) => l("pg_update", p.new));
        })
        .on("presence", { event: "sync" }, () => {
          listeners.forEach((l) => l("presence_sync", sharedChannel.presenceState()));
        });

      sharedChannel.subscribe((status: string) => {
        listeners.forEach((l) => l("status", status));
      });
    }

    channelRef.current = sharedChannel;

    // Attach this specific chat room's React state to the global listener hub
    const listener: Listener = (event, payload) => {
      if (event === "status") {
        setConnectionStatus(payload);
        if (payload === "SUBSCRIBED" && sharedChannel) {
          sharedChannel.track({ isTyping: false, updatedAt: Date.now() });
        }
      }
      
      if (event === "new_message" || event === "pg_insert") {
        const msg = payload as Message;
        // Only accept messages belonging to this exact chat room
        if (
          (msg.sender_id === currentUserId && msg.receiver_id === contactId) ||
          (msg.sender_id === contactId && msg.receiver_id === currentUserId)
        ) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      }

      if (event === "message_updated" || event === "pg_update") {
        const msg = payload as Message;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }

      if (event === "messages_read") {
        const { messageIds, read_at } = payload;
        setMessages((prev) => 
          prev.map((m) => messageIds.includes(m.id) ? { ...m, read_at } : m)
        );
      }

      if (event === "presence_sync") {
        const state = payload;
        const contactState = state[contactId];
        if (contactState && contactState.length > 0) {
          const latestState = contactState.sort(
            (a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0)
          )[0];
          setIsTyping((latestState as any).isTyping === true);
        } else {
          setIsTyping(false);
        }
      }
    };

    listeners.add(listener);

    // If already connected from a previous chat, pull the status instantly
    if (sharedChannel.state === "joined") {
      setConnectionStatus("SUBSCRIBED");
      sharedChannel.track({ isTyping: false, updatedAt: Date.now() });
    }

    return () => {
      // Cleanly detach the React state, but NEVER kill the WebSocket
      listeners.delete(listener);
    };
  }, [contactId, currentUserId]);

  useEffect(() => {
    if (!messages.length || !contactId) return;

    const unreadMessages = messages.filter(
      (msg) => msg.receiver_id === currentUserId && !msg.read_at && !msg.is_deleted
    );

    if (unreadMessages.length > 0) {
      const markAsRead = async () => {
        const messageIds = unreadMessages.map((m) => m.id);
        const now = new Date().toISOString();
        
        setMessages((prev) => 
          prev.map((msg) => 
            messageIds.includes(msg.id) ? { ...msg, read_at: now } : msg
          )
        );

        if (channelRef.current) {
          // Send ONE bulk broadcast to avoid hitting the 10 msg/sec rate limit
          channelRef.current.send({
            type: "broadcast",
            event: "messages_read",
            payload: { messageIds, read_at: now },
          });
        }

        await supabase
          .from("messages")
          .update({ read_at: now })
          .in("id", messageIds);
      };

      markAsRead();
    }
  }, [messages, currentUserId, contactId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*, reply_to:messages!reply_to_id(*)")
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: true });

    if (data) setMessages(data);
    setLoading(false);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    // Send stop typing presence instantly
    if (channelRef.current) {
      channelRef.current.track({ isTyping: false, updatedAt: Date.now() });
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }

    setSending(true);
    const tempContent = newMessage.trim();
    setNewMessage("");

    const tempId = crypto.randomUUID();
    const tempMessage: Message = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: contactId,
      content: tempContent,
      type: "text",
      created_at: new Date().toISOString(),
      reply_to_id: activeReply?.id || null,
      reply_to: activeReply,
    };

    // Clear reply state
    setActiveReply(null);

    // Optimistic UI update (Sender instantly sees it)
    setMessages((prev) => [...prev, tempMessage]);

    // Broadcast instantly to receiver
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "new_message",
        payload: tempMessage,
      });
    }

    const { error } = await supabase.from("messages").insert([
      {
        id: tempId,
        sender_id: currentUserId,
        receiver_id: contactId,
        content: tempContent,
        type: "text",
        reply_to_id: tempMessage.reply_to_id,
      },
    ]);

    if (error) {
      console.error("Error sending message:", error);
      // Revert input on failure
      setMessages((prev) => prev.filter(m => m.id !== tempId));
      setNewMessage(tempContent);
    }
    setSending(false);
  };

  const handleDeleteForMe = async (message: Message) => {
    // Optimistic update locally
    setMessages(prev => prev.filter(m => m.id !== message.id));
    
    const newDeletedFor = [...(message.deleted_for_users || []), currentUserId];
    await supabase
      .from("messages")
      .update({ deleted_for_users: newDeletedFor })
      .eq("id", message.id);
  };

  const handleDeleteForEveryone = async (message: Message) => {
    const updatedMsg = { ...message, is_deleted: true, content: "This message was deleted" };
    
    // Optimistic update locally
    setMessages(prev => prev.map(m => m.id === message.id ? updatedMsg : m));
    
    // Broadcast
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "message_updated",
        payload: updatedMsg,
      });
    }

    await supabase
      .from("messages")
      .update({ is_deleted: true, content: "This message was deleted" })
      .eq("id", message.id);
  };

  const handleReaction = async (message: Message, emoji: string) => {
    const currentReactions = message.reactions || [];
    const existingIndex = currentReactions.findIndex(
      (r) => r.user_id === currentUserId && r.emoji === emoji
    );

    let newReactions = [...currentReactions];

    if (existingIndex > -1) {
      newReactions.splice(existingIndex, 1);
    } else {
      newReactions.push({ user_id: currentUserId, emoji });
    }

    const updatedMsg = { ...message, reactions: newReactions };

    setMessages((prev) => prev.map((msg) => msg.id === message.id ? updatedMsg : msg));

    // Broadcast
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "message_updated",
        payload: updatedMsg,
      });
    }

    await supabase
      .from("messages")
      .update({ reactions: newReactions })
      .eq("id", message.id);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#fcfcfc] dark:bg-[#111111] relative">
      {/* WebSocket Debug Indicator (Temporary) */}
      {connectionStatus !== "SUBSCRIBED" && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-lg font-bold">
          SOCKET: {connectionStatus}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages yet. Say hi!
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === currentUserId;
            // Hide message if deleted for this user
            if (msg.deleted_for_users?.includes(currentUserId)) return null;

            return (
              <div
                key={msg.id}
                className={`flex w-full group ${
                  isMine ? "justify-end" : "justify-start"
                }`}
              >
                <div className={`flex flex-col gap-1 w-full max-w-[70%] ${isMine ? "items-end" : "items-start"}`}>
                  <div className={`flex items-center gap-2 w-full ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                    <div
                      onDoubleClick={() => setActiveReply(msg)}
                      className={`relative flex flex-col text-[15px] leading-relaxed transition-all ${
                        msg.is_deleted
                          ? "px-5 py-3 bg-black/5 dark:bg-white/5 text-muted-foreground italic rounded-3xl border border-dashed border-border shadow-none"
                          : isMine
                          ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-3xl rounded-br-sm shadow-md"
                          : "bg-white dark:bg-[#202020] text-foreground rounded-3xl rounded-bl-sm shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] border border-border"
                      }`}
                    >
                      {!msg.is_deleted && msg.reply_to && (
                        <div className={`mt-1.5 mx-1.5 mb-2 px-3 py-2 text-sm rounded-2xl border-l-4 ${
                          isMine 
                            ? "bg-black/10 border-white/40 text-white/90" 
                            : "bg-black/5 dark:bg-white/5 border-primary/40 text-muted-foreground"
                        }`}>
                          <div className="font-semibold text-xs mb-0.5 opacity-80">
                            {msg.reply_to.sender_id === currentUserId ? "You" : "Friend"}
                          </div>
                          <div className="line-clamp-2 text-xs opacity-90">
                            {msg.reply_to.is_deleted 
                              ? "This message was deleted" 
                              : msg.reply_to.type === "audio" 
                              ? "🎤 Audio Message" 
                              : msg.reply_to.content}
                          </div>
                        </div>
                      )}

                      <div className={`px-5 ${!msg.is_deleted && msg.reply_to ? "pb-3 pt-1" : "py-3"}`}>
                        {msg.is_deleted ? (
                          <span className="flex items-center gap-2 opacity-80 text-sm">
                            <Eraser className="w-4 h-4" />
                            This message was deleted
                          </span>
                        ) : msg.type === "audio" ? (
                          <AudioPlayer src={msg.content} />
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>

                    {!msg.is_deleted && (
                      <div className="flex items-center gap-1 shrink-0">
                        <ReactionPicker onSelect={(emoji) => handleReaction(msg, emoji)} />
                        <MessageOptions 
                          isMine={isMine} 
                          onDeleteForMe={() => handleDeleteForMe(msg)}
                          onDeleteForEveryone={() => handleDeleteForEveryone(msg)}
                          onReply={() => setActiveReply(msg)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Reactions Cluster */}
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

                  {/* Timestamp and Read Receipts */}
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
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white dark:bg-[#151515] border-t border-border relative">
        {/* Presence Typing Indicator */}
        <div 
          className={`absolute -top-7 left-6 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-all duration-300 ${
            isTyping ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
          }`}
        >
          Friend is typing
          <span className="flex gap-0.5">
            <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>

        <form
          onSubmit={sendMessage}
          className="flex flex-col gap-2 max-w-4xl mx-auto w-full"
        >
          <AnimatePresence>
            {activeReply && (
              <motion.div
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: 10, height: 0 }}
                className="w-full px-2 overflow-hidden"
              >
                <div className="bg-black/5 dark:bg-white/5 border border-border rounded-2xl p-3 flex items-start gap-3 backdrop-blur-sm relative group">
                  <div className="w-1 h-full absolute left-0 top-0 bg-primary/50 rounded-l-2xl" />
                  <div className="flex-1 min-w-0 pl-1">
                    <div className="text-xs font-semibold text-primary/80 mb-1">
                      Replying to {activeReply.sender_id === currentUserId ? "yourself" : "friend"}
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-1">
                      {activeReply.is_deleted 
                        ? "This message was deleted" 
                        : activeReply.type === "audio" 
                        ? "🎤 Audio Message" 
                        : activeReply.content}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveReply(null)}
                    className="w-6 h-6 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors shrink-0"
                  >
                    <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 w-full">
            <input
              type="text"
              className="flex-1 bg-input border border-border rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-[15px]"
              placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => {
              const val = e.target.value;
              setNewMessage(val);

              if (channelRef.current) {
                if (val.trim() === "") {
                  channelRef.current.track({ isTyping: false, updatedAt: Date.now() });
                  if (typingTimeoutRef.current) {
                    clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = null;
                  }
                  return;
                }

                if (!typingTimeoutRef.current) {
                  channelRef.current.track({ isTyping: true, updatedAt: Date.now() });
                }

                if (typingTimeoutRef.current) {
                  clearTimeout(typingTimeoutRef.current);
                }

                typingTimeoutRef.current = setTimeout(() => {
                  if (channelRef.current) {
                    channelRef.current.track({ isTyping: false, updatedAt: Date.now() });
                  }
                  typingTimeoutRef.current = null;
                }, 2000);
              }
            }}
            onBlur={() => {
              if (channelRef.current) {
                channelRef.current.track({ isTyping: false, updatedAt: Date.now() });
                if (typingTimeoutRef.current) {
                  clearTimeout(typingTimeoutRef.current);
                  typingTimeoutRef.current = null;
                }
              }
            }}
          />
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 hover:opacity-90 active:scale-95 transition-all shrink-0"
            >
              <Send className="w-5 h-5 ml-1" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
