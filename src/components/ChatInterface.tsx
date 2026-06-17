"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { Send, Loader2, Eraser, Check, CheckCheck, Paperclip, User } from "lucide-react";
import AudioPlayer from "./AudioPlayer";
import MessageOptions from "./MessageOptions";
import ReactionPicker from "./ReactionPicker";
import { motion, AnimatePresence } from "framer-motion";
import { getPrivateKey, importPublicKey, deriveSharedSecret, encryptMessage, decryptMessage, encryptFile, decryptFile } from "../../lib/crypto";
import { useSettings } from "../hooks/useSettings";
import MessageBubble from "./MessageBubble";
import EncryptedMedia from "./EncryptedMedia";
import { Message } from "../types";





interface ChatInterfaceProps {
  currentUserId: string;
  contactId: string;
  currentUserPublicKey?: string | null;
  contactPublicKey?: string | null;
  blockedUsers?: string[];
  isGroup?: boolean;
}

// Global singleton to prevent all WebSocket race conditions during React unmounts
let sharedChannel: any = null;
type Listener = (event: string, payload: any) => void;
const listeners = new Set<Listener>();

export default function ChatInterface({ currentUserId, contactId, currentUserPublicKey, contactPublicKey, blockedUsers = [], isGroup = false }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("CONNECTING");
  const [activeReply, setActiveReply] = useState<Message | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const e2eKeysRef = useRef<{ mySharedSecret: CryptoKey | null, receiverSharedSecret: CryptoKey | null, groupSharedSecret: CryptoKey | null }>({ mySharedSecret: null, receiverSharedSecret: null, groupSharedSecret: null });
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [isAITyping, setIsAITyping] = useState(false);

  const { settings } = useSettings();

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    supabase.from("profiles").select("avatar_url").eq("id", currentUserId).single().then(({ data }) => {
      if (data) setMyAvatarUrl(data.avatar_url);
    });
  }, [currentUserId]);

  useEffect(() => {
    const handleGlobalClick = () => setActiveMessageId(null);
    document.addEventListener("click", handleGlobalClick);
    return () => document.removeEventListener("click", handleGlobalClick);
  }, []);

  const decryptSingleMessage = async (msg: Message) => {
    if (!msg || !msg.content) return msg;

    if (!msg.content.includes('"e2ee":true') && !msg.content.includes('"forSender":') && !msg.content.includes('"forGroup":')) {
      return msg; // Plaintext
    }
    
    if (msg.group_id) {
      if (!e2eKeysRef.current.groupSharedSecret) {
        return { ...msg, content: "🔒 Message encrypted (Group key missing)", decryptionFailed: true };
      }
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed.iv && parsed.forGroup) {
          const iv = new Uint8Array(parsed.iv);
          const decrypted = await decryptMessage(parsed.forGroup, e2eKeysRef.current.groupSharedSecret, iv);
          return { ...msg, content: decrypted, is_ai: parsed.is_ai };
        }
      } catch (e) {
        console.warn("Group decryption failed.");
      }
      return { ...msg, content: "🔒 Message encrypted (Decryption failed)", decryptionFailed: true };
    }

    if (!e2eKeysRef.current.mySharedSecret && !e2eKeysRef.current.receiverSharedSecret) {
      return { ...msg, content: "🔒 Message encrypted (Key missing from device/cache)", decryptionFailed: true };
    }

    try {
      const parsed = JSON.parse(msg.content);
      if (parsed.iv) {
        const iv = new Uint8Array(parsed.iv);
        const secret = msg.sender_id === currentUserId ? e2eKeysRef.current.mySharedSecret : e2eKeysRef.current.receiverSharedSecret;
        
        if (!secret) throw new Error("Missing shared secret");
        
        const ciphertext = msg.sender_id === currentUserId ? parsed.forSender : parsed.forReceiver;
        const decrypted = await decryptMessage(ciphertext, secret, iv);
        return { ...msg, content: decrypted, is_ai: parsed.is_ai };
      }
    } catch (e) {
      // Expected behavior if keys don't match or ciphertext is corrupted
      console.warn("Decryption failed for a message (likely due to missing/changed keys).");
    }
    
    return { ...msg, content: "🔒 Message encrypted (Key missing from device/cache)", decryptionFailed: true };
  };

  const encryptPayload = async (text: string) => {
    if (isGroup) {
      const groupSecret = e2eKeysRef.current.groupSharedSecret;
      if (!groupSecret) return text;
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const forGroup = await encryptMessage(text, groupSecret, iv);
        return JSON.stringify({ forGroup, iv: Array.from(iv), e2ee: true, isGroup: true });
      } catch (e) {
        console.error("Group encryption failed", e);
        return text;
      }
    }

    const { mySharedSecret, receiverSharedSecret } = e2eKeysRef.current;
    if (!mySharedSecret || !receiverSharedSecret) return text; // Fallback to plaintext if keys missing
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const forSender = await encryptMessage(text, mySharedSecret, iv);
      const forReceiver = await encryptMessage(text, receiverSharedSecret, iv);
      return JSON.stringify({ forSender, forReceiver, iv: Array.from(iv), e2ee: true });
    } catch (e) {
      console.error("Encryption failed", e);
      return text;
    }
  };

  const fetchMessages = async () => {
    setLoading(true);
    let query = supabase.from("messages").select("*, reply_to:messages!reply_to_id(*)");
    
    if (isGroup) {
      query = query.eq("group_id", contactId);
    } else {
      query = query.or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${currentUserId})`
      );
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (data) {
      const decryptedData = await Promise.all(data.map(async msg => {
        if (msg.reply_to) {
          msg.reply_to = await decryptSingleMessage(msg.reply_to);
        }
        return await decryptSingleMessage(msg);
      }));
      setMessages(decryptedData);
    }
    setLoading(false);
  };

  useEffect(() => {
    const initKeysAndFetch = async () => {
      try {
        const myPrivKey = await getPrivateKey(currentUserId);
        if (myPrivKey) {
          if (isGroup) {
            // Fetch group key
            const { data: keyData } = await supabase.from("group_keys").select("encrypted_key").eq("group_id", contactId).eq("user_id", currentUserId).single();
            if (keyData) {
              const parsed = JSON.parse(keyData.encrypted_key);
              const { data: encryptorData } = await supabase.from("profiles").select("public_key").eq("id", parsed.encrypted_by).single();
              if (encryptorData?.public_key) {
                const encryptorPub = await importPublicKey(encryptorData.public_key);
                const sharedWithEncryptor = await deriveSharedSecret(myPrivKey, encryptorPub);
                const { decryptGroupKeyFromUser } = await import("../../lib/crypto");
                e2eKeysRef.current.groupSharedSecret = await decryptGroupKeyFromUser(parsed.key, sharedWithEncryptor, new Uint8Array(parsed.iv));
              }
            }
          } else {
            if (currentUserPublicKey) {
              const myPub = await importPublicKey(currentUserPublicKey);
              e2eKeysRef.current.mySharedSecret = await deriveSharedSecret(myPrivKey, myPub);
            }
            if (contactPublicKey) {
              const contactPub = await importPublicKey(contactPublicKey);
              e2eKeysRef.current.receiverSharedSecret = await deriveSharedSecret(myPrivKey, contactPub);
            }
          }
        }
      } catch (e) {
        console.error("Failed to initialize E2EE keys", e);
      }
      await fetchMessages();
    };
    
    initKeysAndFetch();

    // Initialize the global WebSocket channel EXACTLY ONCE for the entire application lifecycle
    if (!sharedChannel) {
      // Handle Next.js Fast Refresh where module state clears but Supabase client retains channels
      const existing = supabase.getChannels().find((c: any) => c.topic === "realtime:global_chat_sync");
      if (existing) {
        supabase.removeChannel(existing);
      }

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
        // Ignore messages from blocked users
        if (blockedUsers.includes(msg.sender_id)) return;
        
        // Only accept messages belonging to this exact chat room
        if (isGroup) {
          if (msg.group_id !== contactId) return;
        } else {
          if (msg.group_id) return;
          if (
            !(msg.sender_id === currentUserId && msg.receiver_id === contactId) &&
            !(msg.sender_id === contactId && msg.receiver_id === currentUserId)
          ) {
            return;
          }
        }
          decryptSingleMessage(msg).then(decryptedMsg => {
            setMessages((prev) => {
              if (prev.some((m) => m.id === decryptedMsg.id)) return prev;
              return [...prev, decryptedMsg];
            });
          });
      }

      if (event === "message_updated" || event === "pg_update") {
        const msg = payload as Message;
        decryptSingleMessage(msg).then(decryptedMsg => {
          setMessages((prev) => prev.map((m) => (m.id === decryptedMsg.id ? decryptedMsg : m)));
        });
      }

      if (event === "messages_read") {
        const { messageIds, read_at } = payload;
        setMessages((prev) => 
          prev.map((m) => messageIds.includes(m.id) ? { ...m, read_at } : m)
        );
      }

      if (event === "presence_sync") {
        if (blockedUsers.includes(contactId)) {
          setIsTyping(false);
          return;
        }
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
  }, [contactId, currentUserId, currentUserPublicKey, contactPublicKey, blockedUsers]);

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
    
    const encryptedContent = await encryptPayload(tempContent);

    const tempId = crypto.randomUUID();
    const tempMessage: Message = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: isGroup ? null as any : contactId,
      group_id: isGroup ? contactId : null,
      content: tempContent, // Optimistically render the plaintext version instantly
      type: "text",
      created_at: new Date().toISOString(),
      reply_to_id: activeReply?.id || null,
      reply_to: activeReply,
    };

    // Clear reply state
    setActiveReply(null);

    // Optimistic UI update (Sender instantly sees plaintext)
    setMessages((prev) => [...prev, tempMessage]);

    // Broadcast instantly to receiver (must broadcast encrypted payload)
    const broadcastMessage = { ...tempMessage, content: encryptedContent };
    
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "new_message",
        payload: broadcastMessage,
      });
    }

    const { error } = await supabase.from("messages").insert([
      {
        id: tempId,
        sender_id: currentUserId,
        receiver_id: isGroup ? null : contactId,
        group_id: isGroup ? contactId : null,
        content: encryptedContent,
        type: "text",
        reply_to_id: tempMessage.reply_to_id,
      },
    ]);

    if (error) {
      console.error("Error sending message:", error);
      // Revert input on failure
      setMessages((prev) => prev.filter(m => m.id !== tempId));
      setNewMessage(tempContent);
    } else {
      // Invoke Push Notification instantly
      supabase.functions.invoke('send-push', {
        body: {
          record: {
            id: tempId,
            sender_id: currentUserId,
            receiver_id: isGroup ? null : contactId,
            group_id: isGroup ? contactId : null,
          }
        }
      }).catch(err => console.error("Push invocation failed", err));

      // Check if we need to call AI
      if (contactId === '00000000-0000-0000-0000-000000000000' || tempContent.includes("@AI")) {
        callAI(tempContent, tempMessage.id);
      }
    }
    setSending(false);
  };

  const callAI = async (prompt: string, replyToId: string | null) => {
    setIsAITyping(true);
    
    // Prepare history
    const history = messages.slice(-10).map(m => ({
      role: m.sender_id === currentUserId ? "user" : "assistant",
      content: m.content
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history })
      });
      const data = await res.json();
      
      let aiResponseText = data.reply;
      
      if (!res.ok || !data.reply) {
        aiResponseText = "⚠️ Sorry, I couldn't connect to my brain. (Check if your GROQ_API_KEY is in .env.local and restart the server!)";
      }

      // We have the AI's reply. Let's insert it!
      let aiEncryptedContent = aiResponseText;
      let finalSenderId = '00000000-0000-0000-0000-000000000000';
      let finalReceiverId = isGroup ? null : currentUserId;
      
      if (isGroup && e2eKeysRef.current.groupSharedSecret) {
        try {
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const forGroup = await encryptMessage(aiResponseText, e2eKeysRef.current.groupSharedSecret, iv);
          aiEncryptedContent = JSON.stringify({ forGroup, iv: Array.from(iv), e2ee: true, isGroup: true, is_ai: true });
        } catch (e) {
          console.error("AI Group encryption failed", e);
        }
      } else if (!isGroup && contactId !== '00000000-0000-0000-0000-000000000000') {
        // 1-on-1 chat with a friend! We must insert as the current user so it stays in the chat room
        finalSenderId = currentUserId;
        finalReceiverId = contactId;
        if (e2eKeysRef.current.mySharedSecret && e2eKeysRef.current.receiverSharedSecret) {
          try {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const forSender = await encryptMessage(aiResponseText, e2eKeysRef.current.mySharedSecret, iv);
            const forReceiver = await encryptMessage(aiResponseText, e2eKeysRef.current.receiverSharedSecret, iv);
            aiEncryptedContent = JSON.stringify({ forSender, forReceiver, iv: Array.from(iv), e2ee: true, is_ai: true });
          } catch (e) {
            console.error("AI 1-on-1 encryption failed", e);
          }
        }
      }

      await supabase.from("messages").insert([{
        sender_id: finalSenderId,
        receiver_id: finalReceiverId,
        group_id: isGroup ? contactId : null,
        content: aiEncryptedContent,
        type: "text",
        reply_to_id: replyToId,
      }]);
    } catch (e) {
      console.error("AI call failed:", e);
    } finally {
      setIsAITyping(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check max size (e.g. 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large! Maximum 5MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadingMedia(true);
    try {
      const buffer = await file.arrayBuffer();
      
      const mySharedSecret = isGroup ? e2eKeysRef.current.groupSharedSecret : e2eKeysRef.current.mySharedSecret;
      if (!mySharedSecret) throw new Error("Encryption key not ready");
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedData = await encryptFile(buffer, mySharedSecret, iv);
      
      // Merge IV and encryptedData
      const finalBuffer = new Uint8Array(12 + encryptedData.byteLength);
      finalBuffer.set(iv, 0);
      finalBuffer.set(new Uint8Array(encryptedData), 12);
      
      const path = `${currentUserId}/media/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
      
      const { error: uploadError } = await supabase.storage.from("voice_notes").upload(path, finalBuffer, {
        contentType: "application/octet-stream"
      });
      
      if (uploadError) throw uploadError;
      
      // Send message
      const tempId = crypto.randomUUID();
      const newMsg: Message = {
        id: tempId,
        sender_id: currentUserId,
        receiver_id: isGroup ? null as any : contactId,
        group_id: isGroup ? contactId : null,
        content: path,
        type: "image",
        created_at: new Date().toISOString(),
        reply_to_id: activeReply?.id || null,
        reply_to: activeReply,
      };
      
      setActiveReply(null);
      setMessages(prev => [...prev, newMsg]);
      
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "new_message",
          payload: newMsg,
        });
      }
      
      const { error: dbError } = await supabase.from("messages").insert([{
        id: tempId,
        sender_id: currentUserId,
        receiver_id: isGroup ? null : contactId,
        group_id: isGroup ? contactId : null,
        content: path,
        type: "image",
        reply_to_id: newMsg.reply_to_id,
      }]);

      if (dbError) throw dbError;
      
      // Invoke Push Notification instantly
      supabase.functions.invoke('send-push', {
        body: {
          record: {
            id: tempId,
            sender_id: currentUserId,
            receiver_id: isGroup ? null : contactId,
            group_id: isGroup ? contactId : null,
          }
        }
      }).catch(err => console.error("Push invocation failed", err));

    } catch (err: any) {
      console.error("Upload failed", err);
      alert("Failed to send media: " + err.message);
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

  // Map wallpaper ID to class
  const getWallpaperClass = () => {
    switch (settings.wallpaper) {
      case "gradient-1": return "bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20";
      case "gradient-2": return "bg-gradient-to-br from-cyan-500/20 to-blue-500/20";
      case "gradient-3": return "bg-gradient-to-br from-orange-500/20 to-red-500/20";
      case "solid-dark": return "bg-[#111]";
      case "solid-light": return "bg-[#f5f5f5]";
      default: return "bg-background";
    }
  };

  return (
    <div className={`flex flex-col h-full relative ${getWallpaperClass()}`}>
      {(settings.customWallpaperUrl || settings.wallpaper.startsWith("http")) && (
        <div 
          className="absolute inset-0 z-0 opacity-30 pointer-events-none bg-cover bg-center" 
          style={{ backgroundImage: `url(${settings.customWallpaperUrl || settings.wallpaper})` }} 
        />
      )}

      {/* WebSocket Debug Indicator (Temporary) */}
      {connectionStatus !== "SUBSCRIBED" && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-lg font-bold">
          SOCKET: {connectionStatus}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages yet. Say hi!
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === currentUserId && !msg.is_ai;
            // Hide message if deleted for this user
            if (msg.deleted_for_users?.includes(currentUserId)) return null;

            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                currentUserId={currentUserId}
                isMine={isMine}
                activeMessageId={activeMessageId}
                e2eKeysRef={e2eKeysRef}
                setActiveReply={setActiveReply}
                setActiveMessageId={setActiveMessageId}
                handleReaction={handleReaction}
                handleDeleteForMe={handleDeleteForMe}
                handleDeleteForEveryone={handleDeleteForEveryone}
                formatTime={formatTime}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white dark:bg-[#151515] border-t border-border relative">
        {/* Presence Typing Indicator */}
        <div 
          className={`flex gap-2 items-center text-xs text-muted-foreground transition-all duration-300 absolute bottom-4 left-6 ${
            isTyping || isAITyping ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
          }`}
        >
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span>{isAITyping ? "AI is typing..." : "typing..."}</span>
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
                        : activeReply.decryptionFailed
                        ? "🔒 Encrypted (Key missing)"
                        : activeReply.type === "audio" 
                        ? "🎤 Audio Message" 
                        : activeReply.content}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveReply(null)}
                    aria-label="Cancel reply"
                    className="w-6 h-6 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors shrink-0"
                  >
                    <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 w-full">
            <div className="relative shrink-0 hidden sm:block">
              {myAvatarUrl ? (
                <img src={myAvatarUrl} alt="My Avatar" className="w-10 h-10 rounded-full object-cover border border-border shadow-sm" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-border shadow-sm">
                  <User className="w-5 h-5 text-primary" />
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
            </div>
            
            <input 
              type="file" 
              accept="image/*,video/*,application/pdf"
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingMedia}
              aria-label="Attach media"
              className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-input hover:text-foreground transition-all shrink-0 disabled:opacity-50"
            >
              {uploadingMedia ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>
            <input
              type="text"
              className="flex-1 bg-input border border-border rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-[15px]"
              placeholder="Type a message..."
              value={newMessage}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (!settings.sendOnEnter && !e.shiftKey) {
                    e.preventDefault();
                  } else if (!settings.sendOnEnter && e.shiftKey) {
                    e.preventDefault();
                    if (newMessage.trim()) {
                      const form = e.currentTarget.closest("form");
                      if (form) form.requestSubmit();
                    }
                  } else if (settings.sendOnEnter && !e.shiftKey) {
                  } else if (settings.sendOnEnter && e.shiftKey) {
                    e.preventDefault();
                  }
                }
              }}
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
              aria-label="Send message"
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
