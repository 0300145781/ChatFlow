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
}

interface ChatInterfaceProps {
  currentUserId: string;
  contactId: string;
}

export default function ChatInterface({ currentUserId, contactId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
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

    const roomId = [currentUserId, contactId].sort().join("-");
    const topic = `room_${roomId}`;

    // Clean up any existing channel instance to prevent Strict Mode reuse errors
    supabase.getChannels().forEach((c) => {
      if (c.topic === `realtime:${topic}`) {
        supabase.removeChannel(c);
      }
    });

    // Subscribe to new messages and presence events
    const channel = supabase
      .channel(topic, {
        config: {
          presence: { key: currentUserId },
        },
      })
      .on("broadcast", { event: "new_message" }, (payload) => {
        const msg = payload.payload as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      })
      .on("broadcast", { event: "message_updated" }, (payload) => {
        const updatedMsg = payload.payload as Message;
        setMessages((prev) => 
          prev.map((msg) => msg.id === updatedMsg.id ? updatedMsg : msg)
        );
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as Message;
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
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          setMessages((prev) => 
            prev.map((msg) => msg.id === updatedMsg.id ? updatedMsg : msg)
          );
        }
      )
      .on(
        "presence",
        { event: "sync" },
        () => {
          const state = channel.presenceState();
          const contactState = state[contactId];
          if (contactState && contactState.length > 0) {
            // Sort by most recently updated to ignore stuck ghost presences
            const latestState = contactState.sort(
              (a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0)
            )[0];
            setIsTyping((latestState as any).isTyping === true);
          } else {
            setIsTyping(false);
          }
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ isTyping: false, updatedAt: Date.now() });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
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
          unreadMessages.forEach(msg => {
            channelRef.current.send({
              type: "broadcast",
              event: "message_updated",
              payload: { ...msg, read_at: now },
            });
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
      .select("*")
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
    };

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
    <div className="flex flex-col h-full bg-[#fcfcfc] dark:bg-[#111111]">
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
                      className={`relative px-5 py-3 text-[15px] leading-relaxed ${
                        msg.is_deleted
                          ? "bg-black/5 dark:bg-white/5 text-muted-foreground italic rounded-3xl border border-dashed border-border shadow-none"
                          : isMine
                          ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-3xl rounded-br-sm shadow-md"
                          : "bg-white dark:bg-[#202020] text-foreground rounded-3xl rounded-bl-sm shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] border border-border"
                      }`}
                    >
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

                    {!msg.is_deleted && (
                      <div className="flex items-center gap-1 shrink-0">
                        <ReactionPicker onSelect={(emoji) => handleReaction(msg, emoji)} />
                        <MessageOptions 
                          isMine={isMine} 
                          onDeleteForMe={() => handleDeleteForMe(msg)}
                          onDeleteForEveryone={() => handleDeleteForEveryone(msg)}
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
          className="flex items-center gap-2 max-w-4xl mx-auto"
        >
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
        </form>
      </div>
    </div>
  );
}
